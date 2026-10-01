import { describe, expect, it } from "vitest";

import {
  buildExportDocument,
  EXPORT_PAGE_SIZE,
  EXPORT_SECTION_ROW_MAX,
  EXPORT_SECTIONS,
  GdprError,
} from "../../lib/gdpr/export";
import {
  assertGdprExternallyExposable,
  GdprNotExposableError,
} from "../../lib/gdpr";

/**
 * S1-G export document assembly: closed section allowlist, manifest counts
 * derived from emitted rows, and the fail-closed exposure gate.
 */
describe("S1-G export document", () => {
  const profile = { name: "Client A", createdAt: "2026-01-01T00:00:00.000Z" };
  const consent = {
    kind: "HEALTH_DATA",
    version: "v1",
    grantedAt: "2026-01-02T00:00:00.000Z",
    revokedAt: null,
    source: "CLIENT_SELF",
  };
  const assignment = {
    role: "PRIMARY",
    status: "ACTIVE",
    assignedAt: "2026-01-03T00:00:00.000Z",
  };

  it("exposes exactly the documented section allowlist", () => {
    expect([...EXPORT_SECTIONS].sort()).toEqual(
      ["assignments", "clientProfile", "consents"].sort(),
    );
  });

  it("pins the proposed engineering bounds", () => {
    expect(EXPORT_PAGE_SIZE).toBe(500);
    expect(EXPORT_SECTION_ROW_MAX).toBe(100_000);
  });

  it("derives manifest counts from emitted rows", () => {
    const doc = buildExportDocument({
      clientProfile: profile,
      consents: [
        consent,
        { ...consent, revokedAt: "2026-02-01T00:00:00.000Z" },
      ],
      assignments: [assignment],
    });
    expect(doc.formatVersion).toBe(1);
    expect(doc.manifest.sections).toEqual({
      clientProfile: 1,
      consents: 2,
      assignments: 1,
    });
    expect(doc.manifest.totalRecords).toBe(4);
    expect(doc.sections.clientProfile).toEqual(profile);
    expect(doc.sections.consents).toHaveLength(2);
    expect(doc.sections.assignments).toEqual([assignment]);
    expect(Object.keys(doc.sections).sort()).toEqual(
      ["assignments", "clientProfile", "consents"].sort(),
    );
  });

  it("rejects input carrying a non-allowlisted section", () => {
    expect(() =>
      buildExportDocument({
        clientProfile: profile,
        consents: [],
        assignments: [],
        auditEvents: [],
      } as never),
    ).toThrow(GdprError);
  });

  it("rejects a missing section and malformed shapes", () => {
    for (const bad of [
      { consents: [], assignments: [] }, // no clientProfile
      { clientProfile: null, consents: [], assignments: [] },
      { clientProfile: profile, consents: "x", assignments: [] },
      { clientProfile: profile, consents: [], assignments: {} },
      {
        clientProfile: { name: 1, createdAt: "x" },
        consents: [],
        assignments: [],
      },
      null,
      "x",
    ]) {
      expect(() => buildExportDocument(bad as never)).toThrow(GdprError);
    }
  });

  it("external exposure assertion fails closed", () => {
    expect(() => assertGdprExternallyExposable()).toThrow(
      GdprNotExposableError,
    );
    expect(() => assertGdprExternallyExposable()).toThrowError(
      "gdpr_not_exposable",
    );
  });
});
