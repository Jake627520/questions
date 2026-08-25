-- CreateTable
CREATE TABLE "report_exports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "survey_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" "Role" NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "time_range" TEXT,
    "date_from" TEXT,
    "date_to" TEXT,
    "report_schema_version" TEXT NOT NULL DEFAULT 'v1.0.0',
    "file_size" INTEGER,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_exports_organization_id_idx" ON "report_exports"("organization_id");

-- CreateIndex
CREATE INDEX "report_exports_survey_id_idx" ON "report_exports"("survey_id");

-- CreateIndex
CREATE INDEX "report_exports_actor_id_idx" ON "report_exports"("actor_id");

-- CreateIndex
CREATE INDEX "report_exports_expires_at_idx" ON "report_exports"("expires_at");

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
