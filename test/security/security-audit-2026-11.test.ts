import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createSession, generatePublicToken, hashPassword, SESSION_COOKIE_NAME } from "@/lib/auth";
import { ResponseStatus, Role, SurveyStatus } from "@prisma/client";
import { POST as memberDraftPOST } from "@/app/api/surveys/[id]/draft/route";
import { POST as memberSubmitPOST } from "@/app/api/surveys/[id]/submit/route";
import { GET as surveyGET } from "@/app/api/surveys/[id]/route";
import {
  GET as responseGET,
  DELETE as responseDELETE,
} from "@/app/api/surveys/[id]/responses/[responseId]/route";
import { POST as publicSubmitPOST } from "@/app/api/public/surveys/[publicToken]/submit/route";
import { POST as publicDraftPOST } from "@/app/api/public/surveys/[publicToken]/draft/route";
import { POST as importPOST } from "@/app/api/surveys/import/route";

/**
 * 2026-11 資安稽核回歸測試。
 * 每個 describe 對應稽核報告的一條發現。
 */
describe("Security audit 2026-11 regression", () => {
  const orgId = "sec-2611-org";
  const otherOrgId = "sec-2611-other-org";
  const emailPrefix = "sec-2611-";

  let survey: any;
  let completed: any;
  let excluded: any;
  let inProgress: any;
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};

  async function cleanup() {
    const orgs = [orgId, otherOrgId];
    await db.answerChoice.deleteMany({
      where: { answer: { response: { survey: { organizationId: { in: orgs } } } } },
    });
    await db.answer.deleteMany({ where: { response: { survey: { organizationId: { in: orgs } } } } });
    await db.response.deleteMany({ where: { survey: { organizationId: { in: orgs } } } });
    await db.choice.deleteMany({ where: { question: { survey: { organizationId: { in: orgs } } } } });
    await db.question.deleteMany({ where: { survey: { organizationId: { in: orgs } } } });
    await db.surveyImport.deleteMany({ where: { organizationId: { in: orgs } } });
    await db.survey.deleteMany({ where: { organizationId: { in: orgs } } });
    await db.membership.deleteMany({ where: { organizationId: { in: orgs } } });
    await db.session.deleteMany({ where: { user: { email: { startsWith: emailPrefix } } } });
    await db.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
    await db.organization.deleteMany({ where: { id: { in: orgs } } });
  }

  beforeEach(async () => {
    await cleanup();
    await db.organization.create({ data: { id: orgId, name: "Sec 2611", slug: "sec-2611" } });
    await db.organization.create({
      data: { id: otherOrgId, name: "Sec 2611 other", slug: "sec-2611-other" },
    });

    const passwordHash = await hashPassword("Sec2611Pass!");
    const users: Array<[string, string, Role]> = [
      ["owner", orgId, Role.OWNER],
      ["admin", orgId, Role.ADMIN],
      ["editor", orgId, Role.EDITOR],
      ["viewer", orgId, Role.VIEWER],
      ["viewer2", orgId, Role.VIEWER],
      ["outsider", otherOrgId, Role.OWNER],
    ];
    for (const [name, org, role] of users) {
      const u = await db.user.create({
        data: {
          email: `${emailPrefix}${name}@example.com`,
          name,
          passwordHash,
          memberships: { create: { organizationId: org, role } },
        },
      });
      userIds[name] = u.id;
      tokens[name] = (await createSession(u.id)).token;
    }

    survey = await db.survey.create({
      data: {
        title: "Sec 2611 survey",
        organizationId: orgId,
        createdById: userIds.owner,
        status: SurveyStatus.PUBLISHED,
        publicToken: generatePublicToken(),
        questions: {
          create: [
            { code: "Q1", title: "意見", questionType: "text", orderNum: 1, required: false },
          ],
        },
      },
      include: { questions: true },
    });
    const qId = survey.questions[0].id;

    const mkResponse = (status: ResponseStatus) =>
      db.response.create({
        data: {
          surveyId: survey.id,
          status,
          submittedAt: status === ResponseStatus.IN_PROGRESS ? null : new Date(),
          excludedReason: status === ResponseStatus.EXCLUDED ? "灌票" : null,
          answers: { create: { questionId: qId, rawValue: JSON.stringify("原始答案") } },
        },
      });
    completed = await mkResponse(ResponseStatus.COMPLETED);
    excluded = await mkResponse(ResponseStatus.EXCLUDED);
    inProgress = await mkResponse(ResponseStatus.IN_PROGRESS);
  });

  afterEach(async () => {
    await cleanup();
  });

  const jsonReq = (url: string, method: string, body: unknown, token?: string, extra: Record<string, string> = {}) =>
    new NextRequest(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
        ...extra,
      },
      body: JSON.stringify(body),
    });

  const getReq = (url: string, token?: string, method = "GET") =>
    new NextRequest(url, {
      method,
      headers: token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
    });

  const answerCount = (responseId: string) => db.answer.count({ where: { responseId } });
  const statusOf = async (responseId: string) =>
    (await db.response.findUnique({ where: { id: responseId } }))?.status;

  // [High] /api/surveys/[id]/draft 與 /submit
  describe("member draft/submit must not let VIEWER or anyone overwrite finalized responses", () => {
    it("VIEWER cannot clear a COMPLETED response via draft (403)", async () => {
      const res = await memberDraftPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/draft`, "POST", { responseId: completed.id, answers: [] }, tokens.viewer),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(res.status).toBe(403);
      expect(await answerCount(completed.id)).toBe(1);
    });

    it("VIEWER cannot resurrect an EXCLUDED response via submit (403)", async () => {
      const res = await memberSubmitPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/submit`, "POST", { responseId: excluded.id, answers: [] }, tokens.viewer),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(res.status).toBe(403);
      expect(await statusOf(excluded.id)).toBe(ResponseStatus.EXCLUDED);
    });

    it("EDITOR cannot overwrite a COMPLETED response via draft (409)", async () => {
      const res = await memberDraftPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/draft`, "POST", { responseId: completed.id, answers: [] }, tokens.editor),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(res.status).toBe(409);
      expect(await answerCount(completed.id)).toBe(1);
    });

    it("EDITOR cannot resubmit an EXCLUDED response (409)", async () => {
      const res = await memberSubmitPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/submit`, "POST", { responseId: excluded.id, answers: [] }, tokens.editor),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(res.status).toBe(409);
      expect(await statusOf(excluded.id)).toBe(ResponseStatus.EXCLUDED);
    });

    it("EDITOR can still continue and submit an IN_PROGRESS draft", async () => {
      const draftRes = await memberDraftPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/draft`, "POST", { responseId: inProgress.id, answers: [] }, tokens.editor),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(draftRes.status).toBe(200);
      const submitRes = await memberSubmitPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/submit`, "POST", { responseId: inProgress.id, answers: [] }, tokens.editor),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(submitRes.status).toBe(200);
      expect(await statusOf(inProgress.id)).toBe(ResponseStatus.COMPLETED);
    });

    it("VIEWER can still start a new response without responseId", async () => {
      const res = await memberDraftPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/draft`, "POST", { answers: [] }, tokens.viewer),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const created = await db.response.findUnique({ where: { id: body.responseId } });
      expect(created?.createdById).toBe(userIds.viewer);
      expect(created?.status).toBe(ResponseStatus.IN_PROGRESS);
    });

    it("VIEWER who created an IN_PROGRESS response can keep saving and then submit it", async () => {
      const first = await memberDraftPOST(
        jsonReq(
          `http://localhost/api/surveys/${survey.id}/draft`,
          "POST",
          { answers: [{ questionCode: "Q1", rawValue: "第一次" }] },
          tokens.viewer
        ),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(first.status).toBe(200);
      const { responseId } = await first.json();

      const second = await memberDraftPOST(
        jsonReq(
          `http://localhost/api/surveys/${survey.id}/draft`,
          "POST",
          { responseId, answers: [{ questionCode: "Q1", rawValue: "第二次" }] },
          tokens.viewer
        ),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(second.status).toBe(200);
      const saved = await db.answer.findMany({ where: { responseId } });
      expect(saved).toHaveLength(1);
      expect(saved[0].rawValue).toBe(JSON.stringify("第二次"));

      const submitted = await memberSubmitPOST(
        jsonReq(
          `http://localhost/api/surveys/${survey.id}/submit`,
          "POST",
          { responseId, answers: [{ questionCode: "Q1", rawValue: "送出" }] },
          tokens.viewer
        ),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(submitted.status).toBe(200);
      expect(await statusOf(responseId)).toBe(ResponseStatus.COMPLETED);

      const again = await memberDraftPOST(
        jsonReq(
          `http://localhost/api/surveys/${survey.id}/draft`,
          "POST",
          { responseId, answers: [] },
          tokens.viewer
        ),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(again.status).toBe(409);
      expect(await statusOf(responseId)).toBe(ResponseStatus.COMPLETED);
    });

    it("another VIEWER cannot draft or submit someone else's IN_PROGRESS response", async () => {
      const first = await memberDraftPOST(
        jsonReq(
          `http://localhost/api/surveys/${survey.id}/draft`,
          "POST",
          { answers: [{ questionCode: "Q1", rawValue: "本人的草稿" }] },
          tokens.viewer
        ),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(first.status).toBe(200);
      const { responseId } = await first.json();

      const draft = await memberDraftPOST(
        jsonReq(
          `http://localhost/api/surveys/${survey.id}/draft`,
          "POST",
          { responseId, answers: [{ questionCode: "Q1", rawValue: "被竄改" }] },
          tokens.viewer2
        ),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(draft.status).toBe(403);
      const submit = await memberSubmitPOST(
        jsonReq(
          `http://localhost/api/surveys/${survey.id}/submit`,
          "POST",
          { responseId, answers: [{ questionCode: "Q1", rawValue: "被竄改" }] },
          tokens.viewer2
        ),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(submit.status).toBe(403);
      expect(await statusOf(responseId)).toBe(ResponseStatus.IN_PROGRESS);
      const saved = await db.answer.findMany({ where: { responseId } });
      expect(saved).toHaveLength(1);
      expect(saved[0].rawValue).toBe(JSON.stringify("本人的草稿"));
    });

    it("VIEWER cannot resume an IN_PROGRESS response they did not create", async () => {
      const res = await memberDraftPOST(
        jsonReq(
          `http://localhost/api/surveys/${survey.id}/draft`,
          "POST",
          { responseId: inProgress.id, answers: [] },
          tokens.viewer
        ),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(res.status).toBe(403);
      expect(await answerCount(inProgress.id)).toBe(1);
      const submit = await memberSubmitPOST(
        jsonReq(
          `http://localhost/api/surveys/${survey.id}/submit`,
          "POST",
          { responseId: inProgress.id, answers: [] },
          tokens.viewer
        ),
        { params: Promise.resolve({ id: survey.id }) }
      );
      expect(submit.status).toBe(403);
      expect(await statusOf(inProgress.id)).toBe(ResponseStatus.IN_PROGRESS);
    });
  });

  // [Medium] GET /api/surveys/[id] 非 management 模式
  describe("survey detail GET requires membership and hides internal fields", () => {
    it("anonymous GET is rejected (401)", async () => {
      const res = await surveyGET(getReq(`http://localhost/api/surveys/${survey.id}`), { params: Promise.resolve({ id: survey.id }) });
      expect(res.status).toBe(401);
    });

    it("non-member GET is rejected (403)", async () => {
      const res = await surveyGET(getReq(`http://localhost/api/surveys/${survey.id}`, tokens.outsider), {
        params: Promise.resolve({ id: survey.id }),
      });
      expect(res.status).toBe(403);
    });

    it("member fill view omits creator email, publicToken and version tree", async () => {
      const res = await surveyGET(getReq(`http://localhost/api/surveys/${survey.id}`, tokens.viewer), {
        params: Promise.resolve({ id: survey.id }),
      });
      expect(res.status).toBe(200);
      const { survey: s } = await res.json();
      expect(s.id).toBe(survey.id);
      expect(s.questions).toHaveLength(1);
      expect(s.questions[0].choices).toEqual([]);
      expect(s.createdBy).toBeUndefined();
      expect(s.publicToken).toBeUndefined();
      expect(s.childVersions).toBeUndefined();
      expect(s.parentSurvey).toBeUndefined();
      expect(JSON.stringify(s)).not.toContain(`${emailPrefix}owner@example.com`);
    });
  });

  // [Medium] /api/surveys/[id]/responses/[responseId]
  describe("single response GET/DELETE always require auth", () => {
    it.each([
      ["EXCLUDED", () => excluded],
      ["IN_PROGRESS", () => inProgress],
    ])("anonymous GET of %s response is rejected (401)", async (_label, pick) => {
      const r = pick();
      const res = await responseGET(getReq(`http://localhost/api/surveys/${survey.id}/responses/${r.id}`), {
        params: Promise.resolve({ id: survey.id, responseId: r.id }),
      });
      expect(res.status).toBe(401);
    });

    it.each([
      ["EXCLUDED", () => excluded],
      ["IN_PROGRESS", () => inProgress],
    ])("anonymous DELETE of %s response is rejected (401)", async (_label, pick) => {
      const r = pick();
      const res = await responseDELETE(
        getReq(`http://localhost/api/surveys/${survey.id}/responses/${r.id}`, undefined, "DELETE"),
        { params: Promise.resolve({ id: survey.id, responseId: r.id }) }
      );
      expect(res.status).toBe(401);
      expect(await statusOf(r.id)).toBeDefined();
    });

    it("non-member GET of IN_PROGRESS response is rejected (403)", async () => {
      const res = await responseGET(
        getReq(`http://localhost/api/surveys/${survey.id}/responses/${inProgress.id}`, tokens.outsider),
        { params: Promise.resolve({ id: survey.id, responseId: inProgress.id }) }
      );
      expect(res.status).toBe(403);
    });

    it("EDITOR cannot delete an EXCLUDED response (needs MANAGERS)", async () => {
      const res = await responseDELETE(
        getReq(`http://localhost/api/surveys/${survey.id}/responses/${excluded.id}?force=true`, tokens.editor, "DELETE"),
        { params: Promise.resolve({ id: survey.id, responseId: excluded.id }) }
      );
      expect(res.status).toBe(403);
      expect(await statusOf(excluded.id)).toBe(ResponseStatus.EXCLUDED);
    });

    it("VIEWER cannot delete an IN_PROGRESS draft; EDITOR can", async () => {
      const url = `http://localhost/api/surveys/${survey.id}/responses/${inProgress.id}`;
      const viewerRes = await responseDELETE(getReq(url, tokens.viewer, "DELETE"), {
        params: Promise.resolve({ id: survey.id, responseId: inProgress.id }),
      });
      expect(viewerRes.status).toBe(403);
      const editorRes = await responseDELETE(getReq(url, tokens.editor, "DELETE"), {
        params: Promise.resolve({ id: survey.id, responseId: inProgress.id }),
      });
      expect(editorRes.status).toBe(200);
    });

    it("member can still load an IN_PROGRESS draft", async () => {
      const res = await responseGET(
        getReq(`http://localhost/api/surveys/${survey.id}/responses/${inProgress.id}`, tokens.viewer),
        { params: Promise.resolve({ id: survey.id, responseId: inProgress.id }) }
      );
      expect(res.status).toBe(200);
    });
  });

  // [Medium] 公開 submit/draft 不檢查作答狀態
  describe("public submit/draft only accept IN_PROGRESS responses", () => {
    it("public submit cannot resurrect an EXCLUDED response (409)", async () => {
      const res = await publicSubmitPOST(
        jsonReq(`http://localhost/api/public/surveys/${survey.publicToken}/submit`, "POST", { responseId: excluded.id, answers: [] }),
        { params: Promise.resolve({ publicToken: survey.publicToken }) }
      );
      expect(res.status).toBe(409);
      const after = await db.response.findUnique({ where: { id: excluded.id } });
      expect(after?.status).toBe(ResponseStatus.EXCLUDED);
      expect(after?.excludedReason).toBe("灌票");
    });

    it("public draft cannot reopen and clear a COMPLETED response (409)", async () => {
      const res = await publicDraftPOST(
        jsonReq(`http://localhost/api/public/surveys/${survey.publicToken}/draft`, "POST", { responseId: completed.id, answers: [] }),
        { params: Promise.resolve({ publicToken: survey.publicToken }) }
      );
      expect(res.status).toBe(409);
      expect(await statusOf(completed.id)).toBe(ResponseStatus.COMPLETED);
      expect(await answerCount(completed.id)).toBe(1);
    });

    it("public draft and submit still work for an IN_PROGRESS response", async () => {
      const draftRes = await publicDraftPOST(
        jsonReq(`http://localhost/api/public/surveys/${survey.publicToken}/draft`, "POST", { responseId: inProgress.id, answers: [] }),
        { params: Promise.resolve({ publicToken: survey.publicToken }) }
      );
      expect(draftRes.status).toBe(200);
      const submitRes = await publicSubmitPOST(
        jsonReq(`http://localhost/api/public/surveys/${survey.publicToken}/submit`, "POST", { responseId: inProgress.id, answers: [] }),
        { params: Promise.resolve({ publicToken: survey.publicToken }) }
      );
      expect(submitRes.status).toBe(200);
      expect(await statusOf(inProgress.id)).toBe(ResponseStatus.COMPLETED);
    });
  });

  // [Medium] 公開 submit 限流 key 未 trim
  describe("public submit rate limit key is normalized", () => {
    const ip = "203.0.113.211";
    let prev: string | undefined;
    beforeEach(async () => {
      prev = process.env.RATE_LIMIT_DISABLED;
      process.env.RATE_LIMIT_DISABLED = "0";
      await db.rateLimitCounter.deleteMany({ where: { bucketKey: { contains: ip } } });
    });
    afterEach(async () => {
      process.env.RATE_LIMIT_DISABLED = prev;
      await db.rateLimitCounter.deleteMany({ where: { bucketKey: { contains: ip } } });
    });

    it("padding the token with whitespace does not open a new bucket", async () => {
      const send = (token: string) =>
        publicSubmitPOST(
          jsonReq(`http://localhost/api/public/surveys/${encodeURIComponent(token)}/submit`, "POST", { answers: [] }, undefined, {
            "x-forwarded-for": ip,
          }),
          { params: Promise.resolve({ publicToken: token }) }
        );
      for (let i = 0; i < 10; i++) {
        await send(survey.publicToken);
      }
      const res = await send(`${survey.publicToken} `);
      expect(res.status).toBe(429);
    });
  });

  // [Medium] import PUBLISHED 分支在認證前寫入
  describe("import rejects anonymous requests before any audit write", () => {
    it("anonymous status=PUBLISHED save returns 401 and writes nothing", async () => {
      const formData = new FormData();
      formData.append("file", new Blob([new Uint8Array([1, 2, 3])]), "evil.xlsx");
      formData.append("mode", "save");
      formData.append("status", "PUBLISHED");
      formData.append("organizationId", orgId);
      const res = await importPOST(
        new NextRequest("http://localhost/api/surveys/import", { method: "POST", body: formData })
      );
      expect(res.status).toBe(401);
      expect(await db.surveyImport.count({ where: { organizationId: orgId } })).toBe(0);
    });
  });
  // [Medium] TOCTOU：作答狀態檢查與寫入之間沒有鎖，並發請求可覆寫已提交的作答
  describe("concurrent draft/submit cannot both act on the same IN_PROGRESS response", () => {
    const ROUNDS = 15;
    const SUBMIT_VALUE = JSON.stringify("提交");

    const freshDraft = async () =>
      db.response.create({
        data: {
          surveyId: survey.id,
          status: ResponseStatus.IN_PROGRESS,
          createdById: userIds.editor,
          answers: { create: { questionId: survey.questions[0].id, rawValue: JSON.stringify("原始答案") } },
        },
      });

    const memberCall = (kind: "draft" | "submit", responseId: string, value: string) =>
      (kind === "draft" ? memberDraftPOST : memberSubmitPOST)(
        jsonReq(
          `http://localhost/api/surveys/${survey.id}/${kind}`,
          "POST",
          { responseId, answers: [{ questionCode: "Q1", rawValue: value }] },
          tokens.editor
        ),
        { params: Promise.resolve({ id: survey.id }) }
      );

    const publicCall = (kind: "draft" | "submit", responseId: string, value: string) =>
      (kind === "draft" ? publicDraftPOST : publicSubmitPOST)(
        jsonReq(`http://localhost/api/public/surveys/${survey.publicToken}/${kind}`, "POST", {
          responseId,
          answers: [{ questionCode: "Q1", rawValue: value }],
        }),
        { params: Promise.resolve({ publicToken: survey.publicToken }) }
      );

    // 已提交的作答只能留下提交那一次的答案，不能被並發的草稿清空或混入
    const expectCompletedKeepsSubmitAnswers = async (responseId: string) => {
      const answers = await db.answer.findMany({ where: { responseId } });
      if ((await statusOf(responseId)) === ResponseStatus.COMPLETED) {
        expect(answers.map((a) => a.rawValue)).toEqual([SUBMIT_VALUE]);
      }
    };

    it("public submit + member submit on the same draft — exactly one succeeds, the other gets 409", async () => {
      for (let i = 0; i < ROUNDS; i++) {
        const draft = await freshDraft();
        const results = await Promise.all([
          publicCall("submit", draft.id, "提交"),
          memberCall("submit", draft.id, "提交"),
        ]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      }
    });

    for (const [label, call] of [
      ["member", memberCall],
      ["public", publicCall],
    ] as const) {
      it(`${label}: two concurrent submits — exactly one succeeds, the other gets 409`, async () => {
        for (let i = 0; i < ROUNDS; i++) {
          const draft = await freshDraft();
          const results = await Promise.all([
            call("submit", draft.id, "提交"),
            call("submit", draft.id, "提交"),
          ]);
          expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        }
      });

      it(`${label}: concurrent submit + draft never leaves a COMPLETED response with draft answers`, async () => {
        for (let i = 0; i < ROUNDS; i++) {
          const draft = await freshDraft();
          const results = await Promise.all([
            call("submit", draft.id, "提交"),
            call("draft", draft.id, "草稿"),
          ]);
          for (const r of results) expect([200, 409]).toContain(r.status);
          await expectCompletedKeepsSubmitAnswers(draft.id);
        }
      });
    }
  });
});
