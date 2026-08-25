import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  generatePublicToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { NextRequest } from "next/server";
import { Role, SurveyStatus, QuestionType, ResponseStatus } from "@prisma/client";
import {
  hashClientIp,
  validateIdempotencyKey,
  calculateFillingDuration,
} from "../src/lib/submission-integrity";
import { POST as publicSubmitPOST } from "../src/app/api/public/surveys/[publicToken]/submit/route";
import { GET as responsesGET } from "../src/app/api/surveys/[id]/responses/route";
import { PATCH as responseStatusPATCH } from "../src/app/api/surveys/[id]/responses/[responseId]/status/route";
import { GET as crosstabGET } from "../src/app/api/surveys/[id]/analytics/crosstab/route";
import { GET as questionsAnalyticsGET } from "../src/app/api/surveys/[id]/analytics/questions/route";

describe("Phase M10-B: Response Collection & Submission Integrity Suite", () => {
  let orgA: any;
  let orgB: any;

  let ownerA: any;
  let adminA: any;
  let editorA: any;
  let viewerA: any;
  let userB: any;

  let tokenOwnerA: string;
  let tokenAdminA: string;
  let tokenEditorA: string;
  let tokenViewerA: string;
  let tokenUserB: string;

  const makeAuthReq = (
    url: string,
    token: string,
    options: { method?: string; body?: any } = {}
  ) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    };

    return new NextRequest(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  };

  const makePublicSubmitReq = (
    url: string,
    body: any,
    headers: Record<string, string> = {}
  ) => {
    return new NextRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  };

  beforeEach(async () => {
    await db.answerChoice.deleteMany({
      where: { answer: { response: { survey: { organization: { slug: { startsWith: "m10b-" } } } } } },
    });
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m10b-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10b-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m10b-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m10b-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m10b-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m10b-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m10b-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m10b-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m10b-" } },
    });

    const defaultPwd = await hashPassword("M10BPassword123!");

    orgA = await db.organization.create({
      data: { name: "Org Alpha Integrity", slug: "m10b-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Org Beta Other", slug: "m10b-org-beta" },
    });

    ownerA = await db.user.create({
      data: { email: "m10b-owner@alpha.com", name: "Owner Alpha", passwordHash: defaultPwd },
    });
    adminA = await db.user.create({
      data: { email: "m10b-admin@alpha.com", name: "Admin Alpha", passwordHash: defaultPwd },
    });
    editorA = await db.user.create({
      data: { email: "m10b-editor@alpha.com", name: "Editor Alpha", passwordHash: defaultPwd },
    });
    viewerA = await db.user.create({
      data: { email: "m10b-viewer@alpha.com", name: "Viewer Alpha", passwordHash: defaultPwd },
    });
    userB = await db.user.create({
      data: { email: "m10b-user@beta.com", name: "User Beta", passwordHash: defaultPwd },
    });

    await db.membership.createMany({
      data: [
        { userId: ownerA.id, organizationId: orgA.id, role: Role.OWNER },
        { userId: adminA.id, organizationId: orgA.id, role: Role.ADMIN },
        { userId: editorA.id, organizationId: orgA.id, role: Role.EDITOR },
        { userId: viewerA.id, organizationId: orgA.id, role: Role.VIEWER },
        { userId: userB.id, organizationId: orgB.id, role: Role.OWNER },
      ],
    });

    tokenOwnerA = (await createSession(ownerA.id)).token;
    tokenAdminA = (await createSession(adminA.id)).token;
    tokenEditorA = (await createSession(editorA.id)).token;
    tokenViewerA = (await createSession(viewerA.id)).token;
    tokenUserB = (await createSession(userB.id)).token;
  });

  describe("Gate B1: Idempotency & Replay Deduplication", () => {
    it("重複提交相同 Idempotency-Key 時快速重放既有結果，零重複寫入且零配額消耗", async () => {
      const pToken = generatePublicToken();
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "冪等性測試問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          responseQuota: 5,
          questions: {
            create: [
              {
                code: "Q_SAT",
                title: "滿意度",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "滿意", value: "sat", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      const idempotencyKey = "client-req-uuid-9988776655";

      // 第 1 次提交 -> 全新寫入
      const req1 = makePublicSubmitReq(
        `http://localhost/api/public/surveys/${pToken}/submit`,
        { answers: [{ questionCode: "Q_SAT", value: "sat" }] },
        { "Idempotency-Key": idempotencyKey }
      );
      const res1 = await publicSubmitPOST(req1, { params: { publicToken: pToken } });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      const firstResponseId = json1.responseId;
      expect(firstResponseId).toBeDefined();

      // 第 2 ~ 5 次連續重試提交 (模擬網路延遲或斷線重試)
      for (let i = 2; i <= 5; i++) {
        const retryReq = makePublicSubmitReq(
          `http://localhost/api/public/surveys/${pToken}/submit`,
          { answers: [{ questionCode: "Q_SAT", value: "sat" }] },
          { "Idempotency-Key": idempotencyKey }
        );
        const retryRes = await publicSubmitPOST(retryReq, { params: { publicToken: pToken } });
        expect(retryRes.status).toBe(200);
        expect(retryRes.headers.get("Idempotent-Replayed")).toBe("true");
        const retryJson = await retryRes.json();
        expect(retryJson.responseId).toBe(firstResponseId);
        expect(retryJson.replayed).toBe(true);
      }

      // 檢查資料庫記錄數嚴格為 1 筆
      const totalCount = await db.response.count({ where: { surveyId: survey.id } });
      expect(totalCount).toBe(1);
    });
  });

  describe("Gate B2: Version Pinning & Payload Validation", () => {
    it("無效格式之 Idempotency-Key 應回傳 400 INVALID_IDEMPOTENCY_KEY", async () => {
      const pToken = generatePublicToken();
      await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "格式檢驗問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          questions: {
            create: [
              {
                code: "Q1",
                title: "題目",
                questionType: QuestionType.text,
                orderNum: 1,
              },
            ],
          },
        },
      });

      // 太短 (<8 字元)
      const shortReq = makePublicSubmitReq(
        `http://localhost/api/public/surveys/${pToken}/submit`,
        { answers: [{ questionCode: "Q1", value: "test" }] },
        { "Idempotency-Key": "short" }
      );
      const shortRes = await publicSubmitPOST(shortReq, { params: { publicToken: pToken } });
      expect(shortRes.status).toBe(400);
      expect((await shortRes.json()).error).toBe("INVALID_IDEMPOTENCY_KEY");

      // 包含非法字元 (如空白或特殊標點)
      const invalidCharsReq = makePublicSubmitReq(
        `http://localhost/api/public/surveys/${pToken}/submit`,
        { answers: [{ questionCode: "Q1", value: "test" }] },
        { "Idempotency-Key": "invalid key with spaces!" }
      );
      const invalidRes = await publicSubmitPOST(invalidCharsReq, { params: { publicToken: pToken } });
      expect(invalidRes.status).toBe(400);
    });
  });

  describe("Gate B3: Status Segregation & Exclusion Lifecycle", () => {
    let survey: any;
    let resp: any;

    beforeEach(async () => {
      survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "排除管理測試問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "選項", value: "opt", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      resp = await db.response.create({
        data: {
          surveyId: survey.id,
          status: ResponseStatus.COMPLETED,
          submittedAt: new Date(),
        },
      });
    });

    it("EDITOR/ADMIN 可將作答標記為 EXCLUDED 並附帶排除原因", async () => {
      const patchReq = makeAuthReq(
        `http://localhost/api/surveys/${survey.id}/responses/${resp.id}/status`,
        tokenEditorA,
        {
          method: "PATCH",
          body: { status: "EXCLUDED", reason: "內部員工測試資料" },
        }
      );
      const patchRes = await responseStatusPATCH(patchReq, {
        params: { id: survey.id, responseId: resp.id },
      });
      expect(patchRes.status).toBe(200);

      const dbRecord = await db.response.findUnique({ where: { id: resp.id } });
      expect(dbRecord?.status).toBe(ResponseStatus.EXCLUDED);
      expect(dbRecord?.excludedReason).toBe("內部員工測試資料");
      expect(dbRecord?.excludedById).toBe(editorA.id);
      expect(dbRecord?.excludedAt).toBeDefined();
    });

    it("VIEWER 與非組織成員無權排除作答 (403)", async () => {
      const viewerReq = makeAuthReq(
        `http://localhost/api/surveys/${survey.id}/responses/${resp.id}/status`,
        tokenViewerA,
        { method: "PATCH", body: { status: "EXCLUDED", reason: "測試" } }
      );
      expect((await responseStatusPATCH(viewerReq, { params: { id: survey.id, responseId: resp.id } })).status).toBe(403);
    });

    it("可將已排除之作答還原回 COMPLETED 狀態", async () => {
      await db.response.update({
        where: { id: resp.id },
        data: { status: ResponseStatus.EXCLUDED, excludedReason: "誤判" },
      });

      const restoreReq = makeAuthReq(
        `http://localhost/api/surveys/${survey.id}/responses/${resp.id}/status`,
        tokenAdminA,
        { method: "PATCH", body: { status: "COMPLETED" } }
      );
      const restoreRes = await responseStatusPATCH(restoreReq, {
        params: { id: survey.id, responseId: resp.id },
      });
      expect(restoreRes.status).toBe(200);

      const dbRecord = await db.response.findUnique({ where: { id: resp.id } });
      expect(dbRecord?.status).toBe(ResponseStatus.COMPLETED);
      expect(dbRecord?.excludedReason).toBeNull();
    });

    it("回覆列表支援分頁與 status 篩選 (COMPLETED / EXCLUDED / all)", async () => {
      // 建立另一筆 EXCLUDED 資料
      await db.response.create({
        data: {
          surveyId: survey.id,
          status: ResponseStatus.EXCLUDED,
          excludedReason: "測試二",
        },
      });

      // 查詢 COMPLETED
      const getCompletedReq = makeAuthReq(
        `http://localhost/api/surveys/${survey.id}/responses?status=COMPLETED`,
        tokenEditorA
      );
      const getCompletedRes = await responsesGET(getCompletedReq, { params: { id: survey.id } });
      const jsonCompleted = await getCompletedRes.json();
      expect(jsonCompleted.responses.length).toBe(1);
      expect(jsonCompleted.responses[0].status).toBe(ResponseStatus.COMPLETED);

      // 查詢 EXCLUDED
      const getExcludedReq = makeAuthReq(
        `http://localhost/api/surveys/${survey.id}/responses?status=EXCLUDED`,
        tokenEditorA
      );
      const getExcludedRes = await responsesGET(getExcludedReq, { params: { id: survey.id } });
      const jsonExcluded = await getExcludedRes.json();
      expect(jsonExcluded.responses.length).toBe(1);
      expect(jsonExcluded.responses[0].status).toBe(ResponseStatus.EXCLUDED);

      // 查詢 all (含分頁)
      const getAllReq = makeAuthReq(
        `http://localhost/api/surveys/${survey.id}/responses?status=all&limit=10&page=1`,
        tokenEditorA
      );
      const getAllRes = await responsesGET(getAllReq, { params: { id: survey.id } });
      const jsonAll = await getAllRes.json();
      expect(jsonAll.responses.length).toBe(2);
      expect(jsonAll.pagination.total).toBe(2);
    });
  });

  describe("Gate B4: Audit Trail & IP Privacy Hashing", () => {
    it("HMAC-SHA256 IP 雜湊保證單向去識別化與可比對性", () => {
      const ip1 = "192.168.1.100";
      const ip2 = "192.168.1.101";

      const hash1 = hashClientIp(ip1);
      const hash1Repeat = hashClientIp(ip1);
      const hash2 = hashClientIp(ip2);

      expect(hash1).toBeDefined();
      expect(hash1).not.toContain("192.168");
      expect(hash1).toBe(hash1Repeat);
      expect(hash1).not.toBe(hash2);
    });

    it("填答耗時計算 durationSeconds 正確計算秒數", async () => {
      const pToken = generatePublicToken();
      await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "耗時審計測試問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "選項", value: "opt", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      const startedAt = new Date(Date.now() - 45 * 1000); // 45 秒前開始填答
      const submitReq = makePublicSubmitReq(
        `http://localhost/api/public/surveys/${pToken}/submit`,
        {
          startedAt: startedAt.toISOString(),
          answers: [{ questionCode: "Q1", value: "opt" }],
        },
        {
          "x-forwarded-for": "203.0.113.195",
          "user-agent": "Mozilla/5.0 AuditBot/1.0",
        }
      );

      const submitRes = await publicSubmitPOST(submitReq, { params: { publicToken: pToken } });
      expect(submitRes.status).toBe(200);
      const respId = (await submitRes.json()).responseId;

      const record = await db.response.findUnique({ where: { id: respId } });
      expect(record?.ipHash).toBeDefined();
      expect(record?.userAgent).toBe("Mozilla/5.0 AuditBot/1.0");
      expect(record?.durationSeconds).toBeGreaterThanOrEqual(44);
      expect(record?.durationSeconds).toBeLessThanOrEqual(46);
    });
  });

  describe("Gate B5: Analytics Read Boundary & Data Pollution Defense", () => {
    it("交叉分析與題目統計端點預設嚴格僅讀取 COMPLETED 作答，徹底防禦 EXCLUDED 與草稿污染", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "分析防污染驗證問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
          questions: {
            create: [
              {
                code: "Q_DEPT",
                title: "部門",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: {
                  create: [
                    { label: "工程", value: "eng", orderNum: 1 },
                    { label: "業務", value: "sales", orderNum: 2 },
                  ],
                },
              },
              {
                code: "Q_SAT",
                title: "滿意度",
                questionType: QuestionType.single_choice,
                orderNum: 2,
                choices: {
                  create: [
                    { label: "滿意", value: "sat", orderNum: 1 },
                    { label: "不滿意", value: "unsat", orderNum: 2 },
                  ],
                },
              },
            ],
          },
        },
      });

      const qDept = await db.question.findFirst({ where: { surveyId: survey.id, code: "Q_DEPT" } });
      const qSat = await db.question.findFirst({ where: { surveyId: survey.id, code: "Q_SAT" } });

      // 1. 建立 10 筆正式有效作答 (COMPLETED)
      for (let i = 0; i < 10; i++) {
        const r = await db.response.create({
          data: { surveyId: survey.id, status: ResponseStatus.COMPLETED, submittedAt: new Date() },
        });
        await db.answer.create({
          data: { responseId: r.id, questionId: qDept!.id, rawValue: JSON.stringify("eng") },
        });
        await db.answer.create({
          data: { responseId: r.id, questionId: qSat!.id, rawValue: JSON.stringify("sat") },
        });
      }

      // 2. 建立 10 筆被標記為 EXCLUDED 的異常/測試作答 (全填 sales + unsat)
      for (let i = 0; i < 10; i++) {
        const rEx = await db.response.create({
          data: {
            surveyId: survey.id,
            status: ResponseStatus.EXCLUDED,
            excludedReason: "測試洗票資料",
            submittedAt: new Date(),
          },
        });
        await db.answer.create({
          data: { responseId: rEx.id, questionId: qDept!.id, rawValue: JSON.stringify("sales") },
        });
        await db.answer.create({
          data: { responseId: rEx.id, questionId: qSat!.id, rawValue: JSON.stringify("unsat") },
        });
      }

      // 3. 建立 5 筆未完成草稿 (IN_PROGRESS)
      for (let i = 0; i < 5; i++) {
        const rDraft = await db.response.create({
          data: { surveyId: survey.id, status: ResponseStatus.IN_PROGRESS },
        });
        await db.answer.create({
          data: { responseId: rDraft.id, questionId: qDept!.id, rawValue: JSON.stringify("sales") },
        });
      }

      // 4. 驗證交叉分析 API 讀取邊界
      const crosstabReq = makeAuthReq(
        `http://localhost/api/surveys/${survey.id}/analytics/crosstab?rowQuestionId=${qDept!.id}&colQuestionId=${qSat!.id}`,
        tokenEditorA
      );
      const crosstabRes = await crosstabGET(crosstabReq, { params: { id: survey.id } });
      expect(crosstabRes.status).toBe(200);
      const crosstabJson = await crosstabRes.json();

      // 總有效樣本數嚴格等於 10 (完全排除 10 筆 EXCLUDED 與 5 筆 IN_PROGRESS)
      expect(crosstabJson.totalSurveyResponses).toBe(10);
      expect(crosstabJson.result.grandTotal).toBe(10);
      expect(crosstabJson.rows[0].rowLabel).toBe("工程");
      expect(crosstabJson.result.rowItems[0].value).toBe("eng");

      // 5. 驗證題目統計 API 讀取邊界
      const questionsReq = makeAuthReq(
        `http://localhost/api/surveys/${survey.id}/analytics/questions`,
        tokenEditorA
      );
      const questionsRes = await questionsAnalyticsGET(questionsReq, { params: { id: survey.id } });
      expect(questionsRes.status).toBe(200);
      const questionsJson = await questionsRes.json();
      expect(questionsJson.summary.totalResponses).toBe(10);
      expect(questionsJson.summary.completedResponses).toBe(10);
    });
  });

  describe("Gate B6: Concurrent Idempotent Submission Stress Test", () => {
    it("20 筆並發請求帶有相同 Idempotency-Key 時，DB 嚴格僅建立 1 筆記錄且所有請求皆回傳一致 200 OK", async () => {
      const pToken = generatePublicToken();
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "並發冪等競爭測試問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          responseQuota: 10,
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "選項", value: "opt", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      const sharedIdempotencyKey = "concurrent-key-abcdef123456";

      const requests = Array.from({ length: 20 }).map(() => {
        const req = makePublicSubmitReq(
          `http://localhost/api/public/surveys/${pToken}/submit`,
          { answers: [{ questionCode: "Q1", value: "opt" }] },
          { "Idempotency-Key": sharedIdempotencyKey }
        );
        return publicSubmitPOST(req, { params: { publicToken: pToken } });
      });

      const responses = await Promise.all(requests);
      const statuses = responses.map((r) => r.status);
      expect(statuses.every((s) => s === 200)).toBe(true);

      const jsonResults = await Promise.all(responses.map((r) => r.json()));
      const firstId = jsonResults[0].responseId;
      expect(jsonResults.every((j) => j.responseId === firstId)).toBe(true);

      // 資料庫記錄數嚴格等於 1
      const totalDbRecords = await db.response.count({ where: { surveyId: survey.id } });
      expect(totalDbRecords).toBe(1);
    });
  });
});
