import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SurveyStatus, ResponseStatus } from "@prisma/client";
import { evaluateSurveySubmission } from "@/lib/survey-engine";
import {
  checkSurveyCollectionEligibility,
  DomainEligibilityError,
} from "@/lib/survey-lifecycle";
import {
  hashClientIp,
  validateIdempotencyKey,
  calculateFillingDuration,
  extractClientIp,
  calculatePayloadHash,
} from "@/lib/submission-integrity";

export async function POST(
  req: NextRequest,
  { params }: { params: { publicToken: string } }
) {
  let idempotencyKey: string | undefined;
  let currentPayloadHash: string = "";
  let surveyIdForError: string | undefined;

  try {
    const { publicToken } = params;
    const body = await req.json();
    const { responseId, answers } = body;

    // 解析 Header 或 Body 中的 Idempotency-Key
    const rawIdempotencyKey =
      req.headers.get("idempotency-key") ||
      req.headers.get("x-idempotency-key") ||
      body.idempotencyKey;

    if (rawIdempotencyKey) {
      if (!validateIdempotencyKey(rawIdempotencyKey)) {
        return NextResponse.json(
          {
            error: "INVALID_IDEMPOTENCY_KEY",
            message: "冪等金鑰格式不符 (長度需介於 8~128 字元，僅支援英數字、底線與連字號)",
          },
          { status: 400 }
        );
      }
      idempotencyKey = rawIdempotencyKey.trim();
    }

    currentPayloadHash = calculatePayloadHash(answers || []);

    if (!publicToken || publicToken.trim() === "") {
      return NextResponse.json(
        { error: "INVALID_PUBLIC_TOKEN", message: "請提供有效的問卷 Public Token" },
        { status: 400 }
      );
    }

    const survey = await db.survey.findUnique({
      where: { publicToken: publicToken.trim() },
      include: {
        questions: {
          orderBy: { orderNum: "asc" },
          include: {
            choices: {
              orderBy: { orderNum: "asc" },
            },
          },
        },
        _count: {
          select: {
            responses: {
              where: {
                status: {
                  in: [ResponseStatus.COMPLETED, ResponseStatus.EXCLUDED],
                },
              },
            },
          },
        },
      },
    });

    if (!survey || survey.status !== SurveyStatus.PUBLISHED) {
      return NextResponse.json(
        { error: "找不到該公開問卷或問卷目前未開放填答" },
        { status: 404 }
      );
    }

    surveyIdForError = survey.id;

    // 1. 快速冪等重放檢查 (Fast-path Replay Check - Scoped to Survey)
    if (idempotencyKey) {
      const existingIdempotent = await db.response.findUnique({
        where: {
          surveyId_idempotencyKey: {
            surveyId: survey.id,
            idempotencyKey,
          },
        },
        select: {
          id: true,
          surveyId: true,
          status: true,
          payloadHash: true,
        },
      });

      if (existingIdempotent) {
        // 若 Key 相同但 Payload 內容不同，回傳 409 Conflict 禁止篡改
        if (
          existingIdempotent.payloadHash &&
          existingIdempotent.payloadHash !== currentPayloadHash
        ) {
          return NextResponse.json(
            {
              error: "IDEMPOTENCY_KEY_REUSE",
              message: "冪等金鑰已被使用於不同的作答內容，禁止重複使用",
            },
            { status: 409 }
          );
        }

        if (existingIdempotent.status === ResponseStatus.COMPLETED) {
          return NextResponse.json(
            {
              success: true,
              message: "問卷提交成功 (冪等重放)",
              responseId: existingIdempotent.id,
              replayed: true,
            },
            {
              status: 200,
              headers: { "Idempotent-Replayed": "true" },
            }
          );
        }
      }
    }

    // 2. 預先檢查配額與排程 (Fast-path Eligibility Check)
    const initialEligibility = checkSurveyCollectionEligibility(
      {
        status: survey.status,
        startDate: survey.startDate,
        endDate: survey.endDate,
        responseQuota: survey.responseQuota,
      },
      survey._count.responses
    );

    if (!initialEligibility.eligible) {
      return NextResponse.json(
        {
          error: initialEligibility.code,
          message: initialEligibility.message,
        },
        { status: 403 }
      );
    }

    // 格式化 questions 物件給 survey-engine 運算
    const engineQuestions = survey.questions.map((q) => ({
      id: q.id,
      orderNum: q.orderNum,
      code: q.code,
      title: q.title,
      description: q.description,
      questionType: q.questionType,
      required: q.required,
      scoringEnabled: q.scoringEnabled,
      reverseScore: q.reverseScore,
      visibilityHint: q.visibilityHint,
      visibilityRules: q.visibilityRules
        ? typeof q.visibilityRules === "string"
          ? JSON.parse(q.visibilityRules)
          : q.visibilityRules
        : null,
      minSelections: q.minSelections,
      maxSelections: q.maxSelections,
      minValue: q.minValue,
      maxValue: q.maxValue,
      choices: q.choices.map((c) => ({
        id: c.id,
        orderNum: c.orderNum,
        label: c.label,
        value: c.value,
        scoreEnabled: c.scoreEnabled,
        score: c.score,
        isOther: c.isOther,
        requiresText: c.requiresText,
        isNoneOfAbove: c.isNoneOfAbove,
      })),
    }));

    const answersInput = (answers || []).map((a: any) => ({
      questionCode: a.questionCode,
      rawValue: a.rawValue !== undefined ? a.rawValue : a.value,
      otherText: a.otherText,
    }));

    // 執行核心防呆、條件跳題與計分驗證
    const evaluation = evaluateSurveySubmission(engineQuestions, answersInput);

    if (!evaluation.isValid) {
      return NextResponse.json(
        {
          error: "作答檢核未通過，請檢查填寫項目",
          errors: evaluation.errors,
        },
        { status: 422 }
      );
    }

    // 擷取客戶端審計與隱私資訊
    const clientIp = extractClientIp(req);
    const { hash: ipHash, version: ipHashVersion } = hashClientIp(clientIp);
    const userAgent = req.headers.get("user-agent") || null;
    const now = new Date();
    const durationSeconds = calculateFillingDuration(body.startedAt, now);
    const startedAt = body.startedAt ? new Date(body.startedAt) : null;

    // 3. 事務內寫入/更新 Response (設為 COMPLETED) 與 Answers，並進行原子排他鎖守衛
    const savedResponse = await db.$transaction(async (tx) => {
      // 事務內以 FOR UPDATE 行級排他鎖鎖定問卷記錄
      await tx.$queryRaw`SELECT id, status FROM surveys WHERE id = ${survey.id} FOR UPDATE`;

      const liveSurvey = await tx.survey.findUnique({
        where: { id: survey.id },
        select: {
          status: true,
          startDate: true,
          endDate: true,
          responseQuota: true,
        },
      });

      if (!liveSurvey || liveSurvey.status !== SurveyStatus.PUBLISHED) {
        throw new DomainEligibilityError(
          "NOT_PUBLISHED",
          "此問卷目前未開放填答或已變更狀態"
        );
      }

      // 事務內計算累計有效作答數（包含 COMPLETED 與 EXCLUDED，排除不回收配額）
      const acceptedCount = await tx.response.count({
        where: {
          surveyId: survey.id,
          status: { in: [ResponseStatus.COMPLETED, ResponseStatus.EXCLUDED] },
          ...(responseId ? { NOT: { id: responseId } } : {}),
        },
      });

      const txEligibility = checkSurveyCollectionEligibility(
        liveSurvey,
        acceptedCount
      );

      if (!txEligibility.eligible) {
        throw new DomainEligibilityError(
          txEligibility.code || "NOT_PUBLISHED",
          txEligibility.message || "問卷未開放填答"
        );
      }

      let response;

      if (responseId) {
        const existingDraft = await tx.response.findUnique({
          where: { id: responseId },
        });

        if (!existingDraft || existingDraft.surveyId !== survey.id) {
          throw new Error("無效的作答草稿記錄 (Cross-survey Draft ID Invalid)");
        }

        // 更新現有草稿為正式提交
        response = await tx.response.update({
          where: { id: responseId },
          data: {
            status: ResponseStatus.COMPLETED,
            idempotencyKey: idempotencyKey || undefined,
            payloadHash: currentPayloadHash || undefined,
            ipHash,
            ipHashVersion,
            userAgent,
            durationSeconds,
            startedAt: startedAt || existingDraft.startedAt,
            totalScore: evaluation.totalScore,
            maxScore: evaluation.maxScore,
            percentage: evaluation.percentage,
            submittedAt: now,
          },
        });
        // 清理舊答案再重新寫入
        await tx.answer.deleteMany({ where: { responseId: response.id } });
      } else {
        // 全新提交
        response = await tx.response.create({
          data: {
            surveyId: survey.id,
            version: survey.version,
            status: ResponseStatus.COMPLETED,
            idempotencyKey,
            payloadHash: currentPayloadHash,
            ipHash,
            ipHashVersion,
            userAgent,
            durationSeconds,
            startedAt,
            totalScore: evaluation.totalScore,
            maxScore: evaluation.maxScore,
            percentage: evaluation.percentage,
            submittedAt: now,
          },
        });
      }

      const qMap = new Map(survey.questions.map((q) => [q.code, q]));
      const inputMap = new Map<string, any>(answersInput.map((a: any) => [a.questionCode, a]));

      for (const qResult of evaluation.questionResults) {
        if (!qResult.isVisible) continue;

        const qRecord = qMap.get(qResult.questionCode);
        if (!qRecord) continue;
        const sub = inputMap.get(qResult.questionCode);
        const actualValue =
          sub?.value !== undefined
            ? sub.value
            : sub?.rawValue !== undefined
            ? sub.rawValue
            : null;

        const createdAnswer = await tx.answer.create({
          data: {
            responseId: response.id,
            questionId: qRecord.id,
            rawValue: JSON.stringify(actualValue),
            otherText: sub?.otherText || null,
            score: qResult.score,
          },
        });

        // 若為選擇題型，儲存關聯的 answer_choices
        if (
          ["single_choice", "multiple_choice", "yes_no"].includes(qRecord.questionType) &&
          qRecord.choices.length > 0
        ) {
          const rawVal = actualValue;
          const selectedValues = Array.isArray(rawVal)
            ? rawVal.map(String)
            : rawVal !== null && rawVal !== undefined
            ? [String(rawVal)]
            : [];
          const matchedChoiceIds = qRecord.choices
            .filter((c) => selectedValues.includes(c.value))
            .map((c) => c.id);

          if (matchedChoiceIds.length > 0) {
            await tx.answerChoice.createMany({
              data: matchedChoiceIds.map((cid) => ({
                answerId: createdAnswer.id,
                choiceId: cid,
              })),
              skipDuplicates: true,
            });
          }
        }
      }

      return response;
    });

    return NextResponse.json(
      {
        success: true,
        message: "問卷提交成功",
        responseId: savedResponse.id,
        replayed: false,
      },
      {
        status: 200,
        headers: { "Idempotent-Replayed": "false" },
      }
    );
  } catch (error: any) {
    // 捕獲高並行同 (surveyId, idempotencyKey) 並行競爭之 Unique Constraint
    if (
      error?.code === "P2002" &&
      idempotencyKey &&
      surveyIdForError
    ) {
      const winningResponse = await db.response.findUnique({
        where: {
          surveyId_idempotencyKey: {
            surveyId: surveyIdForError,
            idempotencyKey,
          },
        },
      });

      if (winningResponse) {
        if (
          winningResponse.payloadHash &&
          winningResponse.payloadHash !== currentPayloadHash
        ) {
          return NextResponse.json(
            {
              error: "IDEMPOTENCY_KEY_REUSE",
              message: "冪等金鑰已被使用於不同的作答內容，禁止重複使用",
            },
            { status: 409 }
          );
        }

        return NextResponse.json(
          {
            success: true,
            message: "問卷提交成功 (並行冪等重放)",
            responseId: winningResponse.id,
            replayed: true,
          },
          {
            status: 200,
            headers: { "Idempotent-Replayed": "true" },
          }
        );
      }
    }

    if (error instanceof DomainEligibilityError || error?.name === "DomainEligibilityError") {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 403 }
      );
    }

    console.error("[Public Survey Submit Error]:", error);
    return NextResponse.json(
      { error: "問卷提交失敗，請稍後再試", details: error.message },
      { status: 500 }
    );
  }
}
