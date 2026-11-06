-- AlterTable
ALTER TABLE "responses" ADD COLUMN "created_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
