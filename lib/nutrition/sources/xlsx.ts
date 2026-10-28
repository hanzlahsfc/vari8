/** Thin wrapper around `read-excel-file` for source adapters: rows as
 * (string|number|Date|boolean|null)[][] in sheet order. */

import readXlsxFile from "read-excel-file/node";

import { SourceAdapterError } from "./common";

export type XlsxCell = string | number | boolean | Date | null;

export async function readSheet(
  bytes: Buffer,
  sheet: string | number,
): Promise<XlsxCell[][]> {
  try {
    const out = await readXlsxFile(bytes, { sheet });
    return out as XlsxCell[][];
  } catch (err) {
    throw new SourceAdapterError(
      "unreadable_export",
      `xlsx unreadable: ${(err as Error).message}`,
    );
  }
}
