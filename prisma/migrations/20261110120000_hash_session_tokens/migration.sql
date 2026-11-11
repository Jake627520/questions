-- Session rows stored the raw bearer token. Those values cannot be turned
-- into SHA-256 hashes, and renaming the column in place would leave the
-- secrets in the database. Drop every session so users sign in again.
DELETE FROM "sessions";

ALTER TABLE "sessions" RENAME COLUMN "token" TO "token_hash";

ALTER INDEX "sessions_token_key" RENAME TO "sessions_token_hash_key";
ALTER INDEX "sessions_token_idx" RENAME TO "sessions_token_hash_idx";
