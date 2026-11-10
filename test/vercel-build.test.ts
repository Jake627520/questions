import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveMigrateDatabaseUrl,
  shouldRunProductionMigrate,
} from "../scripts/vercel-build.mjs";

const script = path.resolve(__dirname, "../scripts/vercel-build.mjs");

describe("vercel production migrate gate", () => {
  it("migrates only when VERCEL_ENV is exactly production", () => {
    expect(shouldRunProductionMigrate({ VERCEL_ENV: "production" })).toBe(true);
    expect(shouldRunProductionMigrate({ VERCEL_ENV: "preview" })).toBe(false);
    expect(shouldRunProductionMigrate({ VERCEL_ENV: "development" })).toBe(false);
    expect(shouldRunProductionMigrate({})).toBe(false);
    expect(shouldRunProductionMigrate({ VERCEL_ENV: "Production" })).toBe(false);
    expect(shouldRunProductionMigrate({ NODE_ENV: "production" })).toBe(false);
  });

  it("uses an existing non-pooled URL for migrate deploy and otherwise DATABASE_URL", () => {
    expect(resolveMigrateDatabaseUrl({ DATABASE_URL: "postgres://app" })).toEqual({
      source: "DATABASE_URL",
      url: "postgres://app",
    });
    expect(
      resolveMigrateDatabaseUrl({
        DATABASE_URL: "postgres://pooled",
        DIRECT_URL: "postgres://direct",
      }).source
    ).toBe("DIRECT_URL");
    expect(
      resolveMigrateDatabaseUrl({
        DATABASE_URL: "postgres://pooled",
        DIRECT_URL: "   ",
        DATABASE_URL_UNPOOLED: "postgres://unpooled",
      })
    ).toEqual({ source: "DATABASE_URL_UNPOOLED", url: "postgres://unpooled" });
    expect(
      resolveMigrateDatabaseUrl({
        POSTGRES_URL_NON_POOLING: "postgres://nonpooling",
      }).source
    ).toBe("POSTGRES_URL_NON_POOLING");
  });

  it("fails the production build when migrate deploy cannot connect, without db push", () => {
    const env = { ...process.env };
    delete env.DIRECT_URL;
    delete env.DATABASE_URL_UNPOOLED;
    delete env.POSTGRES_URL_NON_POOLING;
    env.VERCEL_ENV = "production";
    env.DATABASE_URL = "postgresql://postgres:postgrespassword@127.0.0.1:59999/survey_db?connect_timeout=2";

    const result = spawnSync(process.execPath, [script], {
      cwd: path.resolve(__dirname, ".."),
      env,
      encoding: "utf8",
      timeout: 25000,
    });

    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const source = readFileSync(script, "utf8");
    expect(result.status).not.toBe(0);
    expect(output).toContain("P1001");
    expect(output).toContain("prisma migrate deploy failed");
    expect(output).toContain("previous deployment");
    expect(output).toContain("does not run prisma db push");
    expect(output).not.toContain("Compiled successfully");
    expect(source.includes('["migrate", "deploy"]')).toBe(true);
    expect(source.includes('["db", "push"]')).toBe(false);
  }, 30000);
});
