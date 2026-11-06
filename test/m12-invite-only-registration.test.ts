import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { db } from "../src/lib/db";
import {
  hashPassword,
  generateInvitationToken,
  hashInvitationToken,
  ACTIVE_ORG_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth";
import { POST as registerPOST } from "../src/app/api/auth/register/route";
import { POST as loginPOST } from "../src/app/api/auth/login/route";

const PREFIX = "m12-";
const PASSWORD = "InviteOnlyPass123!";

function registerReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("M12: invite-only registration", () => {
  let org: any;
  let owner: any;

  async function createInvite(
    email: string,
    overrides: Partial<{ expiresAt: Date; usedAt: Date; revokedAt: Date; role: Role }> = {}
  ) {
    const rawToken = generateInvitationToken();
    const invitation = await db.invitation.create({
      data: {
        organizationId: org.id,
        invitedEmail: email,
        role: overrides.role ?? Role.EDITOR,
        tokenHash: hashInvitationToken(rawToken),
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 86_400_000),
        usedAt: overrides.usedAt,
        revokedAt: overrides.revokedAt,
        createdById: owner.id,
      },
    });
    return { rawToken, invitation };
  }

  beforeEach(async () => {
    await db.invitation.deleteMany({ where: { organization: { slug: { startsWith: PREFIX } } } });
    await db.session.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
    await db.membership.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
    await db.organization.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });

    org = await db.organization.create({ data: { name: "M12 Org", slug: `${PREFIX}org` } });
    owner = await db.user.create({
      data: {
        email: `${PREFIX}owner@example.com`,
        name: "M12 Owner",
        passwordHash: await hashPassword(PASSWORD),
        memberships: { create: { organizationId: org.id, role: Role.OWNER } },
      },
    });
  });

  it("rejects registration without an invite token and creates no user", async () => {
    const email = `${PREFIX}stranger@example.com`;
    const res = await registerPOST(
      registerReq({ name: "x", email, password: PASSWORD, confirmPassword: PASSWORD })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("INVITATION_REQUIRED");
    expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it("rejects an unknown invite token", async () => {
    const email = `${PREFIX}stranger@example.com`;
    const res = await registerPOST(
      registerReq({ email, password: PASSWORD, inviteToken: generateInvitationToken() })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("INVALID_INVITATION");
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
    ["used", { usedAt: new Date() }],
    ["revoked", { revokedAt: new Date() }],
  ])("rejects a %s invitation", async (_label, overrides) => {
    const email = `${PREFIX}invitee@example.com`;
    const { rawToken } = await createInvite(email, overrides);
    const res = await registerPOST(registerReq({ email, password: PASSWORD, inviteToken: rawToken }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("INVALID_INVITATION");
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it("rejects when the email does not match the invited email", async () => {
    const { rawToken, invitation } = await createInvite(`${PREFIX}invitee@example.com`);
    const other = `${PREFIX}other@example.com`;
    const res = await registerPOST(registerReq({ email: other, password: PASSWORD, inviteToken: rawToken }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("EMAIL_MISMATCH");
    expect(await db.user.findUnique({ where: { email: other } })).toBeNull();
    const after = await db.invitation.findUnique({ where: { id: invitation.id } });
    expect(after?.usedAt).toBeNull();
  });

  it("registers an invited email, joins the inviting org with the invited role, and consumes the token", async () => {
    const email = `${PREFIX}invitee@example.com`;
    const { rawToken, invitation } = await createInvite(email, { role: Role.EDITOR });
    const res = await registerPOST(
      registerReq({
        name: "受邀者",
        email: "  M12-Invitee@Example.com ",
        password: PASSWORD,
        confirmPassword: PASSWORD,
        inviteToken: rawToken,
      })
    );
    expect(res.status).toBe(201);
    expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeDefined();
    expect(res.cookies.get(ACTIVE_ORG_COOKIE_NAME)?.value).toBe(org.id);

    const user = await db.user.findUnique({ where: { email }, include: { memberships: true } });
    expect(user?.memberships).toHaveLength(1);
    expect(user?.memberships[0]).toMatchObject({ organizationId: org.id, role: Role.EDITOR });

    const after = await db.invitation.findUnique({ where: { id: invitation.id } });
    expect(after?.usedAt).not.toBeNull();
  });

  it("does not allow the same invite token to be used twice", async () => {
    const email = `${PREFIX}invitee@example.com`;
    const { rawToken } = await createInvite(email);
    const first = await registerPOST(registerReq({ email, password: PASSWORD, inviteToken: rawToken }));
    expect(first.status).toBe(201);
    await db.user.delete({ where: { email } });
    const second = await registerPOST(registerReq({ email, password: PASSWORD, inviteToken: rawToken }));
    expect(second.status).toBe(403);
    expect((await second.json()).error).toBe("INVALID_INVITATION");
  });

  it("existing accounts still log in", async () => {
    const res = await loginPOST(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: owner.email, password: PASSWORD }),
      })
    );
    expect(res.status).toBe(200);
    expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeDefined();
  });
});
