-- AlterEnum
ALTER TYPE "SurveyStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "surveys" ADD COLUMN "start_date" TIMESTAMP(3),
ADD COLUMN "end_date" TIMESTAMP(3),
ADD COLUMN "response_quota" INTEGER;
