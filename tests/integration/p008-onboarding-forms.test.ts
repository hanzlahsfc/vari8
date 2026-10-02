import { execFileSync } from "node:child_process";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import * as accessModule from "../../lib/workspace/access";
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
      await member(ws.id, owner.id, "WORKSPACE_OWNER");
      await listOnboardingForms(
        session(owner.id),
        { workspaceId: ws.id },
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
      expect(calls.length).toBeGreaterThanOrEqual(2);
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

  it("audit-write failure rolls back the created form (executed rollback)", async () => {
    // Dedicated disposable DB: fully migrated, then audit_event is dropped so
    // the audit insert inside create's transaction genuinely fails. The form
    // row must not survive — executed proof, not construction claims.
    const adminUrl = url!.replace(/\/p8r_int\?/, "/postgres?");
    const rbUrl = url!.replace(/\/p8r_int\?/, "/p8r_rb?");
    const admin = new PrismaClient({
      datasources: { db: { url: adminUrl } },
    });
    try {
      await admin.$executeRawUnsafe("DROP DATABASE IF EXISTS p8r_rb");
      await admin.$executeRawUnsafe("CREATE DATABASE p8r_rb");
    } finally {
      await admin.$disconnect();
    }
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: rbUrl },
    });
    const rb = new PrismaClient({ datasources: { db: { url: rbUrl } } });
    try {
      await rb.$executeRawUnsafe('DROP TABLE "audit_event" CASCADE');
      const w = await rb.workspace.create({
        data: { name: "RB", slug: `rb-${Date.now()}`, status: "ACTIVE" },
      });
      const u = await rb.user.create({
        data: {
          email: `rb-${Date.now()}@example.test`,
          passwordHash: "scrypt$fixture",
          name: "RB",
          platformRole: "USER",
          status: "ACTIVE",
        },
      });
      await rb.workspaceMember.create({
        data: {
          workspaceId: w.id,
          userId: u.id,
          role: "WORKSPACE_OWNER",
          status: "ACTIVE",
        },
      });
      let failure: unknown;
      try {
        await createOnboardingForm(
          session(u.id),
          { workspaceId: w.id, name: "Rollback" },
          rb,
        );
      } catch (e) {
        failure = e;
      }
      expect(failure).toBeDefined();
      // The failure must come from the audit write inside the transaction —
      // NOT from authorization. An AccessDeniedError here would mean auth
      // reads never reached the injected client.
      expect(failure).not.toBeInstanceOf(AccessDeniedError);
      expect(
        await rb.onboardingForm.count({ where: { workspaceId: w.id } }),
      ).toBe(0);
    } finally {
      await rb.$disconnect();
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
});
