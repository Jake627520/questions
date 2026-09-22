import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * API 邊界的 JSON body 驗證輔助。
 *
 * 在每個寫入端點開頭呼叫，把「請求進來的任意 JSON」收斂成「型別安全、形狀已驗」
 * 的資料，擋掉缺欄與型別混淆 (例如把 password 傳成物件/陣列)。跨欄位相等與需要
 * 查 DB 的 business 檢查 (密碼是否相符、Email 是否重複、token 是否有效) 仍留在
 * 各 route，以維持既有的 business error code/訊息。
 *
 * 用法：
 *   const parsed = await parseBody(req, LoginSchema);
 *   if (!parsed.ok) return parsed.response;
 *   const { email, password } = parsed.data;
 */
export async function parseBody<S extends z.ZodTypeAny>(
  req: NextRequest,
  schema: S
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = undefined;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "請求資料格式不正確",
          issues: result.error.flatten(),
        },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: result.data };
}

// 只驗「非空字串」形狀：擋缺欄與型別混淆；相等/重複/憑證等 business 檢查留在 route。
export const LoginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const RegisterSchema = z.object({
  // route 僅強制要求 email/password；name 與 confirmPassword 的處理留在 route，
  // 這裡只保證「若提供則為字串」，避免改動既有 business 行為。
  name: z.string().optional(),
  email: z.string().min(1),
  password: z.string().min(1),
  confirmPassword: z.string().optional(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  confirmPassword: z.string().optional(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
  confirmNewPassword: z.string().optional(),
});
