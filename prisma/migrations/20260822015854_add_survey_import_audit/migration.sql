-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'IMPORTING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "survey_imports" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "survey_id" TEXT,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "file_name" TEXT,
    "file_size" INTEGER,
    "mode" TEXT NOT NULL DEFAULT 'save',
    "status" "ImportStatus" NOT NULL DEFAULT 'IMPORTING',
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "choice_count" INTEGER NOT NULL DEFAULT 0,
    "required_count" INTEGER NOT NULL DEFAULT 0,
    "scored_count" INTEGER NOT NULL DEFAULT 0,
    "conditional_count" INTEGER NOT NULL DEFAULT 0,
    "copyright_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "error_code" TEXT,
    "error_message" TEXT,
    "error_details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "survey_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "survey_imports_import_id_key" ON "survey_imports"("import_id");

-- CreateIndex
CREATE INDEX "survey_imports_organization_id_idx" ON "survey_imports"("organization_id");

-- CreateIndex
CREATE INDEX "survey_imports_survey_id_idx" ON "survey_imports"("survey_id");

-- CreateIndex
CREATE INDEX "survey_imports_status_idx" ON "survey_imports"("status");

-- CreateIndex
CREATE INDEX "survey_imports_created_at_idx" ON "survey_imports"("created_at");

-- AddForeignKey
ALTER TABLE "survey_imports" ADD CONSTRAINT "survey_imports_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_imports" ADD CONSTRAINT "survey_imports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_imports" ADD CONSTRAINT "survey_imports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
