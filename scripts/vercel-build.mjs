/**
 * Vercel build entry.
 *
 * `prisma migrate deploy` runs only when VERCEL_ENV is exactly "production",
 * and it runs before `next build`. Preview builds often share the production
 * DATABASE_URL; migrating from a preview would rename sessions.token while
 * the live deployment still expects that column.
 *
 * Local `npm run build`, CI, and Docker leave VERCEL_ENV unset, so they do
 * not migrate. Opt in with VERCEL_ENV=production.
 *
 * A failed migrate deploy exits non-zero. There is no `db push` fallback and
 * no `--accept-data-loss`. Vercel then keeps the previous deployment.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Non-pooled URLs already present in the environment. Schema has no directUrl. */
export const DIRECT_URL_KEYS = [
  "DIRECT_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
];

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function shouldRunProductionMigrate(env = process.env) {
  return env.VERCEL_ENV === "production";
}

/**
 * Prisma reads DATABASE_URL only (no directUrl in schema.prisma).
 * When a non-pooled URL is already set, migrate deploy uses that and the
 * Next build keeps the original DATABASE_URL.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ source: string, url: string }}
 */
export function resolveMigrateDatabaseUrl(env = process.env) {
  for (const key of DIRECT_URL_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.trim() !== "") {
      return { source: key, url: value };
    }
  }
  const url = env.DATABASE_URL;
  return { source: "DATABASE_URL", url: typeof url === "string" ? url : "" };
}

function run(bin, args, env, capture) {
  const result = spawnSync(bin, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error) {
    console.error(result.error.message);
    return { status: 1, output: `${result.error.message}` };
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return { status: result.status === 0 ? 0 : result.status ?? 1, output };
}

function main() {
  const env = process.env;

  if (shouldRunProductionMigrate(env)) {
    const { source, url } = resolveMigrateDatabaseUrl(env);
    console.log("VERCEL_ENV=production: running prisma migrate deploy before next build.");
    console.log(
      "If 20261110120000_hash_session_tokens is pending, it deletes every session. Users must sign in again."
    );
    console.log(`migrate deploy connection source: ${source} (value not printed).`);
    if (source === "DATABASE_URL") {
      console.log(
        "schema.prisma has no directUrl, so Prisma does not read DIRECT_URL unless this script finds DIRECT_URL, DATABASE_URL_UNPOOLED, or POSTGRES_URL_NON_POOLING."
      );
      console.log(
        "A Neon pooler URL cannot take Prisma's advisory lock. If migrate deploy fails for that reason, point one of those variables at the direct Neon host. This build will not fall back to db push."
      );
    } else {
      console.log(
        "Next build still uses DATABASE_URL. Only the migrate deploy process uses the non-pooled URL."
      );
    }

    if (!url.trim()) {
      console.error("Refusing to migrate: database URL is empty. Build failed.");
      process.exit(1);
    }

    const prismaBin = path.join(root, "node_modules", ".bin", "prisma");
    const migrated = run(prismaBin, ["migrate", "deploy"], { ...env, DATABASE_URL: url }, true);
    if (migrated.status !== 0) {
      console.error(
        "prisma migrate deploy failed. Stopping the build so Vercel keeps the previous deployment."
      );
      console.error("This script does not run prisma db push and does not pass --accept-data-loss.");
      if (migrated.output.includes("P3005")) {
        console.error(
          "P3005: the database is not empty and has no Prisma migration history (typical of prisma db push)."
        );
        console.error(
          "Do not mark 20261110120000_hash_session_tokens as applied. Baseline only migrations already present in the live schema, then redeploy. See the README deploy section."
        );
      }
      process.exit(migrated.status || 1);
    }
  } else {
    console.log(
      `Skipping prisma migrate deploy (VERCEL_ENV=${env.VERCEL_ENV ?? "unset"}). Migrations run only when VERCEL_ENV is exactly "production".`
    );
  }

  const prismaBin = path.join(root, "node_modules", ".bin", "prisma");
  const nextBin = path.join(root, "node_modules", ".bin", "next");
  const generated = run(prismaBin, ["generate"], env);
  if (generated.status !== 0) process.exit(generated.status || 1);
  const built = run(nextBin, ["build"], env);
  if (built.status !== 0) process.exit(built.status || 1);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
