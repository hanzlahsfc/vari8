import { notFound } from "next/navigation";

/**
 * The raw/redacted workbook sheet viewer is a development/reference tool, not a
 * product page. It is enabled ONLY by an explicit development flag so it fails
 * closed (404) in normal product builds.
 */
export function isSheetViewerEnabled(env: string | undefined): boolean {
  return env === "1";
}

/** Fail closed: pages call this before rendering; throws `notFound()` when off. */
export function requireSheetViewer(env: string | undefined): void {
  if (!isSheetViewerEnabled(env)) notFound();
}
