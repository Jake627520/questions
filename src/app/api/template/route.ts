import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { generateDemoExcel } from "@/../scripts/generate-demo-excel";

export async function GET() {
  const filePath = path.join(process.cwd(), "demo-survey.xlsx");
  if (!fs.existsSync(filePath)) {
    await generateDemoExcel(filePath);
  }
  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="demo-survey.xlsx"',
    },
  });
}
