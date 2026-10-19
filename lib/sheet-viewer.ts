import { notFound } from "next/navigation";

/**
 * The raw/redacted workbook sheet viewer is a development/reference tool, not a
 * product page. It is enabled ONLY by an explicit development flag so it fails
 * closed (404) in normal product builds.
 */
import { devFlagEnabled, type RuntimeEnv } from "./runtime";

export function isSheetViewerEnabled(
  flag: string | undefined,
  env: RuntimeEnv = process.env,
): boolean {
  return devFlagEnabled(flag, env);
}

/** Fail closed: pages call this before rendering; throws `notFound()` when off. */
export function requireSheetViewer(
  flag: string | undefined,
  env: RuntimeEnv = process.env,
): void {
  if (!isSheetViewerEnabled(flag, env)) notFound();
}
