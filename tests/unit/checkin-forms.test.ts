// P-025-A — Check-In form definitions: shared feature resolver, RBAC matrix,
// dual-role deny-set, and the draft/definition validator contract.
// Check-In is a distinct domain: these tests pin CHECK_IN_* types and the
// checkinFormDefinitions resource — never the onboarding-named ones.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AccessDeniedError,
  authorize,
  type AuthorizationRepo,
} from "../../lib/auth/guard";
import { RESOURCES, resolveScope } from "../../lib/auth/rbac";
import {
  CHECKIN_FIELD_KINDS,
  CHECKIN_FORM_LIMITS,
  CheckInFormError,
  validateCheckInDefinition,
  type CheckInDefinition,
  type CheckInFieldKind,
} from "../../lib/checkin/forms";
import { isCheckInsEnabled } from "../../lib/checkin/forms-gate";

describe("P-025-A shared server-only check-in feature resolver", () => {
  it("enables only when the flag is exactly '1' AND runtime is development/test", () => {
    expect(isCheckInsEnabled({ ENABLE_CHECK_INS: "1", APP_ENV: "test" })).toBe(
      true,
    );
    expect(
      isCheckInsEnabled({ ENABLE_CHECK_INS: "1", APP_ENV: "development" }),
    ).toBe(true);
    expect(isCheckInsEnabled({ ENABLE_CHECK_INS: "1", NODE_ENV: "test" })).toBe(
      true,
    );
    expect(
      isCheckInsEnabled({ ENABLE_CHECK_INS: "1", NODE_ENV: "development" }),
    ).toBe(true);
  });

  it("fails closed when the flag is unset, off, or malformed", () => {
    expect(isCheckInsEnabled({ APP_ENV: "test" })).toBe(false);
    expect(isCheckInsEnabled({ ENABLE_CHECK_INS: "0", APP_ENV: "test" })).toBe(
      false,
    );
    expect(
      isCheckInsEnabled({ ENABLE_CHECK_INS: "true", APP_ENV: "test" }),
    ).toBe(false);
    expect(isCheckInsEnabled({ ENABLE_CHECK_INS: " 1", APP_ENV: "test" })).toBe(
      false,
    );
    expect(isCheckInsEnabled({ ENABLE_CHECK_INS: "1 ", APP_ENV: "test" })).toBe(
      false,
    );
  });

  it("fails closed in production, unknown, or missing classification even with the flag on", () => {
    expect(
      isCheckInsEnabled({ ENABLE_CHECK_INS: "1", APP_ENV: "production" }),
    ).toBe(false);
    expect(
      isCheckInsEnabled({ ENABLE_CHECK_INS: "1", APP_ENV: "staging" }),
    ).toBe(false);
    expect(
      isCheckInsEnabled({ ENABLE_CHECK_INS: "1", NODE_ENV: "production" }),
    ).toBe(false);
    // No classification signal at all resolves production-safe.
    expect(isCheckInsEnabled({ ENABLE_CHECK_INS: "1" })).toBe(false);
  });

  it("explicit APP_ENV wins over baked NODE_ENV both ways", () => {
    expect(
      isCheckInsEnabled({
        ENABLE_CHECK_INS: "1",
        APP_ENV: "production",
        NODE_ENV: "test",
      }),
    ).toBe(false);
    expect(
      isCheckInsEnabled({
        ENABLE_CHECK_INS: "1",
        APP_ENV: "test",
        NODE_ENV: "production",
      }),
    ).toBe(true);
  });
});

describe("P-025-A RBAC — checkinFormDefinitions", () => {
  it("resource is declared in the closed union", () => {
    expect(RESOURCES).toContain("checkinFormDefinitions");
  });

  it("owner and coach have workspace read/write; all others denied", () => {
    for (const role of ["WORKSPACE_OWNER", "COACH"] as const) {
      expect(resolveScope("checkinFormDefinitions", "read", role)).toBe(
        "workspace",
      );
      expect(resolveScope("checkinFormDefinitions", "write", role)).toBe(
        "workspace",
      );
    }
    for (const role of [
      "ASSISTANT_COACH",
      "SUPPORT",
      "CLIENT",
      "PLATFORM_ADMIN",
    ] as const) {
      expect(resolveScope("checkinFormDefinitions", "read", role)).toBe(
        "denied",
      );
      expect(resolveScope("checkinFormDefinitions", "write", role)).toBe(
        "denied",
      );
    }
  });

  it("check-in field-kind union is closed and domain-distinct", () => {
    expect(CHECKIN_FIELD_KINDS).toHaveLength(6);
    const kinds: readonly CheckInFieldKind[] = CHECKIN_FIELD_KINDS;
    expect(kinds).not.toContain("calories");
  });
});

// ── Dual-role deny-set hardening (binding security requirement, not an
// owner choice): checkinFormDefinitions AND the pre-stubbed
// checkinsCoachReviews must deny PLATFORM_ADMIN even when the account holds
// an ACTIVE workspace membership whose role would otherwise be granted.
// Mirrors the guard.test.ts makeRepo pattern.
describe("P-025-A dual-role PLATFORM_ADMIN denial", () => {
  type State = {
    user: {
      id: string;
      platformRole: "USER" | "PLATFORM_ADMIN";
      status: "ACTIVE";
    } | null;
    workspace: { id: string; status: "ACTIVE" } | null;
    membership: {
      id: string;
      role:
        "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";
      status: "ACTIVE";
    } | null;
    client: null;
    assignment: null;
  };

  function makeRepo(overrides: Partial<State> = {}) {
    const state: State = {
      user: { id: "u1", platformRole: "USER", status: "ACTIVE" },
      workspace: { id: "w1", status: "ACTIVE" },
      membership: { id: "m1", role: "WORKSPACE_OWNER", status: "ACTIVE" },
      client: null,
      assignment: null,
      ...overrides,
    };
    const repo: AuthorizationRepo = {
      getUser: async () => state.user,
      getWorkspace: async () => state.workspace,
      getMembership: async () => state.membership,
      getClientProfileInWorkspace: async () => state.client,
      getActiveAssignment: async () => state.assignment,
    };
    return { repo };
  }

  const session = (id = "u1") => ({ user: { id } }) as never;
  async function reason(fn: () => Promise<unknown>) {
    try {
      await fn();
      return undefined;
    } catch (error) {
      return error instanceof AccessDeniedError
        ? error.reason
        : `other:${error}`;
    }
  }

  const admin = {
    id: "u1",
    platformRole: "PLATFORM_ADMIN",
    status: "ACTIVE",
  } as const;

  for (const resource of [
    "checkinFormDefinitions",
    "checkinsCoachReviews",
  ] as const) {
    for (const role of ["WORKSPACE_OWNER", "COACH"] as const) {
      it(`dual-role PLATFORM_ADMIN + ACTIVE ${role} is role_denied read AND write on ${resource}`, async () => {
        const { repo } = makeRepo({
          user: admin,
          membership: { id: "m1", role, status: "ACTIVE" },
        });
        for (const action of ["read", "write"] as const) {
          expect(
            await reason(() =>
              authorize(
                session(),
                { resource, action, workspaceId: "w1" },
                repo,
              ),
            ),
          ).toBe("role_denied");
        }
      });
    }
  }

  it("a plain (non-admin) owner still passes checkinFormDefinitions write", async () => {
    const { repo } = makeRepo();
    expect(
      await reason(() =>
        authorize(
          session(),
          {
            resource: "checkinFormDefinitions",
            action: "write",
            workspaceId: "w1",
          },
          repo,
        ),
      ),
    ).toBeUndefined();
  });
});

// ── Validator contract (structural, bounds, ID trust, tombstones) ───────────

const SHORT: CheckInFieldKind = "shortText";
const CHOICE: CheckInFieldKind = "singleChoice";

function validDefinition(): unknown {
  return {
    title: "Weekly Check-In",
    fields: [
      {
        kind: "shortText",
        label: "How was your week?",
        required: true,
        order: 0,
      },
      {
        kind: "singleChoice",
        label: "Energy level",
        required: false,
        order: 1,
        options: [{ label: "Low" }, { label: "High" }],
      },
    ],
  };
}

const noIds = {
  fieldIds: new Map<string, CheckInFieldKind>(),
  optionIds: new Map<string, string>(),
};

describe("P-025-A validateCheckInDefinition", () => {
  it("normalizes a valid draft, mints stable ids, contiguous orders", () => {
    const def = validateCheckInDefinition(validDefinition(), noIds, {
      forPublish: true,
    });
    expect(def.title).toBe("Weekly Check-In");
    expect(def.fields).toHaveLength(2);
    expect(def.fields[0].fieldId).toMatch(/^f_/);
    expect(def.fields[1].options?.[0].optionId).toMatch(/^o_/);
    expect(def.fields.map((f) => f.order)).toEqual([0, 1]);
    expect(def.fields[0].kind).toBe(SHORT);
  });

  it("rejects non-object, missing title, and non-array fields", () => {
    for (const bad of [null, [], "x", { title: "T" }, { fields: [] }]) {
      expect(() =>
        validateCheckInDefinition(bad, noIds, { forPublish: false }),
      ).toThrow(CheckInFormError);
    }
  });

  it("publish requires at least one field; draft save tolerates zero", () => {
    const empty = { title: "T", fields: [] };
    expect(() =>
      validateCheckInDefinition(empty, noIds, { forPublish: true }),
    ).toThrow(expect.objectContaining({ code: "publish_incomplete" }) as never);
    const saved = validateCheckInDefinition(empty, noIds, {
      forPublish: false,
    });
    expect(saved.fields).toHaveLength(0);
  });

  it("enforces field/option/name bounds and the payload byte limit", () => {
    expect(() =>
      validateCheckInDefinition(
        { title: "x".repeat(CHECKIN_FORM_LIMITS.labelMax + 1), fields: [] },
        noIds,
        { forPublish: false },
      ),
    ).toThrow(CheckInFormError);

    const tooManyFields = {
      title: "T",
      fields: Array.from(
        { length: CHECKIN_FORM_LIMITS.maxFields + 1 },
        (_, i) => ({
          kind: "shortText",
          label: `F${i}`,
          required: false,
          order: i,
        }),
      ),
    };
    expect(() =>
      validateCheckInDefinition(tooManyFields, noIds, { forPublish: false }),
    ).toThrow(CheckInFormError);

    const hugeLabel = {
      title: "T",
      fields: [
        {
          kind: "shortText",
          label: "x".repeat(CHECKIN_FORM_LIMITS.definitionMaxBytes),
          required: false,
          order: 0,
        },
      ],
    };
    expect(() =>
      validateCheckInDefinition(hugeLabel, noIds, { forPublish: false }),
    ).toThrow(CheckInFormError);
  });

  it("choice fields require bounded options; non-choice must not carry options", () => {
    const noOptions = {
      title: "T",
      fields: [{ kind: "singleChoice", label: "Q", required: false, order: 0 }],
    };
    expect(() =>
      validateCheckInDefinition(noOptions, noIds, { forPublish: false }),
    ).toThrow(CheckInFormError);

    const strayOptions = {
      title: "T",
      fields: [
        {
          kind: "shortText",
          label: "Q",
          required: false,
          order: 0,
          options: [{ label: "A" }],
        },
      ],
    };
    expect(() =>
      validateCheckInDefinition(strayOptions, noIds, { forPublish: false }),
    ).toThrow(CheckInFormError);

    const tooMany = {
      title: "T",
      fields: [
        {
          kind: "multiChoice",
          label: "Q",
          required: false,
          order: 0,
          options: Array.from(
            { length: CHECKIN_FORM_LIMITS.maxOptions + 1 },
            (_, i) => ({ label: `o${i}` }),
          ),
        },
      ],
    };
    expect(() =>
      validateCheckInDefinition(tooMany, noIds, { forPublish: false }),
    ).toThrow(CheckInFormError);
  });

  it("rejects duplicate field labels are allowed but duplicate option labels per field are not", () => {
    const dupOptionLabels = {
      title: "T",
      fields: [
        {
          kind: "singleChoice",
          label: "Q",
          required: false,
          order: 0,
          options: [{ label: "Same" }, { label: "Same" }],
        },
      ],
    };
    expect(() =>
      validateCheckInDefinition(dupOptionLabels, noIds, {
        forPublish: false,
      }),
    ).toThrow(CheckInFormError);
  });

  it("rejects unknown kinds, non-integer/duplicate orders, malformed ids", () => {
    const badKind = {
      title: "T",
      fields: [{ kind: "nonsense", label: "Q", required: false, order: 0 }],
    };
    expect(() =>
      validateCheckInDefinition(badKind, noIds, { forPublish: false }),
    ).toThrow(CheckInFormError);

    const dupOrder = {
      title: "T",
      fields: [
        { kind: "shortText", label: "A", required: false, order: 0 },
        { kind: "shortText", label: "B", required: false, order: 0 },
      ],
    };
    expect(() =>
      validateCheckInDefinition(dupOrder, noIds, { forPublish: false }),
    ).toThrow(CheckInFormError);

    const badId = {
      title: "T",
      fields: [
        {
          kind: "shortText",
          label: "Q",
          required: false,
          order: 0,
          fieldId: "!!bad id!!",
        },
      ],
    };
    expect(() =>
      validateCheckInDefinition(badId, noIds, { forPublish: false }),
    ).toThrow(CheckInFormError);
  });

  it("trusts only current-draft ids; presented foreign/retired ids are forbidden", () => {
    const known = {
      fieldIds: new Map<string, CheckInFieldKind>([["f_existing", SHORT]]),
      optionIds: new Map<string, string>(),
    };
    const kept = {
      title: "T",
      fields: [
        {
          kind: "shortText",
          label: "Q",
          required: false,
          order: 0,
          fieldId: "f_existing",
        },
      ],
    };
    const ok = validateCheckInDefinition(kept, known, { forPublish: true });
    expect(ok.fields[0].fieldId).toBe("f_existing");

    // A retired/historical id NOT in the current draft's known set is
    // rejected — tombstones prevent resurrection.
    const retired = {
      title: "T",
      fields: [
        {
          kind: "shortText",
          label: "Q",
          required: false,
          order: 0,
          fieldId: "f_retired_id",
        },
      ],
    };
    expect(() =>
      validateCheckInDefinition(retired, noIds, { forPublish: false }),
    ).toThrow(expect.objectContaining({ code: "forbidden_field_id" }) as never);

    // A known id carrying a different kind is a forged kind change.
    const forged = {
      title: "T",
      fields: [
        {
          kind: "number",
          label: "Q",
          required: false,
          order: 0,
          fieldId: "f_existing",
        },
      ],
    };
    expect(() =>
      validateCheckInDefinition(forged, known, { forPublish: false }),
    ).toThrow(expect.objectContaining({ code: "forbidden_field_id" }) as never);
  });

  it("option ids must be bound to THIS field in the current draft", () => {
    const known = {
      fieldIds: new Map<string, CheckInFieldKind>([
        ["f_a", CHOICE],
        ["f_b", CHOICE],
      ]),
      optionIds: new Map<string, string>([["o_1", "f_b"]]),
    };
    const crossField = {
      title: "T",
      fields: [
        {
          kind: "singleChoice",
          label: "Q",
          required: false,
          order: 0,
          fieldId: "f_a",
          options: [{ label: "X", optionId: "o_1" }],
        },
      ],
    };
    expect(() =>
      validateCheckInDefinition(crossField, known, { forPublish: false }),
    ).toThrow(expect.objectContaining({ code: "forbidden_field_id" }) as never);

    const bound = {
      title: "T",
      fields: [
        {
          kind: "singleChoice",
          label: "Q",
          required: false,
          order: 0,
          fieldId: "f_b",
          options: [{ label: "X", optionId: "o_1" }],
        },
      ],
    };
    const ok = validateCheckInDefinition(bound, known, { forPublish: true });
    expect(ok.fields[0].options?.[0].optionId).toBe("o_1");
  });

  it("rejects sparse/unexpected properties", () => {
    const extra = {
      title: "T",
      fields: [
        {
          kind: "shortText",
          label: "Q",
          required: false,
          order: 0,
          unexpected: "prop",
        },
      ],
    };
    expect(() =>
      validateCheckInDefinition(extra, noIds, { forPublish: false }),
    ).toThrow(CheckInFormError);
  });

  it("preserves optional bounded classification metadata on fields", () => {
    const withClassification = {
      title: "T",
      fields: [
        {
          kind: "shortText",
          label: "Q",
          required: false,
          order: 0,
          classification: "dev-synthetic",
        },
      ],
    };
    const def = validateCheckInDefinition(withClassification, noIds, {
      forPublish: true,
    });
    expect(def.fields[0].classification).toBe("dev-synthetic");

    const badClassification = {
      title: "T",
      fields: [
        {
          kind: "shortText",
          label: "Q",
          required: false,
          order: 0,
          classification: 42,
        },
      ],
    };
    expect(() =>
      validateCheckInDefinition(badClassification, noIds, {
        forPublish: false,
      }),
    ).toThrow(CheckInFormError);
  });

  it("snapshot output carries no answer values — definition only", () => {
    const def: CheckInDefinition = validateCheckInDefinition(
      validDefinition(),
      noIds,
      { forPublish: true },
    );
    expect(JSON.stringify(def)).not.toMatch(/answer|submission/i);
  });
});

describe("P-025-A seam — app never imports the service directly", () => {
  it("no app/route file imports lib/checkin/forms directly", () => {
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
      expect(imports).not.toMatch(/checkin\/forms['"]/);
    }
  });
});
