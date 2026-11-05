import { Prisma, ResponseStatus } from "@prisma/client";

export class ResponseNotEditableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResponseNotEditableError";
  }
}

/**
 * 在 transaction 內原子地「佔住」一筆 IN_PROGRESS 作答。
 *
 * UPDATE ... WHERE status = 'IN_PROGRESS' 會拿到該列的列鎖；並發的另一個請求會等鎖，
 * 鎖釋放後 Postgres 重新評估 WHERE，若狀態已被改成 COMPLETED/EXCLUDED 就更新 0 列。
 * 因此「檢查狀態」與「寫入」不會被其他請求插隊（TOCTOU）。
 *
 * data 預設只把 status 寫回 IN_PROGRESS（草稿用，等同只取鎖）；提交時傳入 COMPLETED 等欄位。
 */
export async function claimInProgressResponse(
  tx: Prisma.TransactionClient,
  where: { id: string; surveyId: string },
  data: Prisma.ResponseUpdateManyMutationInput,
  notEditableMessage: string
): Promise<void> {
  const { count } = await tx.response.updateMany({
    where: { id: where.id, surveyId: where.surveyId, status: ResponseStatus.IN_PROGRESS },
    data,
  });
  if (count !== 1) {
    throw new ResponseNotEditableError(notEditableMessage);
  }
}
