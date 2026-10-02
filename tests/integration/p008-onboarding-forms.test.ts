import { execFileSync } from "node:child_process";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import * as accessModule from "../../lib/workspace/access";
import * as auditModule from "../../lib/audit";
import { prisma as globalPrisma } from "../../lib/db";
import {
  archiveOnboardingForm,
  createOnboardingForm,
  getOnboardingForm,
  listOnboardingForms,
  openOnboardingDraft,
  publishOnboardingForm,
  saveOnboardingFormDraft,
} from "../../lib/onboarding/forms";

/**
 * P-008 onboarding form builder against real PostgreSQL — production
 * service + real Prisma guard. Synthetic fixtures only; no submissions
 * exist anywhere in this slice.
 *
 * Provenance (TDD recovery): adapted TESTS-ONLY from the frozen read-only
 * candidate branch feature/p008-onboarding-form-builder @ d10d788, per the
 * recovery contract. These tests encode the reviewed contract; the
 * production implementation is rebuilt fresh on this branch.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("P-008 onboarding forms (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "onboarding_form_version","onboarding_form","audit_event","coach_profile","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `p8${++n}_${Date.now()}`;
  async function user(role: "USER" | "PLATFORM_ADMIN" = "USER") {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Fixture ${uid()}`,
        platformRole: role,
        status: "ACTIVE",
      },
    });
  }
  async function workspace() {
    return prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `p8-${uid()}`, status: "ACTIVE" },
    });
  }
  async function member(
    workspaceId: string,
    userId: string,
    role:
      "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status: "ACTIVE" },
    });
  }
  const session = (userId: string) => ({ user: { id: userId } });

  const draftWith = (fields: unknown[]) => ({ title: "Intake", fields });
  const field = (i: number, over: Record<string, unknown> = {}) => ({
    kind: "shortText",
    label: `Field ${i}`,
    required: false,
    order: i,
    ...over,
  });

  it("owner creates a form with an empty draft and a CREATE audit event", async () => {
    const ws = await workspace();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "My Intake" },
      prisma,
    );
    const form = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: formId },
    });
    expect(form.workspaceId).toBe(ws.id);
    expect(form.draft).toMatchObject({ title: "My Intake", fields: [] });
    expect(form.draftRevision).toBe(1);
    expect(form.createdByMemberId).toBe(m.id);
    const audit = await prisma.auditEvent.findFirst({
      where: {
        resourceType: "onboarding_form",
        resourceId: formId,
        action: "CREATE",
      },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorUserId).toBe(owner.id);
    expect(audit!.meta).not.toMatchObject({ fields: expect.anything() });
  });

  it("denied actors fail closed on every operation", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const client = await user();
    await member(ws.id, client.id, "CLIENT");
    const support = await user();
    await member(ws.id, support.id, "SUPPORT");
    const assistant = await user();
    await member(ws.id, assistant.id, "ASSISTANT_COACH");
    const outsider = await user();
    const platform = await user("PLATFORM_ADMIN");

    for (const u of [client, support, assistant, outsider, platform]) {
      await expect(
        listOnboardingForms(session(u.id), { workspaceId: ws.id }, prisma),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(
        createOnboardingForm(
          session(u.id),
          { workspaceId: ws.id, name: "Nope" },
          prisma,
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "F" },
      prisma,
    );
    for (const u of [client, support, assistant, outsider, platform]) {
      await expect(
        getOnboardingForm(
          session(u.id),
          { workspaceId: ws.id, formId },
          prisma,
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(
        archiveOnboardingForm(
          session(u.id),
          { workspaceId: ws.id, formId },
          prisma,
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(
        saveOnboardingFormDraft(
          session(u.id),
          {
            workspaceId: ws.id,
            formId,
            expectedRevision: 1,
            draft: draftWith([]),
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(
        publishOnboardingForm(
          session(u.id),
          { workspaceId: ws.id, formId, expectedRevision: 1 },
          prisma,
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(
        openOnboardingDraft(
          session(u.id),
          { workspaceId: ws.id, formId },
          prisma,
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }
  });

  /** Fixture-seeded form row — independent of the service under test. */
  async function seedForm(workspaceId: string, memberId: string, name: string) {
    return prisma.onboardingForm.create({
      data: {
        workspaceId,
        name,
        createdByMemberId: memberId,
        draft: { title: name, fields: [] },
        draftRevision: 1,
      },
      select: { id: true },
    });
  }

  it("authorization reads go through the INJECTED client, not the global repo", async () => {
    // Seam regression (slice-2 review): authorize() must bind its repo to the
    // same connection as the domain queries — otherwise a caller-supplied
    // client (e.g. a transaction) would auth against a different database.
    const spy = vi.spyOn(accessModule, "createPrismaAuthorizationRepo");
    try {
      const ws = await workspace();
      const owner = await user();
      const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
      const seeded = await seedForm(ws.id, m.id, "Seeded");
      await listOnboardingForms(
        session(owner.id),
        { workspaceId: ws.id },
        prisma,
      );
      await getOnboardingForm(
        session(owner.id),
        { workspaceId: ws.id, formId: seeded.id },
        prisma,
      );
      await expect(
        createOnboardingForm(
          session(owner.id),
          { workspaceId: ws.id, name: "Seam" },
          prisma,
        ),
      ).resolves.toBeDefined();
      const calls = spy.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(3);
      for (const args of calls) expect(args[0]).toBe(prisma);
    } finally {
      spy.mockRestore();
    }
  });

  it("create records draft editor identity and timestamp", async () => {
    const ws = await workspace();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "Meta" },
      prisma,
    );
    const form = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: formId },
    });
    // Every definition mutation records editor identity + time (contract).
    expect(form.draftSavedByMemberId).toBe(m.id);
    expect(form.draftUpdatedAt).not.toBeNull();
  });

  it("audit-write failure rolls back the created form (INJECTED fault)", async () => {
    // Deterministic fault injection: the REAL writeAuditEvent module is spied
    // to throw a sentinel AFTER the form insert inside the real Prisma
    // $transaction. Proves the transaction boundary (audit failure ⇒ zero
    // surviving form rows) without any DB creation/DDL. Labeled INJECTED —
    // the real audit write is covered separately by the CREATE-audit test.
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const sentinel = new Error("INJECTED audit failure");
    const spy = vi
      .spyOn(auditModule, "writeAuditEvent")
      .mockRejectedValue(sentinel);
    try {
      await expect(
        createOnboardingForm(
          session(owner.id),
          { workspaceId: ws.id, name: "Rollback" },
          prisma,
        ),
      ).rejects.toBe(sentinel);
      // The audit write must have been attempted on the TRANSACTION client —
      // neither the injected client nor the module-global one.
      expect(spy).toHaveBeenCalledOnce();
      const txArg = spy.mock.calls[0][0] as unknown;
      expect(txArg).not.toBe(prisma);
      expect(txArg).not.toBe(globalPrisma);
      expect(txArg).toBeTypeOf("object");
      // Rollback: the form insert inside the same transaction does not survive.
      expect(
        await prisma.onboardingForm.count({ where: { workspaceId: ws.id } }),
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("list returns workspace-scoped summaries only; no cross-workspace leakage", async () => {
    const wsA = await workspace();
    const wsB = await workspace();
    const owner = await user();
    const mA = await member(wsA.id, owner.id, "WORKSPACE_OWNER");
    await member(wsB.id, owner.id, "WORKSPACE_OWNER");
    const mB = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: wsB.id, userId: owner.id },
    });
    // Fixture-seeded — reads must be testable without the create service.
    const { id: formId } = await seedForm(wsA.id, mA.id, "A only");
    await seedForm(wsB.id, mB.id, "B only");
    const listA = await listOnboardingForms(
      session(owner.id),
      { workspaceId: wsA.id },
      prisma,
    );
    expect(listA.map((f) => f.name)).toEqual(["A only"]);
    expect(listA[0].id).toBe(formId);
    expect(listA[0].status).toBe("ACTIVE");
    expect(listA[0].hasDraft).toBe(true);
    expect(listA[0].latestVersionSeq).toBeNull();
    // Rows carry no draft/definition payload on the list path.
    expect(JSON.stringify(listA)).not.toContain('"fields"');
  });

  it("denies unauthenticated, inactive user, and inactive workspace", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    // No session at all.
    await expect(
      listOnboardingForms(null, { workspaceId: ws.id }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      listOnboardingForms({ user: {} }, { workspaceId: ws.id }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // Deactivated user with otherwise-valid membership.
    const deactivated = await user();
    await member(ws.id, deactivated.id, "COACH");
    await prisma.user.update({
      where: { id: deactivated.id },
      data: { status: "DEACTIVATED" },
    });
    await expect(
      listOnboardingForms(
        session(deactivated.id),
        { workspaceId: ws.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // Suspended workspace denies even the owner.
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { status: "SUSPENDED" },
    });
    await expect(
      getOnboardingForm(
        session(owner.id),
        { workspaceId: ws.id, formId: "f_x" },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("immediate role change mid-flow revokes write AND read", async () => {
    const ws = await workspace();
    const coach = await user();
    const m = await member(ws.id, coach.id, "COACH");
    const { formId } = await createOnboardingForm(
      session(coach.id),
      { workspaceId: ws.id, name: "RoleChange" },
      prisma,
    );
    // Coach demoted to ASSISTANT_COACH — every op fails on the NEXT call,
    // no cached grants.
    await prisma.workspaceMember.update({
      where: { id: m.id },
      data: { role: "ASSISTANT_COACH" },
    });
    for (const op of [
      () =>
        listOnboardingForms(session(coach.id), { workspaceId: ws.id }, prisma),
      () =>
        getOnboardingForm(
          session(coach.id),
          { workspaceId: ws.id, formId },
          prisma,
        ),
      () =>
        createOnboardingForm(
          session(coach.id),
          { workspaceId: ws.id, name: "X" },
          prisma,
        ),
    ]) {
      await expect(op()).rejects.toBeInstanceOf(AccessDeniedError);
    }
  });

  it("revoked access denies reads AND writes immediately", async () => {
    const ws = await workspace();
    const coach = await user();
    const m = await member(ws.id, coach.id, "COACH");
    const { formId } = await createOnboardingForm(
      session(coach.id),
      { workspaceId: ws.id, name: "Revoke" },
      prisma,
    );
    await prisma.workspaceMember.update({
      where: { id: m.id },
      data: { status: "REMOVED" },
    });
    // Post-revocation: every read and write path fails closed — including the
    // data the preview page loads via getOnboardingForm.
    await expect(
      listOnboardingForms(session(coach.id), { workspaceId: ws.id }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      getOnboardingForm(
        session(coach.id),
        { workspaceId: ws.id, formId },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      saveOnboardingFormDraft(
        session(coach.id),
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: 1,
          draft: draftWith([]),
        },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      openOnboardingDraft(
        session(coach.id),
        { workspaceId: ws.id, formId },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      archiveOnboardingForm(
        session(coach.id),
        { workspaceId: ws.id, formId },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("archive records an ARCHIVED audit marker, never REMOVED", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "AuditShape" },
      prisma,
    );
    await archiveOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    const events = await prisma.auditEvent.findMany({
      where: { resourceType: "onboarding_form", resourceId: formId },
      orderBy: { at: "asc" },
    });
    const archive = events.at(-1);
    expect(archive?.action).toBe("UPDATE");
    expect((archive?.meta as { status?: string })?.status).toBe("ARCHIVED");
  });

  it("cross-workspace access is denied even for a valid role", async () => {
    const wsA = await workspace();
    const wsB = await workspace();
    const owner = await user();
    await member(wsA.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: wsA.id, name: "A" },
      prisma,
    );
    // Same user is not a member of wsB — and the formId belongs to wsA.
    await expect(
      getOnboardingForm(
        session(owner.id),
        { workspaceId: wsB.id, formId },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // Owner of wsB (different workspace) cannot read wsA's form.
    const ownerB = await user();
    await member(wsB.id, ownerB.id, "WORKSPACE_OWNER");
    await expect(
      getOnboardingForm(
        session(ownerB.id),
        { workspaceId: wsA.id, formId },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      getOnboardingForm(
        session(ownerB.id),
        { workspaceId: wsB.id, formId },
        prisma,
      ),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "form_not_accessible" }),
    );
  });

  it("save → publish produces an immutable version; idempotent retry returns it", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "Publish Me" },
      prisma,
    );

    const saved = await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftWith([
          field(0),
          {
            kind: "singleChoice",
            label: "Goal",
            required: true,
            order: 1,
            options: [{ label: "Fat loss" }, { label: "Muscle" }],
          },
        ]),
      },
      prisma,
    );
    expect(saved.revision).toBe(2);

    const published = await publishOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: 2 },
      prisma,
    );
    expect(published.versionSeq).toBe(1);

    // Same-revision retry → replay, not a second version.
    const retry = await publishOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: 2 },
      prisma,
    );
    expect(retry.versionSeq).toBe(1);
    expect(
      await prisma.onboardingFormVersion.count({ where: { formId } }),
    ).toBe(1);

    const detail = await getOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    expect(detail.draft).toBeNull();
    expect(detail.versions[0].definition.fields).toHaveLength(2);
    const snapshot = JSON.stringify(detail.versions[0].definition);

    // Mutating later drafts can never alter the published snapshot.
    await openOnboardingDraft(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    const detail2 = await getOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    const renamed = {
      ...detail2.draft!,
      title: "Renamed Title",
      fields: detail2.draft!.fields.map((f) => ({ ...f, label: "CHANGED" })),
    };
    await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: detail2.draftRevision,
        draft: renamed,
        name: "Renamed",
      },
      prisma,
    );
    const detail3 = await getOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    expect(JSON.stringify(detail3.versions[0].definition)).toBe(snapshot);
    expect(detail3.name).toBe("Renamed");
  });

  it("stale revision is rejected; forged fieldId is rejected", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "Rev" },
      prisma,
    );
    await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftWith([field(0)]),
      },
      prisma,
    );
    await expect(
      saveOnboardingFormDraft(
        session(owner.id),
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: 1,
          draft: draftWith([field(0)]),
        },
        prisma,
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "stale_revision" }));
    await expect(
      saveOnboardingFormDraft(
        session(owner.id),
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: 2,
          draft: draftWith([field(0, { fieldId: "f_forged_id" })]),
        },
        prisma,
      ),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "forbidden_field_id" }),
    );
  });

  it("empty draft cannot publish; archived forms are read-only", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "Empty" },
      prisma,
    );
    await expect(
      publishOnboardingForm(
        session(owner.id),
        { workspaceId: ws.id, formId, expectedRevision: 1 },
        prisma,
      ),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "publish_incomplete" }),
    );

    await archiveOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    const detail = await getOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    expect(detail.status).toBe("ARCHIVED");
    expect(detail.draft).not.toBeNull(); // draft preserved read-only
    await expect(
      saveOnboardingFormDraft(
        session(owner.id),
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: detail.draftRevision,
          draft: draftWith([field(0)]),
        },
        prisma,
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "form_archived" }));
    await expect(
      openOnboardingDraft(
        session(owner.id),
        { workspaceId: ws.id, formId },
        prisma,
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "form_archived" }));
    await expect(
      publishOnboardingForm(
        session(owner.id),
        { workspaceId: ws.id, formId, expectedRevision: 1 },
        prisma,
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "form_archived" }));
  });

  it("concurrent publish produces exactly one version", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "Race" },
      prisma,
    );
    await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftWith([field(0)]),
      },
      prisma,
    );
    const results = await Promise.allSettled([
      publishOnboardingForm(
        session(owner.id),
        { workspaceId: ws.id, formId, expectedRevision: 2 },
        prisma,
      ),
      publishOnboardingForm(
        session(owner.id),
        { workspaceId: ws.id, formId, expectedRevision: 2 },
        prisma,
      ),
      publishOnboardingForm(
        session(owner.id),
        { workspaceId: ws.id, formId, expectedRevision: 2 },
        prisma,
      ),
    ]);
    expect(
      await prisma.onboardingFormVersion.count({ where: { formId } }),
    ).toBe(1);
    for (const r of results) {
      if (r.status === "fulfilled") expect(r.value.versionSeq).toBe(1);
      else
        expect(r.reason).toEqual(
          expect.objectContaining({
            code: expect.stringMatching(
              /stale_revision|form_archived|invalid_input|serialization_conflict/,
            ),
          }),
        );
    }
  });

  it("save returns the normalized definition with stable server-minted IDs", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "Stable IDs" },
      prisma,
    );
    const s1 = await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftWith([field(0)]),
      },
      prisma,
    );
    const minted = s1.definition.fields[0].fieldId;
    expect(minted).toMatch(/^f_/);
    // Rename + save again — the returned ID must round-trip unchanged.
    const s2 = await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: s1.revision,
        draft: draftWith([{ ...s1.definition.fields[0], label: "Renamed" }]),
      },
      prisma,
    );
    expect(s2.definition.fields[0].fieldId).toBe(minted);
    // Add a field alongside the existing one — original ID survives, new minted.
    const s3 = await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: s2.revision,
        draft: draftWith([
          s2.definition.fields[0],
          field(1, { label: "Second" }),
        ]),
      },
      prisma,
    );
    expect(s3.definition.fields[0].fieldId).toBe(minted);
    expect(s3.definition.fields[1].fieldId).toMatch(/^f_/);
  });

  it("save without an open draft is rejected (post-publish revisions)", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "NoDraft" },
      prisma,
    );
    await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftWith([field(0)]),
      },
      prisma,
    );
    await publishOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: 2 },
      prisma,
    );
    const after = await getOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    // Post-publish the draft is closed: no revision may recreate it silently.
    for (const rev of [1, 2, after.draftRevision]) {
      await expect(
        saveOnboardingFormDraft(
          session(owner.id),
          {
            workspaceId: ws.id,
            formId,
            expectedRevision: rev,
            draft: draftWith([field(0)]),
          },
          prisma,
        ),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "no_open_draft" }),
      );
    }
  });

  it("retired field/option IDs cannot be resurrected from old versions", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "Retire" },
      prisma,
    );
    const s1 = await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftWith([
          field(0),
          {
            kind: "singleChoice",
            label: "C",
            required: false,
            order: 1,
            options: [{ label: "A" }],
          },
        ]),
      },
      prisma,
    );
    const fieldId = s1.definition.fields[0].fieldId;
    const choice = s1.definition.fields[1];
    const optionId = choice.options![0].optionId;

    await publishOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: s1.revision },
      prisma,
    );
    // Reopen seeds the draft from v1 — IDs are live again via the draft.
    const opened = await openOnboardingDraft(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    // Remove field A + the option from the draft and save.
    const s2 = await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: opened.revision,
        draft: draftWith([
          {
            fieldId: choice.fieldId,
            kind: "singleChoice",
            label: "C",
            required: false,
            order: 0,
            options: [{ label: "Brand new" }],
          },
        ]),
      },
      prisma,
    );
    // Retired IDs (field A, old option) are dead: re-presenting them must fail
    // even though they exist in published v1.
    await expect(
      saveOnboardingFormDraft(
        session(owner.id),
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: s2.revision,
          draft: draftWith([
            s2.definition.fields[0],
            {
              fieldId,
              kind: "shortText",
              label: "Zombie",
              required: false,
              order: 1,
            },
          ]),
        },
        prisma,
      ),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "forbidden_field_id" }),
    );
    await expect(
      saveOnboardingFormDraft(
        session(owner.id),
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: s2.revision,
          draft: draftWith([
            {
              fieldId: choice.fieldId,
              kind: "singleChoice",
              label: "C",
              required: false,
              order: 0,
              options: [{ optionId, label: "Zombie option" }],
            },
          ]),
        },
        prisma,
      ),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "forbidden_field_id" }),
    );
  });

  it("Restrict FK actually blocks version/form/member deletion", async () => {
    const ws = await workspace();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "FK" },
      prisma,
    );
    await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftWith([field(0)]),
      },
      prisma,
    );
    await publishOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: 2 },
      prisma,
    );
    // History is anchored: deleting the form, the workspace, or the creating
    // member must all be refused by Restrict foreign keys.
    await expect(
      prisma.onboardingForm.delete({ where: { id: formId } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(
      prisma.workspace.delete({ where: { id: ws.id } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(
      prisma.workspaceMember.delete({ where: { id: m.id } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(
      await prisma.onboardingFormVersion.count({ where: { formId } }),
    ).toBe(1);
  });

  it("concurrent archive vs save/publish serializes safely", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "Race2" },
      prisma,
    );
    await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftWith([field(0)]),
      },
      prisma,
    );
    const results = await Promise.allSettled([
      archiveOnboardingForm(
        session(owner.id),
        { workspaceId: ws.id, formId },
        prisma,
      ),
      publishOnboardingForm(
        session(owner.id),
        { workspaceId: ws.id, formId, expectedRevision: 2 },
        prisma,
      ),
      saveOnboardingFormDraft(
        session(owner.id),
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: 2,
          draft: draftWith([field(0, { label: "Loser" })]),
        },
        prisma,
      ),
    ]);
    // Whatever the interleaving, the final state is consistent: archived; at
    // most one version; losers got a typed failure, never a thrown engine error.
    for (const r of results) {
      if (r.status === "rejected")
        expect(r.reason).toEqual(
          expect.objectContaining({
            code: expect.stringMatching(
              /stale_revision|form_archived|no_open_draft|publish_incomplete|forbidden_field_id/,
            ),
          }),
        );
    }
    const detail = await getOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    expect(detail.status).toBe("ARCHIVED");
    expect(
      await prisma.onboardingFormVersion.count({ where: { formId } }),
    ).toBeLessThanOrEqual(1);
    // Archive is idempotent.
    const again = await archiveOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    expect(again.formId).toBe(formId);
    const row = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: formId },
    });
    expect(row.archivedByMemberId).not.toBeNull();
    expect(row.archivedAt).not.toBeNull();
  });

  it("deactivated member loses write access immediately", async () => {
    const ws = await workspace();
    const coach = await user();
    const m = await member(ws.id, coach.id, "COACH");
    const { formId } = await createOnboardingForm(
      session(coach.id),
      { workspaceId: ws.id, name: "CoachForm" },
      prisma,
    );
    await prisma.workspaceMember.update({
      where: { id: m.id },
      data: { status: "SUSPENDED" },
    });
    await expect(
      saveOnboardingFormDraft(
        session(coach.id),
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: 1,
          draft: draftWith([field(0)]),
        },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("save writes audit atomically — injected fault rolls back the draft save", async () => {
    // INJECTED fault (spy), same discipline as the create rollback test:
    // sentinel thrown inside the real transaction must leave the stored draft
    // and revision untouched.
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "SaveTx" },
      prisma,
    );
    const sentinel = new Error("INJECTED audit failure");
    const spy = vi
      .spyOn(auditModule, "writeAuditEvent")
      .mockRejectedValue(sentinel);
    try {
      await expect(
        saveOnboardingFormDraft(
          session(owner.id),
          {
            workspaceId: ws.id,
            formId,
            expectedRevision: 1,
            draft: draftWith([field(0)]),
          },
          prisma,
        ),
      ).rejects.toBe(sentinel);
      const row = await prisma.onboardingForm.findUniqueOrThrow({
        where: { id: formId },
      });
      expect(row.draftRevision).toBe(1);
      expect(row.draft).toMatchObject({ fields: [] });
    } finally {
      spy.mockRestore();
    }
  });

  it("save records editor identity/time and an UPDATE audit event", async () => {
    const ws = await workspace();
    const coach = await user();
    const m = await member(ws.id, coach.id, "COACH");
    const { formId } = await createOnboardingForm(
      session(coach.id),
      { workspaceId: ws.id, name: "Meta2" },
      prisma,
    );
    await saveOnboardingFormDraft(
      session(coach.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftWith([field(0)]),
      },
      prisma,
    );
    const row = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: formId },
    });
    expect(row.draftRevision).toBe(2);
    expect(row.draftSavedByMemberId).toBe(m.id);
    expect(row.draftUpdatedAt).not.toBeNull();
    const audit = await prisma.auditEvent.findFirst({
      where: {
        resourceType: "onboarding_form",
        resourceId: formId,
        action: "UPDATE",
      },
    });
    expect(audit).not.toBeNull();
  });

  it("open on an existing draft replays without revision bump or new audit", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "Replay" },
      prisma,
    );
    const auditBefore = await prisma.auditEvent.count({
      where: { resourceType: "onboarding_form", resourceId: formId },
    });
    const out = await openOnboardingDraft(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    // Replay: returns the open draft + current revision; no write, no audit.
    expect(out.revision).toBe(1);
    expect(out.definition).toMatchObject({ title: "Replay", fields: [] });
    const row = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: formId },
    });
    expect(row.draftRevision).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { resourceType: "onboarding_form", resourceId: formId },
      }),
    ).toBe(auditBefore);
  });

  it("open seeds a closed draft from the latest published version, retaining IDs", async () => {
    // Published version is a SYNTHETIC FIXTURE row — the publish service is
    // not in this slice. Draft must be seeded with title+IDs retained.
    const ws = await workspace();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: ws.id,
        name: "Seeded",
        createdByMemberId: m.id,
        draft: Prisma.JsonNull,
        draftRevision: 1,
      },
    });
    await prisma.onboardingFormVersion.create({
      data: {
        formId: form.id,
        versionSeq: 1,
        definition: {
          title: "Published title",
          fields: [
            {
              fieldId: "f_seed",
              kind: "shortText",
              label: "Seeded field",
              required: true,
              order: 0,
            },
          ],
        },
        publishOriginRevision: 1,
        publishedByMemberId: m.id,
      },
    });
    const out = await openOnboardingDraft(
      session(owner.id),
      { workspaceId: ws.id, formId: form.id },
      prisma,
    );
    expect(out.revision).toBe(2);
    expect(out.definition.title).toBe("Published title");
    // Seeded IDs are live again — the draft IS the trust source.
    expect(out.definition.fields[0].fieldId).toBe("f_seed");
    const row = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: form.id },
    });
    expect(row.draftRevision).toBe(2);
    expect(row.draftSavedByMemberId).toBe(m.id);
    const audit = await prisma.auditEvent.findFirst({
      where: {
        resourceType: "onboarding_form",
        resourceId: form.id,
        action: "UPDATE",
      },
    });
    expect(audit).not.toBeNull();
    // Re-presenting the seeded IDs on save must round-trip (they're live).
    const saved = await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId: form.id,
        expectedRevision: 2,
        draft: { title: "Edited", fields: out.definition.fields },
      },
      prisma,
    );
    expect(saved.definition.fields[0].fieldId).toBe("f_seed");
  });

  it("concurrent open/save serializes — no silent loss, deterministic outcome", async () => {
    const ws = await workspace();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    // Closed draft + published fixture → three concurrent opens race to seed.
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: ws.id,
        name: "RaceOpen",
        createdByMemberId: m.id,
        draft: Prisma.JsonNull,
        draftRevision: 1,
      },
    });
    await prisma.onboardingFormVersion.create({
      data: {
        formId: form.id,
        versionSeq: 1,
        definition: { title: "V1", fields: [] },
        publishOriginRevision: 1,
        publishedByMemberId: m.id,
      },
    });
    const results = await Promise.allSettled([
      openOnboardingDraft(
        session(owner.id),
        { workspaceId: ws.id, formId: form.id },
        prisma,
      ),
      openOnboardingDraft(
        session(owner.id),
        { workspaceId: ws.id, formId: form.id },
        prisma,
      ),
      openOnboardingDraft(
        session(owner.id),
        { workspaceId: ws.id, formId: form.id },
        prisma,
      ),
    ]);
    const row = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: form.id },
    });
    // Exactly one seed: revision bumped once, single UPDATE audit.
    expect(row.draftRevision).toBe(2);
    expect(
      await prisma.auditEvent.count({
        where: {
          resourceType: "onboarding_form",
          resourceId: form.id,
          action: "UPDATE",
        },
      }),
    ).toBe(1);
    const fulfilled = results.filter(
      (
        r,
      ): r is PromiseFulfilledResult<
        Awaited<ReturnType<typeof openOnboardingDraft>>
      > => r.status === "fulfilled",
    );
    // At least one open wins; EVERY fulfilled caller observes the same seed.
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      if (r.status === "fulfilled") {
        expect(r.value.revision).toBe(2);
        expect(r.value.definition.title).toBe("V1");
      } else {
        expect(r.reason).toEqual(
          expect.objectContaining({
            code: expect.stringMatching(
              /stale_revision|serialization_conflict|invalid_input/,
            ),
          }),
        );
      }
    }
  });

  it("concurrent save/save same revision — exactly one wins, one stale, one audit", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "SaveRace" },
      prisma,
    );
    const auditBefore = await prisma.auditEvent.count({
      where: { resourceType: "onboarding_form", resourceId: formId },
    });
    const results = await Promise.allSettled([
      saveOnboardingFormDraft(
        session(owner.id),
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: 1,
          draft: draftWith([field(0, { label: "A" })]),
        },
        prisma,
      ),
      saveOnboardingFormDraft(
        session(owner.id),
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: 1,
          draft: draftWith([field(0, { label: "B" })]),
        },
        prisma,
      ),
    ]);
    const wins = results.filter((r) => r.status === "fulfilled");
    const losses = results.filter((r) => r.status === "rejected");
    // Exactly one winner at revision 2; every loser is a typed conflict —
    // never a silent overwrite.
    expect(wins.length).toBe(1);
    expect(
      (wins[0] as PromiseFulfilledResult<{ revision: number }>).value.revision,
    ).toBe(2);
    for (const l of losses) {
      expect(l.reason).toEqual(
        expect.objectContaining({
          code: expect.stringMatching(/stale_revision|serialization_conflict/),
        }),
      );
    }
    const row = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: formId },
    });
    expect(row.draftRevision).toBe(2);
    // The persisted draft IS the fulfilled winner's normalized definition —
    // not merely a revision bump.
    const winner = (
      wins[0] as PromiseFulfilledResult<{
        revision: number;
        definition: unknown;
      }>
    ).value;
    expect(row.draft).toEqual(winner.definition);
    // Exactly one UPDATE audit for the winning save.
    expect(
      await prisma.auditEvent.count({
        where: {
          resourceType: "onboarding_form",
          resourceId: formId,
          action: "UPDATE",
        },
      }),
    ).toBe(1);
    void auditBefore;
  });

  it("concurrent open/save interleaves without silent loss", async () => {
    const ws = await workspace();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    // Closed draft + published fixture — open and save race.
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: ws.id,
        name: "OpenSave",
        createdByMemberId: m.id,
        draft: Prisma.JsonNull,
        draftRevision: 1,
      },
    });
    await prisma.onboardingFormVersion.create({
      data: {
        formId: form.id,
        versionSeq: 1,
        definition: {
          title: "V1",
          fields: [
            {
              fieldId: "f_v1",
              kind: "shortText",
              label: "Published field",
              required: false,
              order: 0,
            },
          ],
        },
        publishOriginRevision: 1,
        publishedByMemberId: m.id,
      },
    });
    const results = await Promise.allSettled([
      openOnboardingDraft(
        session(owner.id),
        { workspaceId: ws.id, formId: form.id },
        prisma,
      ),
      // A save racing with the open must be a typed rejection (no open draft
      // yet / stale revision) — never a silent write.
      saveOnboardingFormDraft(
        session(owner.id),
        {
          workspaceId: ws.id,
          formId: form.id,
          expectedRevision: 1,
          draft: draftWith([field(0)]),
        },
        prisma,
      ),
    ]);
    const row = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: form.id },
    });
    // Deterministic outcome: the save at expectedRevision=1 can NEVER succeed
    // (draft null before open → no_open_draft; after open → stale_revision;
    // serialization_conflict only if retries genuinely exhaust).
    const openRes = results[0];
    const saveRes = results[1];
    expect(openRes.status).toBe("fulfilled");
    const opened = (
      openRes as PromiseFulfilledResult<{
        revision: number;
        definition: { title: string; fields: Array<{ fieldId: string }> };
      }>
    ).value;
    expect(opened.revision).toBe(2);
    expect(opened.definition.title).toBe("V1");
    expect(opened.definition.fields[0].fieldId).toBe("f_v1");
    expect(saveRes.status).toBe("rejected");
    expect((saveRes as PromiseRejectedResult).reason).toEqual(
      expect.objectContaining({
        code: expect.stringMatching(
          /no_open_draft|stale_revision|serialization_conflict/,
        ),
      }),
    );
    // Persisted state: draft equals the published seed, revision exactly 2,
    // exactly one UPDATE audit.
    expect(row.draftRevision).toBe(2);
    expect(row.draft).toEqual(opened.definition);
    expect(
      await prisma.auditEvent.count({
        where: {
          resourceType: "onboarding_form",
          resourceId: form.id,
          action: "UPDATE",
        },
      }),
    ).toBe(1);
  });

  it("denied save/open on archived, no-draft, malformed, and cross-workspace states leave zero deltas", async () => {
    const ws = await workspace();
    const wsOther = await workspace();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    await member(wsOther.id, owner.id, "WORKSPACE_OWNER");
    const archived = await prisma.onboardingForm.create({
      data: {
        workspaceId: ws.id,
        name: "Arch",
        status: "ARCHIVED",
        createdByMemberId: m.id,
        draft: { title: "A", fields: [] },
        draftRevision: 3,
        archivedAt: new Date(),
        archivedByMemberId: m.id,
      },
    });
    const closed = await prisma.onboardingForm.create({
      data: {
        workspaceId: ws.id,
        name: "Closed",
        createdByMemberId: m.id,
        draft: Prisma.JsonNull,
        draftRevision: 1,
      },
    });
    const open1 = await prisma.onboardingForm.create({
      data: {
        workspaceId: ws.id,
        name: "Open",
        createdByMemberId: m.id,
        draft: { title: "O", fields: [] },
        draftRevision: 1,
      },
    });
    const auditBase = await prisma.auditEvent.count({
      where: { resourceType: "onboarding_form" },
    });
    const expectDenied = async (fn: () => Promise<unknown>, code: string) => {
      await expect(fn()).rejects.toThrowError(
        expect.objectContaining({ code }),
      );
    };
    // Archived: write ops deny.
    await expectDenied(
      () =>
        saveOnboardingFormDraft(
          session(owner.id),
          {
            workspaceId: ws.id,
            formId: archived.id,
            expectedRevision: 3,
            draft: draftWith([field(0)]),
          },
          prisma,
        ),
      "form_archived",
    );
    await expectDenied(
      () =>
        openOnboardingDraft(
          session(owner.id),
          { workspaceId: ws.id, formId: archived.id },
          prisma,
        ),
      "form_archived",
    );
    // Closed draft: save denies (open is the sanctioned path).
    await expectDenied(
      () =>
        saveOnboardingFormDraft(
          session(owner.id),
          {
            workspaceId: ws.id,
            formId: closed.id,
            expectedRevision: 1,
            draft: draftWith([field(0)]),
          },
          prisma,
        ),
      "no_open_draft",
    );
    // Malformed payloads deny before touching the row.
    await expectDenied(
      () =>
        saveOnboardingFormDraft(
          session(owner.id),
          {
            workspaceId: ws.id,
            formId: open1.id,
            expectedRevision: 1,
            draft: { title: 42, fields: "no" },
          },
          prisma,
        ),
      "invalid_input",
    );
    // Cross-workspace formId is never distinguishable from missing.
    await expectDenied(
      () =>
        saveOnboardingFormDraft(
          session(owner.id),
          {
            workspaceId: wsOther.id,
            formId: open1.id,
            expectedRevision: 1,
            draft: draftWith([field(0)]),
          },
          prisma,
        ),
      "form_not_accessible",
    );
    await expectDenied(
      () =>
        openOnboardingDraft(
          session(owner.id),
          { workspaceId: wsOther.id, formId: closed.id },
          prisma,
        ),
      "form_not_accessible",
    );
    // Zero deltas: no draft/revision churn, no audit writes.
    const rows = await prisma.onboardingForm.findMany({
      where: { id: { in: [archived.id, closed.id, open1.id] } },
    });
    expect(rows.find((r) => r.id === archived.id)?.draftRevision).toBe(3);
    expect(rows.find((r) => r.id === closed.id)?.draftRevision).toBe(1);
    expect(rows.find((r) => r.id === open1.id)?.draftRevision).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { resourceType: "onboarding_form" },
      }),
    ).toBe(auditBase);
  });

  it("open audit failure rolls back the seed (INJECTED fault)", async () => {
    const ws = await workspace();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: ws.id,
        name: "OpenTx",
        createdByMemberId: m.id,
        draft: Prisma.JsonNull,
        draftRevision: 1,
      },
    });
    const sentinel = new Error("INJECTED audit failure");
    const spy = vi
      .spyOn(auditModule, "writeAuditEvent")
      .mockRejectedValue(sentinel);
    try {
      await expect(
        openOnboardingDraft(
          session(owner.id),
          { workspaceId: ws.id, formId: form.id },
          prisma,
        ),
      ).rejects.toBe(sentinel);
      const row = await prisma.onboardingForm.findUniqueOrThrow({
        where: { id: form.id },
      });
      expect(row.draftRevision).toBe(1);
      expect(row.draft).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("open is denied for denied roles on the service path", async () => {
    const ws = await workspace();
    const owner = await user();
    const assistant = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    await member(ws.id, assistant.id, "ASSISTANT_COACH");
    const form = await prisma.onboardingForm.create({
      data: {
        workspaceId: ws.id,
        name: "DeniedOpen",
        createdByMemberId: m.id,
        draft: Prisma.JsonNull,
        draftRevision: 1,
      },
    });
    await expect(
      openOnboardingDraft(
        session(assistant.id),
        { workspaceId: ws.id, formId: form.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("publish snapshots the complete definition with actor/time and closes the draft", async () => {
    const ws = await workspace();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "Snap" },
      prisma,
    );
    const saved = await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: {
          title: "Snap intake",
          fields: [
            {
              kind: "singleChoice",
              label: "Mode",
              required: true,
              order: 0,
              helpText: "pick one",
              options: [{ label: "A" }, { label: "B" }],
            },
          ],
        },
      },
      prisma,
    );
    const pub = await publishOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: saved.revision },
      prisma,
    );
    expect(pub.versionSeq).toBe(1);
    const version = await prisma.onboardingFormVersion.findFirstOrThrow({
      where: { formId, versionSeq: 1 },
    });
    // The snapshot preserves the FULL normalized definition — every field's
    // kind/label/required/order/helpText and every minted ID.
    const def = version.definition as {
      title: string;
      fields: Array<{
        fieldId: string;
        kind: string;
        label: string;
        required: boolean;
        order: number;
        helpText?: string;
        options?: Array<{ optionId: string; label: string }>;
      }>;
    };
    expect(def).toEqual(saved.definition);
    expect(def.fields[0].helpText).toBe("pick one");
    expect(def.fields[0].options![0].optionId).toMatch(/^o_/);
    expect(version.publishedByMemberId).toBe(m.id);
    expect(version.publishOriginRevision).toBe(saved.revision);
    expect(version.publishedAt).not.toBeNull();
    // Draft is closed by publish — not cleared data, a closed state.
    const row = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: formId },
    });
    expect(row.draft).toBeNull();
    // Publish is audited with actor identity.
    const audit = await prisma.auditEvent.findFirst({
      where: {
        resourceType: "onboarding_form",
        resourceId: formId,
        action: "UPDATE",
        meta: { path: ["status"], equals: "PUBLISHED" },
      },
    });
    expect(audit).not.toBeNull();
  });

  it("publish retry by a denied actor is denied — authorization is re-run", async () => {
    const ws = await workspace();
    const owner = await user();
    const denied = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    await member(ws.id, denied.id, "ASSISTANT_COACH");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "RetryDeny" },
      prisma,
    );
    const saved = await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftWith([field(0)]),
      },
      prisma,
    );
    const pub = await publishOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: saved.revision },
      prisma,
    );
    // Same-arg retry by a DENIED actor must NOT idempotently succeed —
    // authorization is re-evaluated before the replay check.
    await expect(
      publishOnboardingForm(
        session(denied.id),
        { workspaceId: ws.id, formId, expectedRevision: saved.revision },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(pub.versionSeq).toBe(1);
    expect(
      await prisma.onboardingFormVersion.count({ where: { formId } }),
    ).toBe(1);
  });

  it("publish audit failure rolls back version + draft close (INJECTED fault)", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "PubTx" },
      prisma,
    );
    await saveOnboardingFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftWith([field(0)]),
      },
      prisma,
    );
    const sentinel = new Error("INJECTED audit failure");
    const spy = vi
      .spyOn(auditModule, "writeAuditEvent")
      .mockRejectedValue(sentinel);
    try {
      await expect(
        publishOnboardingForm(
          session(owner.id),
          { workspaceId: ws.id, formId, expectedRevision: 2 },
          prisma,
        ),
      ).rejects.toBe(sentinel);
      expect(
        await prisma.onboardingFormVersion.count({ where: { formId } }),
      ).toBe(0);
      const row = await prisma.onboardingForm.findUniqueOrThrow({
        where: { id: formId },
      });
      // Draft stays OPEN (not closed) when the publish tx rolls back.
      expect(row.draft).not.toBeNull();
      expect(row.draftRevision).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("repeat archive preserves stamps and emits no duplicate audit", async () => {
    const ws = await workspace();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "RepeatArch" },
      prisma,
    );
    await archiveOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    const first = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: formId },
    });
    const auditAfterFirst = await prisma.auditEvent.count({
      where: { resourceType: "onboarding_form", resourceId: formId },
    });
    // Second archive: idempotent — same stamps, no new audit.
    await archiveOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    const second = await prisma.onboardingForm.findUniqueOrThrow({
      where: { id: formId },
    });
    expect(second.archivedAt).toEqual(first.archivedAt);
    expect(second.archivedByMemberId).toBe(m.id);
    expect(second.status).toBe("ARCHIVED");
    // Versions and draft preserved read-only.
    expect(second.draft).not.toBeNull();
    expect(
      await prisma.auditEvent.count({
        where: { resourceType: "onboarding_form", resourceId: formId },
      }),
    ).toBe(auditAfterFirst);
  });

  it("archive audit failure rolls back the archive (INJECTED fault)", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const { formId } = await createOnboardingForm(
      session(owner.id),
      { workspaceId: ws.id, name: "ArchTx" },
      prisma,
    );
    const sentinel = new Error("INJECTED audit failure");
    const spy = vi
      .spyOn(auditModule, "writeAuditEvent")
      .mockRejectedValue(sentinel);
    try {
      await expect(
        archiveOnboardingForm(
          session(owner.id),
          { workspaceId: ws.id, formId },
          prisma,
        ),
      ).rejects.toBe(sentinel);
      const row = await prisma.onboardingForm.findUniqueOrThrow({
        where: { id: formId },
      });
      expect(row.status).toBe("ACTIVE");
      expect(row.archivedAt).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});
