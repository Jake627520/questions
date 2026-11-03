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
      ["outsider", otherOrgId, Role.OWNER],
    ];
    const ids: Record<string, string> = {};
    for (const [name, org, role] of users) {
      const u = await db.user.create({
        data: {
          email: `${emailPrefix}${name}@example.com`,
          name,
          passwordHash,
          memberships: { create: { organizationId: org, role } },
        },
      });
      ids[name] = u.id;
      tokens[name] = (await createSession(u.id)).token;
    }

    survey = await db.survey.create({
      data: {
        title: "Sec 2611 survey",
        organizationId: orgId,
        createdById: ids.owner,
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
        { params: { id: survey.id } }
      );
      expect(res.status).toBe(403);
      expect(await answerCount(completed.id)).toBe(1);
    });

    it("VIEWER cannot resurrect an EXCLUDED response via submit (403)", async () => {
      const res = await memberSubmitPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/submit`, "POST", { responseId: excluded.id, answers: [] }, tokens.viewer),
        { params: { id: survey.id } }
      );
      expect(res.status).toBe(403);
      expect(await statusOf(excluded.id)).toBe(ResponseStatus.EXCLUDED);
    });

    it("EDITOR cannot overwrite a COMPLETED response via draft (409)", async () => {
      const res = await memberDraftPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/draft`, "POST", { responseId: completed.id, answers: [] }, tokens.editor),
        { params: { id: survey.id } }
      );
      expect(res.status).toBe(409);
      expect(await answerCount(completed.id)).toBe(1);
    });

    it("EDITOR cannot resubmit an EXCLUDED response (409)", async () => {
      const res = await memberSubmitPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/submit`, "POST", { responseId: excluded.id, answers: [] }, tokens.editor),
        { params: { id: survey.id } }
      );
      expect(res.status).toBe(409);
      expect(await statusOf(excluded.id)).toBe(ResponseStatus.EXCLUDED);
    });

    it("EDITOR can still continue and submit an IN_PROGRESS draft", async () => {
      const draftRes = await memberDraftPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/draft`, "POST", { responseId: inProgress.id, answers: [] }, tokens.editor),
        { params: { id: survey.id } }
      );
      expect(draftRes.status).toBe(200);
      const submitRes = await memberSubmitPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/submit`, "POST", { responseId: inProgress.id, answers: [] }, tokens.editor),
        { params: { id: survey.id } }
      );
      expect(submitRes.status).toBe(200);
      expect(await statusOf(inProgress.id)).toBe(ResponseStatus.COMPLETED);
    });

    it("VIEWER can still start a new response without responseId", async () => {
      const res = await memberDraftPOST(
        jsonReq(`http://localhost/api/surveys/${survey.id}/draft`, "POST", { answers: [] }, tokens.viewer),
        { params: { id: survey.id } }
      );
      expect(res.status).toBe(200);
    });
  });

  // [Medium] GET /api/surveys/[id] 非 management 模式
  describe("survey detail GET requires membership and hides internal fields", () => {
    it("anonymous GET is rejected (401)", async () => {
      const res = await surveyGET(getReq(`http://localhost/api/surveys/${survey.id}`), { params: { id: survey.id } });
      expect(res.status).toBe(401);
    });

    it("non-member GET is rejected (403)", async () => {
      const res = await surveyGET(getReq(`http://localhost/api/surveys/${survey.id}`, tokens.outsider), {
        params: { id: survey.id },
      });
      expect(res.status).toBe(403);
    });

    it("member fill view omits creator email, publicToken and version tree", async () => {
      const res = await surveyGET(getReq(`http://localhost/api/surveys/${survey.id}`, tokens.viewer), {
        params: { id: survey.id },
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
        params: { id: survey.id, responseId: r.id },
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
        { params: { id: survey.id, responseId: r.id } }
      );
      expect(res.status).toBe(401);
      expect(await statusOf(r.id)).toBeDefined();
    });

    it("non-member GET of IN_PROGRESS response is rejected (403)", async () => {
      const res = await responseGET(
        getReq(`http://localhost/api/surveys/${survey.id}/responses/${inProgress.id}`, tokens.outsider),
        { params: { id: survey.id, responseId: inProgress.id } }
      );
      expect(res.status).toBe(403);
    });

    it("EDITOR cannot delete an EXCLUDED response (needs MANAGERS)", async () => {
      const res = await responseDELETE(
        getReq(`http://localhost/api/surveys/${survey.id}/responses/${excluded.id}?force=true`, tokens.editor, "DELETE"),
        { params: { id: survey.id, responseId: excluded.id } }
      );
      expect(res.status).toBe(403);
      expect(await statusOf(excluded.id)).toBe(ResponseStatus.EXCLUDED);
    });

    it("VIEWER cannot delete an IN_PROGRESS draft; EDITOR can", async () => {
      const url = `http://localhost/api/surveys/${survey.id}/responses/${inProgress.id}`;
      const viewerRes = await responseDELETE(getReq(url, tokens.viewer, "DELETE"), {
        params: { id: survey.id, responseId: inProgress.id },
      });
      expect(viewerRes.status).toBe(403);
      const editorRes = await responseDELETE(getReq(url, tokens.editor, "DELETE"), {
        params: { id: survey.id, responseId: inProgress.id },
      });
      expect(editorRes.status).toBe(200);
    });

    it("member can still load an IN_PROGRESS draft", async () => {
      const res = await responseGET(
        getReq(`http://localhost/api/surveys/${survey.id}/responses/${inProgress.id}`, tokens.viewer),
        { params: { id: survey.id, responseId: inProgress.id } }
      );
      expect(res.status).toBe(200);
    });
  });

});
