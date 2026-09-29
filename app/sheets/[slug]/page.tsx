import Link from "next/link";
import { notFound } from "next/navigation";

import { AppNav } from "@/components/app-nav";
import { toSparseGrid } from "@/lib/catalog";
import { EXPECTED_SHEETS } from "@/lib/extraction/contracts";
import { getSheetArtifact, getSheetSummary, isSheetSlug } from "@/lib/spec-artifacts";

export const dynamic = "force-dynamic";

function nameOf(file: string): string {
  return file.replace(/\.html?$/i, "");
}

export default async function SheetViewerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSheetSlug(slug)) notFound();

  const summary = getSheetSummary(slug);
  const artifact = getSheetArtifact(slug);
  const grid = toSparseGrid(artifact.cells);
  const index = EXPECTED_SHEETS.findIndex((sheet) => sheet.slug === slug);
  const previous = index > 0 ? EXPECTED_SHEETS[index - 1] : undefined;
  const next = index >= 0 && index < EXPECTED_SHEETS.length - 1 ? EXPECTED_SHEETS[index + 1] : undefined;
  const name = nameOf(summary.sourceFile);

  return (
    <main className="app-main">
      <AppNav />
      <h1 className="app-title">{name}</h1>
      <p className="app-lede">
        Read-only, redacted. {grid.cells.length} rendered cells out of {summary.cellCount} ({grid.redactedCount}{" "}
        redacted, {grid.emptyOmitted} empty not rendered), grid {grid.rows}×{grid.cols}.
      </p>
      <nav className="sheet-nav" aria-label="Sheet navigation">
        {previous ? <Link href={`/sheets/${previous.slug}`}>← {nameOf(previous.file)}</Link> : null}
        <Link href="/sheets">All sheets</Link>
        {next ? <Link href={`/sheets/${next.slug}`}>{nameOf(next.file)} →</Link> : null}
      </nav>

      <section className="sheet-sections" aria-label="Sheet sections">
        {summary.sections.map((section) => (
          <span key={`${section.label}-${section.row}-${section.col}`} className="sheet-chip">
            {section.label} <span className="sheet-chip__coord">r{section.row}c{section.col}</span>
          </span>
        ))}
      </section>

      <div className="sheet-scroll" role="region" aria-label={`${name} grid`} tabIndex={0}>
        <div
          className="sheet-grid"
          style={{ gridTemplateColumns: `repeat(${grid.cols}, var(--sheet-col-w))` }}
        >
          {grid.cells.map((cell) => (
            <div
              key={`${cell.row}:${cell.col}`}
              className={`sheet-cell sheet-cell--${cell.kind}`}
              style={{
                gridRow: `${cell.row} / span ${cell.rowSpan}`,
                gridColumn: `${cell.col} / span ${cell.colSpan}`,
              }}
              title={`r${cell.row}c${cell.col}`}
            >
              {cell.kind === "redacted" ? (
                <span aria-label="redacted value">▨</span>
              ) : cell.kind === "checkbox" ? (
                <>
                  <span aria-hidden="true">{cell.checkbox === "checked" ? "☑" : "☐"}</span>
                  {cell.text ? ` ${cell.text}` : ""}
                </>
              ) : (
                cell.text
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="app-lede">
        Safe labels and structural markers are shown; redacted cells show a neutral marker; empty
        cells are not rendered.
      </p>
    </main>
  );
}
