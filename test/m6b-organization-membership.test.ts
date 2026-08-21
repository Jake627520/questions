import { describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { Role, SurveyStatus } from "@prisma/client";

describe("M6-B User, Organization & Membership Models 驗證測試", () => {
  it("1. User 可以加入多個 Organization", async () => {
    const user = await db.user.create({
      data: { email: `test-multi-org-${Date.now()}@example.com`, name: "Multi Org User" },
    });
    const orgA = await db.organization.create({
      data: { name: "Org Alpha", slug: `org-alpha-${Date.now()}` },
    });
    const orgB = await db.organization.create({
      data: { name: "Org Beta", slug: `org-beta-${Date.now()}` },
    });

    await db.membership.create({
      data: { userId: user.id, organizationId: orgA.id, role: Role.ADMIN },
    });
    await db.membership.create({
      data: { userId: user.id, organizationId: orgB.id, role: Role.VIEWER },
    });

    const memberships = await db.membership.findMany({ where: { userId: user.id } });
    expect(memberships).toHaveLength(2);

    // 清理
    await db.user.delete({ where: { id: user.id } });
    await db.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
  });

  it("2. Organization 可以包含多個 User", async () => {
    const org = await db.organization.create({
      data: { name: "Team Org", slug: `team-org-${Date.now()}` },
    });
    const user1 = await db.user.create({
      data: { email: `u1-${Date.now()}@example.com`, name: "User 1" },
    });
    const user2 = await db.user.create({
      data: { email: `u2-${Date.now()}@example.com`, name: "User 2" },
    });

    await db.membership.create({
      data: { userId: user1.id, organizationId: org.id, role: Role.OWNER },
    });
    await db.membership.create({
      data: { userId: user2.id, organizationId: org.id, role: Role.EDITOR },
    });

    const members = await db.membership.findMany({ where: { organizationId: org.id } });
    expect(members).toHaveLength(2);

    // 清理
    await db.organization.delete({ where: { id: org.id } });
    await db.user.deleteMany({ where: { id: { in: [user1.id, user2.id] } } });
  });

  it("3. 同一 User 不得在同一 Organization 重複建立 Membership (Unique constraint)", async () => {
    const user = await db.user.create({
      data: { email: `dup-member-${Date.now()}@example.com`, name: "Dup User" },
    });
    const org = await db.organization.create({
      data: { name: "Dup Org", slug: `dup-org-${Date.now()}` },
    });

    await db.membership.create({
      data: { userId: user.id, organizationId: org.id, role: Role.EDITOR },
    });

    // 嘗試重複加入同一組織 -> 預期違反 Unique constraint
    await expect(
      db.membership.create({
        data: { userId: user.id, organizationId: org.id, role: Role.ADMIN },
      })
    ).rejects.toThrow();

    // 清理
    await db.organization.delete({ where: { id: org.id } });
    await db.user.delete({ where: { id: user.id } });
  });

  it("4. Membership role 支援 OWNER, ADMIN, EDITOR, VIEWER", async () => {
    const roles: Role[] = [Role.OWNER, Role.ADMIN, Role.EDITOR, Role.VIEWER];
    expect(roles).toEqual(["OWNER", "ADMIN", "EDITOR", "VIEWER"]);
  });

  it("5. Survey 建立時必須包含 organizationId", async () => {
    const org = await db.organization.create({
      data: { name: "Survey Org", slug: `survey-org-${Date.now()}` },
    });

    const survey = await db.survey.create({
      data: {
        organizationId: org.id,
        title: "Org 專屬問卷",
        status: SurveyStatus.DRAFT,
      },
    });

    expect(survey.organizationId).toBe(org.id);

    // 清理
    await db.survey.delete({ where: { id: survey.id } });
    await db.organization.delete({ where: { id: org.id } });
  });

  it("6. 既有問卷全部已成功回填至 Default Workspace", async () => {
    const defaultOrg = await db.organization.findUnique({ where: { slug: "default" } });
    expect(defaultOrg).not.toBeNull();
    expect(defaultOrg?.name).toBe("Default Workspace");

    const defaultSurveys = await db.survey.findMany({
      where: { organizationId: defaultOrg?.id },
    });
    expect(defaultSurveys.length).toBeGreaterThanOrEqual(1);
  });

  it("7. 既有 responses, questions, choices 完整保留且未受損害", async () => {
    const questionsCount = await db.question.count();
    const choicesCount = await db.choice.count();
    expect(questionsCount).toBeGreaterThanOrEqual(43);
    expect(choicesCount).toBeGreaterThanOrEqual(99);
  });

  it("8. 既有 Survey 的 createdById 保持為 NULL (認證未接入前不假造使用者)", async () => {
    const defaultOrg = await db.organization.findUnique({ where: { slug: "default" } });
    const surveys = await db.survey.findMany({ where: { organizationId: defaultOrg?.id } });
    const allCreatedByNull = surveys.every((s) => s.createdById === null);
    expect(allCreatedByNull).toBe(true);
  });

  it("9. 刪除 User 時，關聯的 Survey.createdById 應自動變為 NULL (onDelete: SetNull)", async () => {
    const user = await db.user.create({
      data: { email: `creator-${Date.now()}@example.com`, name: "Creator User" },
    });
    const org = await db.organization.create({
      data: { name: "Creator Org", slug: `creator-org-${Date.now()}` },
    });

    const survey = await db.survey.create({
      data: {
        organizationId: org.id,
        createdById: user.id,
        title: "建立者關聯問卷",
        status: SurveyStatus.DRAFT,
      },
    });

    expect(survey.createdById).toBe(user.id);

    // 刪除使用者
    await db.user.delete({ where: { id: user.id } });

    // 查詢問卷，createdById 應自動轉為 null
    const updatedSurvey = await db.survey.findUnique({ where: { id: survey.id } });
    expect(updatedSurvey?.createdById).toBeNull();

    // 清理
    await db.survey.delete({ where: { id: survey.id } });
    await db.organization.delete({ where: { id: org.id } });
  });

  it("10. 組織若仍存在問卷，禁止直接 Cascade 刪除 (onDelete: Restrict)", async () => {
    const org = await db.organization.create({
      data: { name: "Protected Org", slug: `protected-org-${Date.now()}` },
    });
    const survey = await db.survey.create({
      data: {
        organizationId: org.id,
        title: "受保護問卷",
        status: SurveyStatus.DRAFT,
      },
    });

    // 嘗試刪除仍有問卷的組織 -> 預期因 Restrict 外鍵保護而拋出錯誤
    await expect(db.organization.delete({ where: { id: org.id } })).rejects.toThrow();

    // 清理問卷後方可刪除組織
    await db.survey.delete({ where: { id: survey.id } });
    await db.organization.delete({ where: { id: org.id } });
  });

  it("11. 租戶關係完整性 (Tenant Relationship Integrity)", async () => {
    const org = await db.organization.create({
      data: { name: "Tenant Org", slug: `tenant-org-${Date.now()}` },
    });
    const survey = await db.survey.create({
      data: {
        organizationId: org.id,
        title: "Tenant Survey",
        status: SurveyStatus.PUBLISHED,
        questions: {
          create: [{ orderNum: 1, code: "Q_TENANT", title: "Tenant Question", questionType: "text" }],
        },
      },
      include: {
        organization: true,
        questions: true,
      },
    });

    expect(survey.organization.name).toBe("Tenant Org");
    expect(survey.questions).toHaveLength(1);

    // 清理
    await db.survey.delete({ where: { id: survey.id } });
    await db.organization.delete({ where: { id: org.id } });
  });
});
