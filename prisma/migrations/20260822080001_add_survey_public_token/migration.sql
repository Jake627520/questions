-- AlterTable
ALTER TABLE "surveys" ADD COLUMN "public_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "surveys_public_token_key" ON "surveys"("public_token");
