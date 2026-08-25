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
  normalizeIp,
  hashClientIp,
  validateIdempotencyKey,
  calculatePayloadHash,
  calculateFillingDuration,
} from "../src/lib/submission-integrity";
import { POST as publicSubmitPOST } from "../src/app/api/public/surveys/[publicToken]/submit/route";
import { GET as responsesGET } from "../src/app/api/surveys/[id]/responses/route";
import { PATCH as responseStatusPATCH } from "../src/app/api/surveys/[id]/responses/[responseId]/status/route";
import { GET as crosstabGET } from "../src/app/api/surveys/[id]/analytics/crosstab/route";
import { GET as questionsAnalyticsGET } from "../src/app/api/surveys/[id]/analytics/questions/route";
import { GET as statsGET } from "../src/app/api/surveys/[id]/stats/route";

describe("Phase M10-B: Response Collection & Submission Integrity (Hardened Contract Suite)", () => {
  let orgA: any;
  let orgB: any;

  let ownerA: any;
  let adminA: any;
  let editorA: any;
  let viewerA: any;
  let adminB: any;

  let tokenOwnerA: string;
  let tokenAdminA: string;
  let tokenEditorA: string;
  let tokenViewerA: string;
  let tokenAdminB: string;

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
    adminB = await db.user.create({
      data: { email: "m10b-admin@beta.com", name: "Admin Beta", passwordHash: defaultPwd },
    });

    await db.membership.createMany({
      data: [
        { userId: ownerA.id, organizationId: orgA.id, role: Role.OWNER },
        { userId: adminA.id, organizationId: orgA.id, role: Role.ADMIN },
        { userId: editorA.id, organizationId: orgA.id, role: Role.EDITOR },
        { userId: viewerA.id, organizationId: orgA.id, role: Role.VIEWER },
        { userId: adminB.id, organizationId: orgB.id, role: Role.ADMIN },
      ],
    });

    tokenOwnerA = (await createSession(ownerA.id)).token;
    tokenAdminA = (await createSession(adminA.id)).token;
    tokenEditorA = (await createSession(editorA.id)).token;
    tokenViewerA = (await createSession(viewerA.id)).token;
    tokenAdminB = (await createSession(adminB.id)).token;
  });

  describe("Gate B1: Scoped Idempotency Contract & Payload Conflict Defense", () => {
    it("首次提交回傳 200 (replayed: false)，相同 Payload 重試回傳 200 (replayed: true)", async () => {
      const pToken = generatePublicToken();
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "冪等合約問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題 1",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: { create: [{ label: "選項 A", value: "opt_a", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      const idempotencyKey = "client-scoped-key-11223344";

      // 第 1 次提交 -> 200 OK with Idempotent-Replayed: false
      const req1 = makePublicSubmitReq(
        `http://localhost/api/public/surveys/${pToken}/submit`,
        { answers: [{ questionCode: "Q1", value: "opt_a" }] },
        { "Idempotency-Key": idempotencyKey }
      );
      const res1 = await publicSubmitPOST(req1, { params: { publicToken: pToken } });
      expect(res1.status).toBe(200);
      expect(res1.headers.get("Idempotent-Replayed")).toBe("false");
      const json1 = await res1.json();
      expect(json1.replayed).toBe(false);
      const originalResponseId = json1.responseId;

      // 第 2 次重送相同 key 與相同 payload -> 200 OK (Idempotent Replay)
      const req2 = makePublicSubmitReq(
        `http://localhost/api/public/surveys/${pToken}/submit`,
        { answers: [{ questionCode: "Q1", value: "opt_a" }] },
        { "Idempotency-Key": idempotencyKey }
      );
      const res2 = await publicSubmitPOST(req2, { params: { publicToken: pToken } });
      expect(res2.status).toBe(200);
      expect(res2.headers.get("Idempotent-Replayed")).toBe("true");
      const json2 = await res2.json();
      expect(json2.responseId).toBe(originalResponseId);
      expect(json2.replayed).toBe(true);

      // DB 總筆數嚴格為 1
      const count = await db.response.count({ where: { surveyId: survey.id } });
      expect(count).toBe(1);
    });

    it("相同 Idempotency-Key 但不同 Payload 內容時回傳 409 IDEMPOTENCY_KEY_REUSE 且禁止改寫", async () => {
      const pToken = generatePublicToken();
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "衝突檢驗問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題 1",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: {
                  create: [
                    { label: "選項 A", value: "opt_a", orderNum: 1 },
                    { label: "選項 B", value: "opt_b", orderNum: 2 },
                  ],
                },
              },
            ],
          },
        },
      });

      const idempotencyKey = "client-conflict-key-55667788";

      // 首次提交 opt_a
      const req1 = makePublicSubmitReq(
        `http://localhost/api/public/surveys/${pToken}/submit`,
        { answers: [{ questionCode: "Q1", value: "opt_a" }] },
        { "Idempotency-Key": idempotencyKey }
      );
      const res1 = await publicSubmitPOST(req1, { params: { publicToken: pToken } });
      expect(res1.status).toBe(200);

      // 篡改作答內容為 opt_b 並重用相同 key -> 409 Conflict
      const req2 = makePublicSubmitReq(
        `http://localhost/api/public/surveys/${pToken}/submit`,
        { answers: [{ questionCode: "Q1", value: "opt_b" }] },
        { "Idempotency-Key": idempotencyKey }
      );
      const res2 = await publicSubmitPOST(req2, { params: { publicToken: pToken } });
      expect(res2.status).toBe(409);
      const json2 = await res2.json();
      expect(json2.error).toBe("IDEMPOTENCY_KEY_REUSE");

      // 檢查 DB 中的原始答案未被篡改，依然是 opt_a
      const answer = await db.answer.findFirst({
        where: { response: { surveyId: survey.id } },
      });
      expect(JSON.parse(answer!.rawValue)).toBe("opt_a");
    });

    it("不同問卷 (Survey A 與 Survey B) 使用相同 Idempotency-Key 正常建立且不發生 DB 唯一性衝突", async () => {
      const pTokenA = generatePublicToken();
      const pTokenB = generatePublicToken();

      const surveyA = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "問卷 A",
          status: SurveyStatus.PUBLISHED,
          publicToken: pTokenA,
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題",
                questionType: QuestionType.text,
                orderNum: 1,
              },
            ],
          },
        },
      });

      const surveyB = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "問卷 B",
          status: SurveyStatus.PUBLISHED,
          publicToken: pTokenB,
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題",
                questionType: QuestionType.text,
                orderNum: 1,
              },
            ],
          },
        },
      });

      const sharedKey = "cross-survey-shared-key-99999999";

      // 提交到問卷 A
      const resA = await publicSubmitPOST(
        makePublicSubmitReq(
          `http://localhost/api/public/surveys/${pTokenA}/submit`,
          { answers: [{ questionCode: "Q1", value: "ans_a" }] },
          { "Idempotency-Key": sharedKey }
        ),
        { params: { publicToken: pTokenA } }
      );
      expect(resA.status).toBe(200);

      // 提交到問卷 B (相同 key) -> 必須成功 200 (Scoped to Survey)
      const resB = await publicSubmitPOST(
        makePublicSubmitReq(
          `http://localhost/api/public/surveys/${pTokenB}/submit`,
          { answers: [{ questionCode: "Q1", value: "ans_b" }] },
          { "Idempotency-Key": sharedKey }
        ),
        { params: { publicToken: pTokenB } }
      );
      expect(resB.status).toBe(200);

      const respCountA = await db.response.count({ where: { surveyId: surveyA.id } });
      const respCountB = await db.response.count({ where: { surveyId: surveyB.id } });
      expect(respCountA).toBe(1);
      expect(respCountB).toBe(1);
    });
  });

  describe("Gate B3: Status Segregation & No Quota Rollback", () => {
    it("將作答標記為 EXCLUDED 後不回收既有配額 (禁止第 quota+1 人提交)", async () => {
      const pToken = generatePublicToken();
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "配額不回收驗證問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          responseQuota: 2, // 限制上限 2 筆
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

      // 提交第 1 筆
      const res1 = await publicSubmitPOST(
        makePublicSubmitReq(
          `http://localhost/api/public/surveys/${pToken}/submit`,
          { answers: [{ questionCode: "Q1", value: "opt" }] }
        ),
        { params: { publicToken: pToken } }
      );
      expect(res1.status).toBe(200);
      const resp1Id = (await res1.json()).responseId;

      // 提交第 2 筆 -> 達到配額滿額
      const res2 = await publicSubmitPOST(
        makePublicSubmitReq(
          `http://localhost/api/public/surveys/${pToken}/submit`,
          { answers: [{ questionCode: "Q1", value: "opt" }] }
        ),
        { params: { publicToken: pToken } }
      );
      expect(res2.status).toBe(200);

      // 管理員將第 1 筆排除 (EXCLUDED)
      const patchReq = makeAuthReq(
        `http://localhost/api/surveys/${survey.id}/responses/${resp1Id}/status`,
        tokenAdminA,
        { method: "PATCH", body: { status: "EXCLUDED", reason: "作弊洗票" } }
      );
      const patchRes = await responseStatusPATCH(patchReq, {
        params: { id: survey.id, responseId: resp1Id },
      });
      expect(patchRes.status).toBe(200);

      // 嘗試提交第 3 筆 -> 必須被 403 QUOTA_EXCEEDED 拒絕（因為 EXCLUDED 視為歷史已受理配額，不回滾）
      const res3 = await publicSubmitPOST(
        makePublicSubmitReq(
          `http://localhost/api/public/surveys/${pToken}/submit`,
          { answers: [{ questionCode: "Q1", value: "opt" }] }
        ),
        { params: { publicToken: pToken } }
      );
      expect(res3.status).toBe(403);
      expect((await res3.json()).error).toBe("QUOTA_EXCEEDED");
    });

    it("Response 狀態修改必須具有租戶隔離與防 IDOR (跨租戶操作回傳 404/403)", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "租戶隔離問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      const resp = await db.response.create({
        data: { surveyId: survey.id, status: ResponseStatus.COMPLETED },
      });

      // Org B 的 Admin 嘗試修改 Org A 的 Response 狀態 -> 403 Forbidden
      const idorReq = makeAuthReq(
        `http://localhost/api/surveys/${survey.id}/responses/${resp.id}/status`,
        tokenAdminB,
        { method: "PATCH", body: { status: "EXCLUDED", reason: "攻擊" } }
      );
      const idorRes = await responseStatusPATCH(idorReq, {
        params: { id: survey.id, responseId: resp.id },
      });
      expect(idorRes.status).toBe(403);
    });
  });

  describe("Gate B4: Audit Trail, IP Normalization & Secret Rotation", () => {
    it("IP 標準化能正確處理 IPv6-mapped IPv4 前綴並產生一致雜湊", () => {
      const ipv4 = "192.168.1.50";
      const ipv6Mapped = "::ffff:192.168.1.50";

      expect(normalizeIp(ipv4)).toBe("192.168.1.50");
      expect(normalizeIp(ipv6Mapped)).toBe("192.168.1.50");

      const hash1 = hashClientIp(ipv4);
      const hash2 = hashClientIp(ipv6Mapped);
      expect(hash1.hash).toBe(hash2.hash);
      expect(hash1.version).toBe("v1");
    });
  });

  describe("Gate B5: Comprehensive Analytics Read Boundary", () => {
    it("交叉分析、題目統計與基礎統計端點預設嚴格僅計算 COMPLETED 資料，絕不污染已凍結之引擎", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "全端點防污染問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
          questions: {
            create: [
              {
                code: "Q1",
                title: "滿意度",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: {
                  create: [
                    { label: "滿意", value: "sat", orderNum: 1 },
                    { label: "不滿", value: "unsat", orderNum: 2 },
                  ],
                },
              },
            ],
          },
        },
      });

      const q1 = await db.question.findFirst({ where: { surveyId: survey.id, code: "Q1" } });

      // 5 筆 COMPLETED
      for (let i = 0; i < 5; i++) {
        const r = await db.response.create({
          data: { surveyId: survey.id, status: ResponseStatus.COMPLETED, totalScore: 100, submittedAt: new Date() },
        });
        await db.answer.create({
          data: { responseId: r.id, questionId: q1!.id, rawValue: JSON.stringify("sat") },
        });
      }

      // 5 筆 EXCLUDED (不計入統計)
      for (let i = 0; i < 5; i++) {
        const rEx = await db.response.create({
          data: { surveyId: survey.id, status: ResponseStatus.EXCLUDED, totalScore: 0, submittedAt: new Date() },
        });
        await db.answer.create({
          data: { responseId: rEx.id, questionId: q1!.id, rawValue: JSON.stringify("unsat") },
        });
      }

      // 驗證 Stats 端點
      const statsReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/stats`, tokenEditorA);
      const statsRes = await statsGET(statsReq, { params: { id: survey.id } });
      expect(statsRes.status).toBe(200);
      const statsJson = await statsRes.json();
      expect(statsJson.summary.totalResponses).toBe(5); // 嚴格等於 5
      expect(statsJson.summary.avgScore).toBe(100);

      // 驗證 Questions Analytics 端點
      const qReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/analytics/questions`, tokenEditorA);
      const qRes = await questionsAnalyticsGET(qReq, { params: { id: survey.id } });
      const qJson = await qRes.json();
      expect(qJson.summary.totalResponses).toBe(5);
    });
  });

  describe("Gate B6: 50 Concurrent Replay & Conflict Stress Test", () => {
    it("50 個同時發送的相同 Key + 相同 Payload 請求：嚴格 1 次建立 (replayed: false) + 49 次重放 (replayed: true)，DB 僅 1 筆記錄且 Quota 僅消耗 1", async () => {
      const pToken = generatePublicToken();
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "50 並發冪等重放壓力問卷",
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

      const sharedKey = "stress-concurrent-50-key-12345678";

      const requests = Array.from({ length: 50 }).map(() => {
        const req = makePublicSubmitReq(
          `http://localhost/api/public/surveys/${pToken}/submit`,
          { answers: [{ questionCode: "Q1", value: "opt" }] },
          { "Idempotency-Key": sharedKey }
        );
        return publicSubmitPOST(req, { params: { publicToken: pToken } });
      });

      const responses = await Promise.all(requests);
      const statuses = responses.map((r) => r.status);
      expect(statuses.every((s) => s === 200)).toBe(true);

      const jsonResults = await Promise.all(responses.map((r) => r.json()));
      const firstResponseId = jsonResults[0].responseId;
      expect(jsonResults.every((j) => j.responseId === firstResponseId)).toBe(true);

      const newCreates = jsonResults.filter((j) => j.replayed === false);
      const replays = jsonResults.filter((j) => j.replayed === true);
      expect(newCreates.length).toBe(1);
      expect(replays.length).toBe(49);

      const totalDbRecords = await db.response.count({ where: { surveyId: survey.id } });
      expect(totalDbRecords).toBe(1);
    });

    it("50 個同時發送的相同 Key + 衝突 Payload 請求：嚴格 1 次成功 (200) + 49 次拒絕 (409 Conflict)，零資料覆寫與零額外配額消耗", async () => {
      const pToken = generatePublicToken();
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "50 並發衝突拒絕壓力問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          responseQuota: 10,
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題",
                questionType: QuestionType.text,
                orderNum: 1,
              },
            ],
          },
        },
      });

      const sharedConflictKey = "stress-conflict-50-key-87654321";

      const requests = Array.from({ length: 50 }).map((_, idx) => {
        const req = makePublicSubmitReq(
          `http://localhost/api/public/surveys/${pToken}/submit`,
          { answers: [{ questionCode: "Q1", value: `payload_variation_${idx}` }] },
          { "Idempotency-Key": sharedConflictKey }
        );
        return publicSubmitPOST(req, { params: { publicToken: pToken } });
      });

      const responses = await Promise.all(requests);
      const statuses = responses.map((r) => r.status);
      const count200 = statuses.filter((s) => s === 200).length;
      const count409 = statuses.filter((s) => s === 409).length;

      expect(count200).toBe(1);
      expect(count409).toBe(49);

      const totalDbRecords = await db.response.count({ where: { surveyId: survey.id } });
      expect(totalDbRecords).toBe(1);
    });
  });

  describe("Gate B7: Release Hardening, Migration Correctness & Security Audit", () => {
    it("B7.1 Migration Correctness: 多筆 idempotencyKey 為 NULL 之歷史資料在 composite unique 下可共存且不受干擾", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "歷史資料相容問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
        },
      });

      // 模擬未有 idempotencyKey 的 5 筆舊資料
      for (let i = 0; i < 5; i++) {
        await db.response.create({
          data: {
            surveyId: survey.id,
            idempotencyKey: null,
            status: ResponseStatus.COMPLETED,
          },
        });
      }

      const totalNullKeyResponses = await db.response.count({
        where: { surveyId: survey.id, idempotencyKey: null },
      });
      expect(totalNullKeyResponses).toBe(5);
    });

    it("B7.2 Idempotency Failure Matrix: 驗證失敗 (422) 不消耗冪等槽位，修正後重試相同 Key 可順利完成", async () => {
      const pToken = generatePublicToken();
      await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "驗證失敗不鎖死 Key 問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: pToken,
          questions: {
            create: [
              {
                code: "Q_REQ",
                title: "必填題目",
                questionType: QuestionType.single_choice,
                required: true,
                orderNum: 1,
                choices: { create: [{ label: "選項 A", value: "opt_a", orderNum: 1 }] },
              },
            ],
          },
        },
      });

      const failureKey = "failure-matrix-key-111222333";

      // 1. 傳送非法空作答 -> 422 Unprocessable Entity
      const reqFail = makePublicSubmitReq(
        `http://localhost/api/public/surveys/${pToken}/submit`,
        { answers: [] }, // 漏填必填題
        { "Idempotency-Key": failureKey }
      );
      const resFail = await publicSubmitPOST(reqFail, { params: { publicToken: pToken } });
      expect(resFail.status).toBe(422);

      // 2. 修正為正確作答並重送相同 Key -> 成功 200 (未被消耗鎖死)
      const reqSuccess = makePublicSubmitReq(
        `http://localhost/api/public/surveys/${pToken}/submit`,
        { answers: [{ questionCode: "Q_REQ", value: "opt_a" }] },
        { "Idempotency-Key": failureKey }
      );
      const resSuccess = await publicSubmitPOST(reqSuccess, { params: { publicToken: pToken } });
      expect(resSuccess.status).toBe(200);
      expect((await resSuccess.json()).replayed).toBe(false);
    });

    it("B7.3 Deep Payload Canonicalization: 題目順序不同、選擇陣列順序不同與 Unicode 等價字元均產出相同 Hash", () => {
      // 題目順序交換
      const answersA = [
        { questionCode: "Q1", value: "A" },
        { questionCode: "Q2", value: "B" },
      ];
      const answersB = [
        { questionCode: "Q2", value: "B" },
        { questionCode: "Q1", value: "A" },
      ];
      expect(calculatePayloadHash(answersA)).toBe(calculatePayloadHash(answersB));

      // 複選題 choiceIds 順序交換
      const choicesA = [{ questionCode: "Q1", choiceIds: ["c2", "c1"] }];
      const choicesB = [{ questionCode: "Q1", choiceIds: ["c1", "c2"] }];
      expect(calculatePayloadHash(choicesA)).toBe(calculatePayloadHash(choicesB));

      // Unicode NFC 等價 (é)
      const unicodeA = [{ questionCode: "Q1", value: "caf\u00e9" }];
      const unicodeB = [{ questionCode: "Q1", value: "cafe\u0301" }];
      expect(calculatePayloadHash(unicodeA)).toBe(calculatePayloadHash(unicodeB));
    });

    it("B7.4 HMAC Secret Security: 必須為 Secret Keyed HMAC 雜湊，且不同 Secret 雜湊結果不同", () => {
      const ip = "203.0.113.10";
      const resDefault = hashClientIp(ip);
      const resSecretB = hashClientIp(ip, "rotated-secret-key-2027");

      expect(resDefault.hash).not.toBe(resSecretB.hash);
      expect(resDefault.version).toBe("v1");
      expect(resSecretB.version).toBe("v1");
    });

    it("B7.5 Analytics Contamination Regression: 100 COMPLETED + 20 EXCLUDED 混合資料下，所有分析端點嚴格為 100，配額嚴格為 120", async () => {
      const survey = await db.survey.create({
        data: {
          organizationId: orgA.id,
          title: "100+20 領域分離母體驗證問卷",
          status: SurveyStatus.PUBLISHED,
          publicToken: generatePublicToken(),
          responseQuota: 150,
          questions: {
            create: [
              {
                code: "Q1",
                title: "問題 1",
                questionType: QuestionType.single_choice,
                orderNum: 1,
                choices: {
                  create: [
                    { label: "選項 A", value: "opt_a", orderNum: 1 },
                    { label: "選項 B", value: "opt_b", orderNum: 2 },
                  ],
                },
              },
              {
                code: "Q2",
                title: "問題 2",
                questionType: QuestionType.single_choice,
                orderNum: 2,
                choices: {
                  create: [
                    { label: "滿意", value: "sat", orderNum: 1 },
                    { label: "不滿", value: "unsat", orderNum: 2 },
                  ],
                },
              },
            ],
          },
        },
      });

      const q1 = await db.question.findFirst({ where: { surveyId: survey.id, code: "Q1" } });
      const q2 = await db.question.findFirst({ where: { surveyId: survey.id, code: "Q2" } });

      // 寫入 100 筆 COMPLETED
      for (let i = 0; i < 100; i++) {
        const r = await db.response.create({
          data: { surveyId: survey.id, status: ResponseStatus.COMPLETED, totalScore: 100, submittedAt: new Date() },
        });
        await db.answer.create({
          data: { responseId: r.id, questionId: q1!.id, rawValue: JSON.stringify("opt_a") },
        });
        await db.answer.create({
          data: { responseId: r.id, questionId: q2!.id, rawValue: JSON.stringify("sat") },
        });
      }

      // 寫入 20 筆 EXCLUDED (干擾母體)
      for (let i = 0; i < 20; i++) {
        const rEx = await db.response.create({
          data: {
            surveyId: survey.id,
            status: ResponseStatus.EXCLUDED,
            excludedReason: "測試洗票",
            totalScore: 0,
            submittedAt: new Date(),
          },
        });
        await db.answer.create({
          data: { responseId: rEx.id, questionId: q1!.id, rawValue: JSON.stringify("opt_b") },
        });
        await db.answer.create({
          data: { responseId: rEx.id, questionId: q2!.id, rawValue: JSON.stringify("unsat") },
        });
      }

      // 1. 驗證 Stats 端點
      const statsReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/stats`, tokenEditorA);
      const statsRes = await statsGET(statsReq, { params: { id: survey.id } });
      const statsJson = await statsRes.json();
      expect(statsJson.summary.totalResponses).toBe(100); // 嚴格等於 100，零污染
      expect(statsJson.summary.avgScore).toBe(100);

      // 2. 驗證 Question Analytics 端點
      const qReq = makeAuthReq(`http://localhost/api/surveys/${survey.id}/analytics/questions`, tokenEditorA);
      const qRes = await questionsAnalyticsGET(qReq, { params: { id: survey.id } });
      const qJson = await qRes.json();
      expect(qJson.summary.totalResponses).toBe(100);

      // 3. 驗證 Crosstab 端點
      const crossReq = makeAuthReq(
        `http://localhost/api/surveys/${survey.id}/analytics/crosstab?rowQuestionId=${q1!.id}&colQuestionId=${q2!.id}`,
        tokenEditorA
      );
      const crossRes = await crosstabGET(crossReq, { params: { id: survey.id } });
      const crossJson = await crossRes.json();
      expect(crossJson.totalSurveyResponses).toBe(100);
      expect(crossJson.result.grandTotal).toBe(100);

      // 4. 驗證配額計算母體：累計歷史已受理 (COMPLETED + EXCLUDED) 嚴格為 120
      const totalQuotaConsumed = await db.response.count({
        where: {
          surveyId: survey.id,
          status: { in: [ResponseStatus.COMPLETED, ResponseStatus.EXCLUDED] },
        },
      });
      expect(totalQuotaConsumed).toBe(120);
    });
  });
});
