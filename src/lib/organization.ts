import { db } from "@/lib/db";

/**
 * 取得或確保系統預設工作區 (Default Workspace) 的 ID
 * 供未接入 Authentication / Multi-tenant 選擇器前的過渡期使用
 */
export async function getDefaultOrganizationId(): Promise<string> {
  const defaultOrg = await db.organization.findUnique({
    where: { slug: "default" },
  });
  if (defaultOrg) {
    return defaultOrg.id;
  }

  const created = await db.organization.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      id: "default-org-id",
      name: "Default Workspace",
      slug: "default",
    },
  });
  return created.id;
}
