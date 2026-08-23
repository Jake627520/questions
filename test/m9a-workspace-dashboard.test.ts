import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/lib/db";
import {
  hashPassword,
  createSession,
  generatePublicToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { NextRequest } from "next/server";
import { Role, SurveyStatus, QuestionType } from "@prisma/client";
import { GET as surveysGET } from "../src/app/api/surveys/route";

describe("Phase M9-A: Enterprise Survey Workspace & Dashboard Suite", () => {
  let orgA: any;
  let orgB: any;
  let userA: any;
  let userB: any;
  let sessionTokenA: string;
  let sessionTokenB: string;

  let surveyPublished: any;
  let surveyDraft: any;
  let surveyClosed: any;
  let surveyOrgB: any;

  const makeAuthReq = (url: string, token: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    };
    return new NextRequest(url, { headers });
  };

  beforeEach(async () => {
    // 1. 清理測試資料
    await db.answer.deleteMany({
      where: { response: { survey: { organization: { slug: { startsWith: "m9a-" } } } } },
    });
    await db.response.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9a-" } } } },
    });
    await db.choice.deleteMany({
      where: { question: { survey: { organization: { slug: { startsWith: "m9a-" } } } } },
    });
    await db.question.deleteMany({
      where: { survey: { organization: { slug: { startsWith: "m9a-" } } } },
    });
    await db.survey.deleteMany({
      where: { organization: { slug: { startsWith: "m9a-" } } },
    });
    await db.invitation.deleteMany({
      where: { organization: { slug: { startsWith: "m9a-" } } },
    });
    await db.membership.deleteMany({
      where: { organization: { slug: { startsWith: "m9a-" } } },
    });
    await db.organization.deleteMany({
      where: { slug: { startsWith: "m9a-" } },
    });
    await db.session.deleteMany({
      where: { user: { email: { startsWith: "m9a-" } } },
    });
    await db.user.deleteMany({
      where: { email: { startsWith: "m9a-" } },
    });

    const defaultPwd = await hashPassword("M9APassword123!");

    // 2. 建立組織 A 與 B
    orgA = await db.organization.create({
      data: { name: "Org Alpha Workspace", slug: "m9a-org-alpha" },
    });
    orgB = await db.organization.create({
      data: { name: "Org Beta Workspace", slug: "m9a-org-beta" },
    });

    // 3. 建立使用者
    userA = await db.user.create({
      data: {
        email: "m9a-user-a@alpha.com",
        name: "Alice Alpha",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgA.id, role: Role.ADMIN } },
      },
    });

    userB = await db.user.create({
      data: {
        email: "m9a-user-b@beta.com",
        name: "Bob Beta",
        passwordHash: defaultPwd,
        memberships: { create: { organizationId: orgB.id, role: Role.ADMIN } },
      },
    });

    sessionTokenA = (await createSession(userA.id)).token;
    sessionTokenB = (await createSession(userB.id)).token;

    // 4. 建立多種狀態的問卷
    surveyPublished = await db.survey.create({
      data: {
        organizationId: orgA.id,
        createdById: userA.id,
        publicToken: generatePublicToken(),
        title: "Alpha Customer Satisfaction 2026",
        description: "Annual satisfaction survey",
        status: SurveyStatus.PUBLISHED,
        version: 1,
        questions: {
          create: [
            {
              orderNum: 1,
              code: "Q1",
              title: "Rate service",
              questionType: QuestionType.single_choice,
              choices: {
                create: [
                  { orderNum: 1, label: "Good", value: "G", score: 10 },
                  { orderNum: 2, label: "Bad", value: "B", score: 0 },
                ],
              },
            },
          ],
        },
      },
    });

    surveyDraft = await db.survey.create({
      data: {
        organizationId: orgA.id,
        createdById: userA.id,
        publicToken: generatePublicToken(),
        title: "Alpha Employee Engagement Draft",
        description: "Internal draft survey",
        status: SurveyStatus.DRAFT,
        version: 1,
      },
    });

    surveyClosed = await db.survey.create({
      data: {
        organizationId: orgA.id,
        createdById: userA.id,
        publicToken: generatePublicToken(),
        title: "Alpha Event Feedback 2025 (Closed)",
        description: "Past event survey",
        status: SurveyStatus.CLOSED,
        version: 2,
      },
    });

    surveyOrgB = await db.survey.create({
      data: {
        organizationId: orgB.id,
        createdById: userB.id,
        publicToken: generatePublicToken(),
        title: "Beta Secret Strategy Survey",
        description: "Beta internal confidential",
        status: SurveyStatus.PUBLISHED,
        version: 1,
      },
    });
  });

  describe("1. Workspace Dashboard List & Metrics API (GET /api/surveys)", () => {
    it("已登入使用者查詢當前工作區問卷列表，正確回傳問卷陣列與統計指標欄位", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys?organizationId=${orgA.id}`,
        sessionTokenA
      );
      const res = await surveysGET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.surveys)).toBe(true);
      expect(data.surveys.length).toBe(3);

      const publishedItem = data.surveys.find((s: any) => s.id === surveyPublished.id);
      expect(publishedItem).toBeDefined();
      expect(publishedItem.title).toBe("Alpha Customer Satisfaction 2026");
      expect(publishedItem.status).toBe("PUBLISHED");
      expect(publishedItem.version).toBe(1);
      expect(publishedItem.organization.id).toBe(orgA.id);
      expect(publishedItem.createdBy.email).toBe("m9a-user-a@alpha.com");
      expect(publishedItem._count.questions).toBe(1);
      expect(publishedItem._count.responses).toBe(0);
    });

    it("不同狀態 (PUBLISHED, DRAFT, CLOSED) 之問卷在列表中均能精準呈現其屬性與版本號", async () => {
      const req = makeAuthReq(
        `http://localhost:3000/api/surveys?organizationId=${orgA.id}`,
        sessionTokenA
      );
      const res = await surveysGET(req);
      const data = await res.json();

      const statuses = data.surveys.map((s: any) => s.status);
      expect(statuses).toContain("PUBLISHED");
      expect(statuses).toContain("DRAFT");
      expect(statuses).toContain("CLOSED");

      const closedItem = data.surveys.find((s: any) => s.id === surveyClosed.id);
      expect(closedItem.version).toBe(2);
    });

    it("工作區邊界隔離：User A 查詢問卷列表絕不會混入 Org B 的問卷", async () => {
      const req = makeAuthReq("http://localhost:3000/api/surveys", sessionTokenA);
      const res = await surveysGET(req);
      const data = await res.json();

      const surveyIds = data.surveys.map((s: any) => s.id);
      expect(surveyIds).not.toContain(surveyOrgB.id);
    });
  });
});
