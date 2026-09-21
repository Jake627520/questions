/**
 * Excel / CSV 公式注入 (Formula Injection / CSV Injection) 防護。
 *
 * 當一個儲存格 (或 CSV 欄位) 以 = + - @ 開頭時，Excel / Google Sheets 會把它
 * 當成公式執行；受訪者可在自由填答文字裡塞 `=cmd|...`、`=HYPERLINK(...)` 等，
 * 管理員匯出後開啟即可能被觸發。這裡對「使用者可控字串」在寫入儲存格前做中和：
 * 若以危險字元開頭 (含前導 tab / CR，某些解析器亦視為公式起始)，前置單引號 `'`，
 * 強制以純文字呈現。數值、null、非字串一律原樣返回 (不影響統計欄位)。
 *
 * 匯出端一律用 escapeFormulaString(字串) 或 safeCell(任意值)。
 */

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/** 中和單一字串；非危險開頭者原樣返回 */
export function escapeFormulaString(value: string): string {
  if (value.length > 0 && FORMULA_TRIGGER.test(value)) {
    return "'" + value;
  }
  return value;
}

/** 供混合型 (string | number | null | …) 儲存格值使用：字串才中和，其餘原樣 */
export function safeCell<T>(value: T): T | string {
  return typeof value === "string" ? escapeFormulaString(value) : value;
}
