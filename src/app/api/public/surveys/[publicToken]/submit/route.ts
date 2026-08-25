import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluateSurveySubmission } from "@/lib/survey-engine";
import { AnswerSubmission } from "@/lib/types";
import { ResponseStatus, SurveyStatus } from "@prisma/client";
import {
  checkSurveyCollectionEligibility,
  DomainEligibilityError,
} from "@/lib/survey-lifecycle";
import {
  hashClientIp,
  validateIdempotencyKey,
  calculateFillingDuration,
  extractClientIp,
} from "@/lib/submission-integrity";

export const dynamic = "force-dynamic";

/**
 * 公開問卷提交 API (Public Survey Submission)
 * - 支援客戶端 Idempotency-Key 冪等金鑰防重複提交與網路重試重放 (Fast-path Idempotency Replay)
 * - 支援 IP 單向雜湊隱私審計 (HMAC-SHA256)、User-Agent 與填答耗時計算
 * - 事務內以 SELECT FOR UPDATE 行級排他鎖保護配額與狀態，保證高並行零超額
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { publicToken: string } }
) {
  try {
    const { publicToken } = params;

    if (!publicToken || publicToken.trim().length === 0) {
      return NextResponse.json(
        { error: "無效的公開問卷標識 (Public Token Invalid)" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const responseId = body.responseId as string | undefined;
    const answersInput = (body.answers || []) as AnswerSubmission[];

    // 擷取並檢驗冪等金鑰 (支援 Header 或 Body)
    const rawIdempotencyKey =
      req.headers.get("idempotency-key") ||
      req.headers.get("x-idempotency-key") ||
      body.idempotencyKey;
    let idempotencyKey: string | null = null;

    if (rawIdempotencyKey) {
      if (!validateIdempotencyKey(rawIdempotencyKey)) {
        return NextResponse.json(
          {
            error: "INVALID_IDEMPOTENCY_KEY",
            message: "冪等金鑰格式無效，長度須介於 8 ~ 64 字元且僅含英數連字號。",
          },
          { status: 400 }
        );
      }
      idempotencyKey = rawIdempotencyKey.trim();
    }

    // 取得問卷與題目設定
    const survey = await db.survey.findUnique({
      where: { publicToken },
      include: {
        _count: {
          select: { responses: true },
        },
        questions: {
          orderBy: { orderNum: "asc" },
          include: {
            choices: {
              orderBy: { orderNum: "asc" },
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

    // 1. 快速冪等重放檢查 (Fast-path Replay Check)
    if (idempotencyKey) {
      const existingIdempotent = await db.response.findUnique({
        where: { idempotencyKey },
        select: { id: true, surveyId: true, status: true },
      });

      if (existingIdempotent && existingIdempotent.surveyId === survey.id) {
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

    // 2. 預先檢查 (Fast-path Eligibility Check)
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
    const ipHash = hashClientIp(clientIp);
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

      // 事務內計算最新已完成作答數量（防止高並行超出配額）
      const completedCount = await tx.response.count({
        where: {
          surveyId: survey.id,
          status: ResponseStatus.COMPLETED,
          ...(responseId ? { NOT: { id: responseId } } : {}),
        },
      });

      const txEligibility = checkSurveyCollectionEligibility(
        liveSurvey,
        completedCount
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
            ipHash,
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
            ipHash,
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
      const inputMap = new Map(answersInput.map((a) => [a.questionCode, a]));

      for (const qResult of evaluation.questionResults) {
        if (!qResult.isVisible) continue;

        const qRecord = qMap.get(qResult.questionCode);
        if (!qRecord) continue;
        const sub = inputMap.get(qResult.questionCode);

        const createdAnswer = await tx.answer.create({
          data: {
            responseId: response.id,
            questionId: qRecord.id,
            rawValue: JSON.stringify(sub?.rawValue ?? null),
            otherText: sub?.otherText || null,
            score: qResult.score,
          },
        });

        // 若為選擇題型，儲存關聯的 answer_choices
        if (
          ["single_choice", "multiple_choice", "yes_no"].includes(qRecord.questionType) &&
          qRecord.choices.length > 0
        ) {
          const rawVal = sub?.rawValue;
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

    return NextResponse.json({
      success: true,
      message: "問卷提交成功",
      responseId: savedResponse.id,
    });
  } catch (error: any) {
    // 捕獲高並行同冪等鍵並行競爭之 Unique Constraint
    if (error?.code === "P2002" && error?.meta?.target?.includes("idempotency_key")) {
      const rawIdempotencyKey =
        req.headers.get("idempotency-key") ||
        req.headers.get("x-idempotency-key");
      if (rawIdempotencyKey) {
        const winningResponse = await db.response.findUnique({
          where: { idempotencyKey: rawIdempotencyKey.trim() },
        });
        if (winningResponse) {
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
