import { describe, expect, it } from "vitest";

import { computeReviewFingerprint } from "../../lib/coaching/client-setup-transition";
import { serializeTransitionReview } from "../../lib/coaching/client-setup-transition-boundary";
import type { InternalTransitionReview } from "../../lib/coaching/client-setup-transition";

/**
 * P-020B — review fingerprint + sole browser-serialization boundary unit
 * tests (P-020-R3 §20, addendum 5/6).
 */

const material = {
  actorMemberId: "mem_actor",
  workspaceId: "ws_1",
  clientProfileId: "cp_1",
  pinId: "pin_1",
  currentVersionId: "ver_1",
  direction: "UPGRADE" as const,
  targetVersionId: "ver_2",
  selectionState: "latest",
  diffHash: "a".repeat(64),
  eligible: true,
  eligibilityReasonCodes: [] as string[],
  providerSetIdentity: "b".repeat(64),
  providerOutputsHash: "c".repeat(64),
  templateStatus: "ACTIVE",
  confirmRequired: true,
};

describe("P-020B reviewFingerprint", () => {
  it("is deterministic for identical material", () => {
    expect(computeReviewFingerprint(material)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeReviewFingerprint(material)).toBe(
      computeReviewFingerprint({ ...material }),
    );
  });

  it.each([
    ["actorMemberId", "mem_other"],
    ["workspaceId", "ws_2"],
    ["clientProfileId", "cp_2"],
    ["pinId", "pin_2"],
    ["currentVersionId", "ver_x"],
    ["targetVersionId", "ver_3"],
    ["selectionState", "rb:0"],
    ["diffHash", "d".repeat(64)],
    ["templateStatus", "ARCHIVED"],
  ] as const)("changes when %s changes", (key, value) => {
    const fp1 = computeReviewFingerprint(material);
    const fp2 = computeReviewFingerprint({ ...material, [key]: value });
    expect(fp2).not.toBe(fp1);
  });

  it("changes when direction changes (upgrade ≠ rollback)", () => {
    const fp1 = computeReviewFingerprint(material);
    const fp2 = computeReviewFingerprint({
      ...material,
      direction: "ROLLBACK",
    });
    expect(fp2).not.toBe(fp1);
  });
});

describe("P-020B serializeTransitionReview — sole browser boundary", () => {
  const internal: InternalTransitionReview = {
    workspaceId: "ws_secret",
    clientProfileId: "cp_secret",
    clientSetupId: "cs_secret",
    pinId: "pin_secret",
    templateId: "tpl_secret",
    templateName: "Wellness",
    templateStatus: "ACTIVE",
    actorMemberId: "mem_secret",
    direction: "UPGRADE",
    currentVersionId: "ver_secret_1",
    currentVersionSeq: 1,
    targetVersionId: "ver_secret_2",
    targetVersionSeq: 2,
    targetPublishedAt: new Date("2026-10-08T00:00:00Z"),
    rollbackCandidateIds: ["ver_secret_0"],
    diff: {
      entries: [
        {
          category: "removed",
          parameterId: "pd_secret",
          parameterKey: "p_x",
          parameterLabel: "Weight",
          detail: "item_removed",
          warn: true,
          itemId: "itm_1",
          sectionId: "sec_a",
        },
      ],
      categories: {
        added: 0,
        removed: 1,
        rebound: 0,
        moved: 0,
        required: 0,
        display: 0,
      },
      warningCount: 1,
      defective: false,
      diffHash: "f".repeat(64),
    },
    eligible: true,
    eligibilityReasonCodes: [],
    providerImpacts: [
      {
        consumerKey: "history",
        contractVersion: 1,
        affectedParameters: [
          {
            parameterId: "pd_secret",
            parameterKey: "p_x",
            impactRole: "REMOVED",
            count: "9007199254740993",
            earliestDate: "2020-01-01",
            latestDate: "2025-01-01",
            reasonCode: "REMOVED_WITH_HISTORY",
          },
        ],
        blockedReasonCodes: [],
      },
    ],
    blockedReasonCodes: [],
    providersDeclared: 1,
    summary: {
      schemaVersion: 1,
      direction: "UPGRADE",
      categories: {
        added: 0,
        removed: 1,
        rebound: 0,
        moved: 0,
        required: 0,
        display: 0,
      },
      reasonCodes: ["REMOVED"],
    },
    reviewFingerprint: "e".repeat(64),
  };

  it("strips every raw database id from the serialized payload", () => {
    const payload = serializeTransitionReview(internal);
    const json = JSON.stringify(payload);
    for (const secret of [
      "ws_secret",
      "cp_secret",
      "cs_secret",
      "pin_secret",
      "tpl_secret",
      "mem_secret",
      "ver_secret_1",
      "ver_secret_2",
      "ver_secret_0",
      "pd_secret",
      "itm_1",
      "sec_a",
    ]) {
      expect(json).not.toContain(secret);
    }
    // Safe content survives: labels, parameterKey, counts, dates, fingerprint.
    expect(payload.templateName).toBe("Wellness");
    expect(payload.entries[0].parameterKey).toBe("p_x");
    expect(payload.reviewFingerprint).toBe("e".repeat(64));
    expect(payload.requiresConfirmation).toBe(true);
    const serialized = payload.providerImpacts[0]
      .affectedParameters[0] as Record<string, unknown>;
    expect(serialized.parameterId).toBeUndefined();
  });
});
