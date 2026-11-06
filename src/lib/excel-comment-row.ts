import type ExcelJS from "exceljs";

/**
 * 取得儲存格的純文字（rich text / hyperlink / formula 皆轉成文字）。
 * 前後端共用，不得引入任何 Node.js 專屬模組。
 */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    const v = value as any;
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join("");
    if ("text" in v) return String(v.text ?? "");
    if ("result" in v) return String(v.result ?? "");
    if ("formula" in v) return String(v.formula ?? "");
  }
  return String(value);
}

/**
 * 註解列規則：該列第一個非空白儲存格的文字以 `#` 開頭，整列忽略
 * （不計數、不驗證、不報錯）。範本第 2 列的中文欄位說明即以此規則略過。
 */
export function isCommentRow(row: ExcelJS.Row): boolean {
  let first: string | null = null;
  row.eachCell((cell) => {
    if (first !== null) return;
    const text = cellText(cell.value).trim();
    if (text !== "") first = text;
  });
  return first !== null && (first as string).startsWith("#");
}
