import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import { requireSheetViewer } from "@/lib/sheet-viewer";
import { getSheetSummary, listSheets } from "@/lib/spec-artifacts";

// Development/reference tool only: fail closed (404) unless explicitly enabled.
export const dynamic = "force-dynamic";

export const metadata = { title: "Workbook sheets (dev) — App" };

export default function SheetsIndexPage() {
  requireSheetViewer(process.env.ENABLE_SHEET_VIEWER);
  const sheets = listSheets();
  return (
    <main className="app-main">
      <AppNav />
      <h1 className="app-title">Workbook sheets</h1>
      <p className="app-lede">
        Read-only view of the 11 PRGRSS 2.0 sheets. Structure is reproduced from
        the redacted extraction artifacts; client values are redacted.
      </p>
      <ul className="sheet-list">
        {sheets.map((sheet) => {
          const summary = getSheetSummary(sheet.slug);
          const blocks = summary.repeatedBlocks
            .map((block) => `${block.kind} ×${block.count}`)
            .join(", ");
          return (
            <li key={sheet.slug}>
              <Link href={`/sheets/${sheet.slug}`}>{sheet.name}</Link>
              <span className="sheet-list__meta">
                {summary.cellCount} cells · {summary.rowCount}×
                {summary.colCount} · {blocks || "no repeated blocks"}
              </span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
