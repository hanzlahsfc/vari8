// @vitest-environment jsdom

/**
 * P-020A-I1-R2 repair — pins the classification-specific serialization:
 * the client props must carry a positional ordinal (classifyIndex) and one
 * fingerprint — never a map keyed by ParameterDefinition database ids — and
 * no raw parameter id may appear in the classification control's DOM ids,
 * attributes, values, or the submitted form.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../../app/workspace/[workspaceId]/parameters/actions", () => ({
  archiveParameter: vi.fn(async () => ({ ok: true })),
  classifyParameter: vi.fn(async (fd: FormData) => ({
    ok: true,
    value: fd,
  })),
  createParameter: vi.fn(async () => ({ ok: true })),
  updateParameter: vi.fn(async () => ({ ok: true })),
}));

import { ParameterManager } from "../../app/workspace/[workspaceId]/parameters/parameter-manager";
import { classifyParameter } from "../../app/workspace/[workspaceId]/parameters/actions";

afterEach(cleanup);

const RAW_ID = "param_secret_row_id";
const ROW = {
  id: RAW_ID,
  key: "weight",
  kind: "MEASUREMENT",
  label: "Body weight",
  status: "ACTIVE" as const,
  dataClassification: null,
  revision: 1,
  publishedReferenced: false,
  updatedAt: "2026-10-08T00:00:00.000Z",
  classifyIndex: 3,
};

describe("P-020A classification serialization — no raw ids", () => {
  it("renders the control bound by classifyIndex only; the raw row id appears nowhere in the classify DOM", () => {
    const { container } = render(
      <ParameterManager
        parameters={[ROW]}
        workspaceId="ws_test"
        classification={{ fingerprint: "fp_test" }}
      />,
    );
    const button = container.querySelector(
      '[data-testid="classify-parameter"]',
    );
    expect(button).not.toBeNull();
    // The select element id is positional, not id-keyed (scoped to the
    // classify cell — the create form has its own selects).
    const cell = button!.closest("td")!;
    const select = cell.querySelector("select");
    expect(select?.id).toBe("classification-select-3");
    expect(select?.id).not.toContain(RAW_ID);
    // Scan the classification control subtree for the raw id.
    expect(cell.innerHTML).not.toContain(RAW_ID);
    for (const el of cell.querySelectorAll("*")) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.value).not.toContain(RAW_ID);
      }
    }
  });

  it("submits only positional index + fingerprint + revision + classification", async () => {
    const { container } = render(
      <ParameterManager
        parameters={[ROW]}
        workspaceId="ws_test"
        classification={{ fingerprint: "fp_test" }}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="classify-parameter"]',
    )!;
    button.click();
    await vi.waitFor(() =>
      expect(vi.mocked(classifyParameter)).toHaveBeenCalledTimes(1),
    );
    const [, fd] = vi.mocked(classifyParameter).mock.calls[0] as unknown as [
      string,
      FormData,
    ];
    const keys = Array.from(fd.keys()).sort();
    expect(keys).toEqual(
      [
        "classification",
        "expectedRevision",
        "fingerprint",
        "parameterIndex",
      ].sort(),
    );
    expect(fd.get("parameterIndex")).toBe("3");
    expect(fd.get("fingerprint")).toBe("fp_test");
    for (const v of fd.values()) expect(String(v)).not.toContain(RAW_ID);
  });

  it("a row without classifyIndex shows the stale-selection state and submits nothing", async () => {
    const { container, getByRole } = render(
      <ParameterManager
        parameters={[{ ...ROW, classifyIndex: undefined }]}
        workspaceId="ws_test"
        classification={{ fingerprint: "fp_test" }}
      />,
    );
    container
      .querySelector<HTMLButtonElement>('[data-testid="classify-parameter"]')!
      .click();
    await vi.waitFor(() =>
      expect(getByRole("alert").textContent).toContain(
        "list changed while you were deciding",
      ),
    );
    expect(vi.mocked(classifyParameter)).not.toHaveBeenCalled();
  });
});
