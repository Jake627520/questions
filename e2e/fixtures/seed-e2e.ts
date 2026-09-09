import { db } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth";
import { SurveyStatus, QuestionType, ResponseStatus, Role } from "@prisma/client";

export const E2E_DATA = {
  orgA: {
    id: "e2e-org-a",
    name: "E2E Org Alpha",
    slug: "e2e-org-alpha",
  },
  orgB: {
    id: "e2e-org-b",
    name: "E2E Org Beta",
    slug: "e2e-org-beta",
  },
  users: {
    ownerA: {
      id: "e2e-user-owner-a",
      email: "owner.alpha@example.com",
      password: "Password123!",
      name: "Alpha Owner",
    },
    adminA: {
      id: "e2e-user-admin-a",
      email: "admin.alpha@example.com",
      password: "Password123!",
      name: "Alpha Admin",
    },
    editorA: {
      id: "e2e-user-editor-a",
      email: "editor.alpha@example.com",
      password: "Password123!",
      name: "Alpha Editor",
    },
    viewerA: {
      id: "e2e-user-viewer-a",
      email: "viewer.alpha@example.com",
      password: "Password123!",
      name: "Alpha Viewer",
    },
    memberA: {
      id: "e2e-user-member-a",
      email: "member.alpha@example.com",
      password: "Password123!",
      name: "Alpha Member",
    },
    ownerB: {
      id: "e2e-user-owner-b",
      email: "owner.beta@example.com",
      password: "Password123!",
      name: "Beta Owner",
    },
  },
  surveys: {
    publishedA: {
      id: "e2e-survey-pub-a-id",
      title: "E2E 產品體驗調查問卷",
      publicToken: "e2e-token-alpha-pub",
    },
    draftA: {
      id: "e2e-survey-draft-a-id",
      title: "E2E 草稿問卷待發布",
    },
    privateB: {
      id: "e2e-survey-private-b-id",
      title: "Beta 組織專屬私密問卷",
      publicToken: "e2e-token-beta-pub",
    },
  },
};

export async function seedE2E() {
  const commonPasswordHash = await hashPassword("Password123!");

  // 1. 建立或更新組織
  await db.organization.upsert({
    where: { id: E2E_DATA.orgA.id },
    update: { name: E2E_DATA.orgA.name, slug: E2E_DATA.orgA.slug },
    create: { id: E2E_DATA.orgA.id, name: E2E_DATA.orgA.name, slug: E2E_DATA.orgA.slug },
  });

  await db.organization.upsert({
    where: { id: E2E_DATA.orgB.id },
    update: { name: E2E_DATA.orgB.name, slug: E2E_DATA.orgB.slug },
    create: { id: E2E_DATA.orgB.id, name: E2E_DATA.orgB.name, slug: E2E_DATA.orgB.slug },
  });

  // 2. 建立或更新使用者與成員角色
  const userConfigs = [
    { u: E2E_DATA.users.ownerA, orgId: E2E_DATA.orgA.id, role: Role.OWNER },
    { u: E2E_DATA.users.adminA, orgId: E2E_DATA.orgA.id, role: Role.ADMIN },
    { u: E2E_DATA.users.editorA, orgId: E2E_DATA.orgA.id, role: Role.EDITOR },
    { u: E2E_DATA.users.viewerA, orgId: E2E_DATA.orgA.id, role: Role.VIEWER },
    { u: E2E_DATA.users.memberA, orgId: E2E_DATA.orgA.id, role: Role.VIEWER },
    { u: E2E_DATA.users.ownerB, orgId: E2E_DATA.orgB.id, role: Role.OWNER },
  ];

  for (const item of userConfigs) {
    await db.user.upsert({
      where: { id: item.u.id },
      update: { name: item.u.name, email: item.u.email, passwordHash: commonPasswordHash },
      create: { id: item.u.id, email: item.u.email, name: item.u.name, passwordHash: commonPasswordHash },
    });

    await db.membership.upsert({
      where: {
        userId_organizationId: {
          userId: item.u.id,
          organizationId: item.orgId,
        },
      },
      update: { role: item.role },
      create: {
        userId: item.u.id,
        organizationId: item.orgId,
        role: item.role,
      },
    });
  }

  // 3. 清理已存在的 E2E 專屬問卷資料
  await db.survey.deleteMany({
    where: {
      id: {
        in: [
          E2E_DATA.surveys.publishedA.id,
          E2E_DATA.surveys.draftA.id,
          E2E_DATA.surveys.privateB.id,
        ],
      },
    },
  });

  // 4. 建立 Org A 發布問卷 (含題目、選項與交叉分析用 Responses)
  const surveyPubA = await db.survey.create({
    data: {
      id: E2E_DATA.surveys.publishedA.id,
      organizationId: E2E_DATA.orgA.id,
      createdById: E2E_DATA.users.ownerA.id,
      title: E2E_DATA.surveys.publishedA.title,
      description: "這是一份用於 E2E 驗收測試的標準發布問卷",
      status: SurveyStatus.PUBLISHED,
      publicToken: E2E_DATA.surveys.publishedA.publicToken,
      version: 1,
      questions: {
        create: [
          {
            id: "e2e-q1-sat",
            orderNum: 1,
            code: "Q1",
            title: "整體滿意度",
            questionType: QuestionType.single_choice,
            required: true,
            choices: {
              create: [
                { id: "e2e-c1-vsat", label: "非常滿意", value: "very_satisfied", orderNum: 1 },
                { id: "e2e-c1-sat", label: "滿意", value: "satisfied", orderNum: 2 },
                { id: "e2e-c1-neu", label: "普通", value: "neutral", orderNum: 3 },
              ],
            },
          },
          {
            id: "e2e-q2-rec",
            orderNum: 2,
            code: "Q2",
            title: "推薦意願",
            questionType: QuestionType.single_choice,
            required: true,
            choices: {
              create: [
                { id: "e2e-c2-yes", label: "願意推薦", value: "yes", orderNum: 1 },
                { id: "e2e-c2-no", label: "不願意", value: "no", orderNum: 2 },
              ],
            },
          },
          {
            id: "e2e-q3-feed",
            orderNum: 3,
            code: "Q3",
            title: "其他意見回饋",
            questionType: QuestionType.text,
            required: false,
          },
        ],
      },
    },
  });

  // 5. 注入 8 筆作答以形成特定次數分布（觸發 k=5 匿名遮蔽）
  // 6 筆: Q1 非常滿意 + Q2 願意推薦
  for (let i = 0; i < 6; i++) {
    await db.response.create({
      data: {
        surveyId: surveyPubA.id,
        status: ResponseStatus.COMPLETED,
        submittedAt: new Date(),
        answers: {
          create: [
            {
              questionId: "e2e-q1-sat",
              rawValue: "very_satisfied",
              choices: { create: [{ choiceId: "e2e-c1-vsat" }] },
            },
            {
              questionId: "e2e-q2-rec",
              rawValue: "yes",
              choices: { create: [{ choiceId: "e2e-c2-yes" }] },
            },
          ],
        },
      },
    });
  }

  // 1 筆: Q1 普通 + Q2 不願意 (次數為 1，< 5，觸發 Primary Suppression)
  await db.response.create({
    data: {
      surveyId: surveyPubA.id,
      status: ResponseStatus.COMPLETED,
      submittedAt: new Date(),
      answers: {
        create: [
          {
            questionId: "e2e-q1-sat",
            rawValue: "neutral",
            choices: { create: [{ choiceId: "e2e-c1-neu" }] },
          },
          {
            questionId: "e2e-q2-rec",
            rawValue: "no",
            choices: { create: [{ choiceId: "e2e-c2-no" }] },
          },
        ],
      },
    },
  });

  // 1 筆: Q1 普通 + Q2 願意推薦 (次數為 1，觸發 Complementary Suppression)
  await db.response.create({
    data: {
      surveyId: surveyPubA.id,
      status: ResponseStatus.COMPLETED,
      submittedAt: new Date(),
      answers: {
        create: [
          {
            questionId: "e2e-q1-sat",
            rawValue: "neutral",
            choices: { create: [{ choiceId: "e2e-c1-neu" }] },
          },
          {
            questionId: "e2e-q2-rec",
            rawValue: "yes",
            choices: { create: [{ choiceId: "e2e-c2-yes" }] },
          },
        ],
      },
    },
  });

  // 6. 建立 Org A 草稿問卷 (供 E2E-02 / E2E-04 測試生命週期與複製)
  await db.survey.create({
    data: {
      id: E2E_DATA.surveys.draftA.id,
      organizationId: E2E_DATA.orgA.id,
      createdById: E2E_DATA.users.ownerA.id,
      title: E2E_DATA.surveys.draftA.title,
      description: "此為草稿問卷，尚未正式開放",
      status: SurveyStatus.DRAFT,
      version: 1,
      questions: {
        create: [
          {
            id: "e2e-draft-q1",
            orderNum: 1,
            code: "Q1",
            title: "草稿第一題目",
            questionType: QuestionType.single_choice,
            required: true,
            choices: {
              create: [
                { id: "e2e-draft-c1", label: "選項 A", value: "A", orderNum: 1 },
                { id: "e2e-draft-c2", label: "選項 B", value: "B", orderNum: 2 },
              ],
            },
          },
        ],
      },
    },
  });

  // 7. 建立 Org B 私有問卷 (供 E2E-08 驗證跨租戶完全阻隔)
  await db.survey.create({
    data: {
      id: E2E_DATA.surveys.privateB.id,
      organizationId: E2E_DATA.orgB.id,
      createdById: E2E_DATA.users.ownerB.id,
      title: E2E_DATA.surveys.privateB.title,
      description: "這是屬於 Org B 的私密機密數據",
      status: SurveyStatus.PUBLISHED,
      publicToken: E2E_DATA.surveys.privateB.publicToken,
      version: 1,
      questions: {
        create: [
          {
            id: "e2e-b-q1",
            orderNum: 1,
            code: "QB1",
            title: "Org B 私有題目內容機密",
            questionType: QuestionType.single_choice,
            required: true,
            choices: {
              create: [{ id: "e2e-b-c1", label: "機密選項", value: "1", orderNum: 1 }],
            },
          },
        ],
      },
    },
  });

  console.log("✅ E2E Test Fixtures successfully seeded into database.");
}
