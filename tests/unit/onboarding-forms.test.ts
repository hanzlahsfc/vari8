import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveScope } from "../../lib/auth/rbac";
import {
  FIELD_KINDS,
  FORM_LIMITS,
  type FieldKind,
  validateDefinition,
} from "../../lib/onboarding/forms";

/**
 * P-008 unit coverage: definition validation bounds, field-ID trust rules,
 * draft-vs-publish completeness, and the RBAC matrix row. Synthetic fixtures.
 *
 * Provenance (TDD recovery): adapted TESTS-ONLY from the frozen read-only
 * candidate branch feature/p008-onboarding-form-builder @ d10d788, per the
 * recovery contract. These tests encode the reviewed contract; the
 * production implementation is rebuilt fresh on this branch.
 */

const known = () => ({
  fieldIds: new Map<string, FieldKind>(),
  optionIds: new Map<string, string>(),
});

const textField = (over: Record<string, unknown> = {}) => ({
  kind: "shortText",
  label: "Name",
  required: false,
  order: 0,
  ...over,
});

describe("P-008 validation — definition bounds", () => {
  it("accepts a valid mixed draft (shape and order normalized)", () => {
    const def = validateDefinition(
      {
        title: "Intake",
        fields: [
          textField(),
          {
            kind: "singleChoice",
            label: "Sex",
            required: true,
            order: 1,
            options: [{ label: "A" }, { label: "B" }],
          },
        ],
      },
      known(),
      { forPublish: false },
    );
    expect(def.fields).toHaveLength(2);
    expect(def.fields[0].kind).toBe("shortText");
    expect(def.fields[1].kind).toBe("singleChoice");
    expect(def.fields[1].required).toBe(true);
    expect(def.fields[1].options).toHaveLength(2);
    expect(def.fields.map((f) => f.order)).toEqual([0, 1]);
  });

  it("mints opaque server IDs for new fields/options", () => {
    const def = validateDefinition(
      { title: "T", fields: [textField({ options: undefined })] },
      known(),
      { forPublish: false },
    );
    expect(def.fields[0].fieldId).toMatch(/^f_/);
    const choice = validateDefinition(
      {
        title: "T",
        fields: [
          {
            kind: "singleChoice",
            label: "C",
            required: false,
            order: 0,
            options: [{ label: "A" }],
          },
        ],
      },
      known(),
      { forPublish: false },
    );
    expect(choice.fields[0].options![0].optionId).toMatch(/^o_/);
  });

  it("allows zero fields for drafts but rejects empty publish", () => {
    expect(() =>
      validateDefinition({ title: "T", fields: [] }, known(), {
        forPublish: false,
      }),
    ).not.toThrow();
    expect(() =>
      validateDefinition({ title: "T", fields: [] }, known(), {
        forPublish: true,
      }),
    ).toThrowError(expect.objectContaining({ code: "publish_incomplete" }));
  });

  it("rejects over-limit fields, labels, help text, options, names", () => {
    const overFields = Array.from(
      { length: FORM_LIMITS.maxFields + 1 },
      (_, i) => textField({ order: i }),
    );
    expect(() =>
      validateDefinition({ title: "T", fields: overFields }, known(), {
        forPublish: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() =>
      validateDefinition(
        { title: "T", fields: [textField({ label: "x".repeat(201) })] },
        known(),
        { forPublish: false },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() =>
      validateDefinition(
        { title: "T", fields: [textField({ helpText: "x".repeat(501) })] },
        known(),
        { forPublish: false },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() =>
      validateDefinition(
        {
          title: "T",
          fields: [
            {
              kind: "singleChoice",
              label: "C",
              required: false,
              order: 0,
              options: [],
            },
          ],
        },
        known(),
        { forPublish: false },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it("rejects duplicate order, duplicate labels, options on non-choice, unknown kind", () => {
    expect(() =>
      validateDefinition(
        { title: "T", fields: [textField(), textField({ order: 0 })] },
        known(),
        { forPublish: false },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() =>
      validateDefinition(
        { title: "T", fields: [textField({ options: [{ label: "a" }] })] },
        known(),
        { forPublish: false },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    // Duplicate option labels within one choice field.
    expect(() =>
      validateDefinition(
        {
          title: "T",
          fields: [
            {
              kind: "singleChoice",
              label: "C",
              required: false,
              order: 0,
              options: [{ label: "Same" }, { label: "Same" }],
            },
          ],
        },
        known(),
        { forPublish: false },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_input" }));
    expect(() =>
      validateDefinition(
        { title: "T", fields: [textField({ kind: "html" })] },
        known(),
        { forPublish: false },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_input" }));
  });

  it("normalizes empty helpText to absent and preserves non-empty", () => {
    const def = validateDefinition(
      { title: "T", fields: [textField({ helpText: "   " })] },
      known(),
      { forPublish: false },
    );
    expect(def.fields[0].helpText).toBeUndefined();
    const def2 = validateDefinition(
      { title: "T", fields: [textField({ helpText: "be honest" })] },
      known(),
      { forPublish: false },
    );
    expect(def2.fields[0].helpText).toBe("be honest");
  });
});

describe("P-008 validation — field ID trust", () => {
  it("round-trips server-issued IDs and rejects forged/removed ones", () => {
    const first = validateDefinition(
      { title: "T", fields: [textField()] },
      known(),
      { forPublish: false },
    );
    const fieldId = first.fields[0].fieldId;
    const ids = {
      fieldIds: new Map([[fieldId, "shortText" as FieldKind]]),
      optionIds: new Map<string, string>(),
    };
    const second = validateDefinition(
      {
        title: "T",
        fields: [textField({ fieldId, label: "Renamed" })],
      },
      ids,
      { forPublish: false },
    );
    expect(second.fields[0].fieldId).toBe(fieldId);
    expect(second.fields[0].label).toBe("Renamed");

    // Forged ID → rejected. Kind change on known ID → rejected.
    expect(() =>
      validateDefinition(
        { title: "T", fields: [textField({ fieldId: "f_forged" })] },
        ids,
        { forPublish: false },
      ),
    ).toThrowError(expect.objectContaining({ code: "forbidden_field_id" }));
    expect(() =>
      validateDefinition(
        { title: "T", fields: [textField({ fieldId, kind: "number" })] },
        ids,
        { forPublish: false },
      ),
    ).toThrowError(expect.objectContaining({ code: "forbidden_field_id" }));
  });

  it("rejects client-supplied option IDs not bound to the field", () => {
    const ids = known();
    const def = validateDefinition(
      {
        title: "T",
        fields: [
          {
            kind: "singleChoice",
            label: "C",
            required: false,
            order: 0,
            options: [{ label: "A" }],
          },
        ],
      },
      ids,
      { forPublish: false },
    );
    const optionId = def.fields[0].options![0].optionId;
    const fieldId = def.fields[0].fieldId;
    const next = {
      fieldIds: new Map([[fieldId, "singleChoice" as FieldKind]]),
      optionIds: new Map([[optionId, fieldId]]),
    };
    expect(() =>
      validateDefinition(
        {
          title: "T",
          fields: [
            {
              fieldId,
              kind: "singleChoice",
              label: "C",
              required: false,
              order: 0,
              options: [{ optionId: "o_forged", label: "X" }],
            },
          ],
        },
        next,
        { forPublish: false },
      ),
    ).toThrowError(expect.objectContaining({ code: "forbidden_field_id" }));
    // Round-tripped option ID survives.
    expect(
      validateDefinition(
        {
          title: "T",
          fields: [
            {
              fieldId,
              kind: "singleChoice",
              label: "C",
              required: false,
              order: 0,
              options: [{ optionId, label: "A2" }],
            },
          ],
        },
        next,
        { forPublish: false },
      ).fields[0].options![0].optionId,
    ).toBe(optionId);
  });
});

describe("P-008 boundary — raw payload bound before parse", () => {
  it("rejects an oversized draftJson before JSON.parse reaches it", async () => {
    const { saveDraftFromAction } =
      await import("../../lib/onboarding/forms-boundary");
    const huge = JSON.stringify({
      title: "T",
      fields: [
        {
          kind: "shortText",
          label: "x".repeat(200_000),
          required: false,
          order: 0,
        },
      ],
    });
    const res = await saveDraftFromAction({ user: { id: "u" } } as never, {
      workspaceId: "ws",
      formId: "f",
      expectedRevision: 1,
      draftJson: huge,
    });
    expect(res).toEqual({
      ok: false,
      message: "Check the form details and try again.",
    });
  });
});

describe("P-008 RBAC — onboardingFormTemplates", () => {
  it("owner and coach have workspace read/write; others denied", () => {
    expect(
      resolveScope("onboardingFormTemplates", "read", "WORKSPACE_OWNER"),
    ).toBe("workspace");
    expect(
      resolveScope("onboardingFormTemplates", "write", "WORKSPACE_OWNER"),
    ).toBe("workspace");
    expect(resolveScope("onboardingFormTemplates", "read", "COACH")).toBe(
      "workspace",
    );
    expect(resolveScope("onboardingFormTemplates", "write", "COACH")).toBe(
      "workspace",
    );
    for (const role of [
      "ASSISTANT_COACH",
      "SUPPORT",
      "CLIENT",
      "PLATFORM_ADMIN",
    ] as const) {
      expect(resolveScope("onboardingFormTemplates", "read", role)).toBe(
        "denied",
      );
      expect(resolveScope("onboardingFormTemplates", "write", role)).toBe(
        "denied",
      );
    }
  });

  it("field kind union is closed", () => {
    expect(FIELD_KINDS).toHaveLength(6);
  });
});

describe("P-008 seam — app never imports the service", () => {
  it("no app/route file imports lib/onboarding/forms directly", () => {
    const root = join(__dirname, "..", "..", "app");
    const scan = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) return scan(p);
        return /\.(ts|tsx)$/.test(entry) ? [p] : [];
      });
    for (const file of scan(root)) {
      const src = readFileSync(file, "utf8");
      const imports = src
        .split("\n")
        .filter((line) => /^\s*import\s/.test(line))
        .join("\n");
      // Exact module path — `forms-boundary` must NOT trip this check.
      expect(imports).not.toMatch(/onboarding\/forms['"]/);
    }
  });
});
