-- AlterEnum
ALTER TYPE "ResponseStatus" ADD VALUE 'EXCLUDED';

-- AlterTable
ALTER TABLE "responses" ADD COLUMN "idempotency_key" TEXT,
ADD COLUMN "payload_hash" TEXT,
ADD COLUMN "ip_hash" TEXT,
ADD COLUMN "ip_hash_version" TEXT DEFAULT 'v1',
ADD COLUMN "user_agent" TEXT,
ADD COLUMN "duration_seconds" INTEGER,
ADD COLUMN "started_at" TIMESTAMP(3),
ADD COLUMN "excluded_reason" TEXT,
ADD COLUMN "excluded_at" TIMESTAMP(3),
ADD COLUMN "excluded_by_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "responses_survey_id_idempotency_key_key" ON "responses"("survey_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "responses_survey_id_status_idx" ON "responses"("survey_id", "status");

-- CreateIndex
CREATE INDEX "responses_survey_id_submitted_at_idx" ON "responses"("survey_id", "submitted_at");
