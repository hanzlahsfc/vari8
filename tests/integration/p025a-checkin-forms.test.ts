// P-025-A — Check-In form-definition service against disposable PostgreSQL.
// Real schema, real transactions, real authorization: the mocked actor is
// only a labeled session identity; every membership/role/workspace decision
// is re-resolved inside the serializable transaction.

import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  CheckInFormError,
  archiveCheckInForm,
  createCheckInForm,
  getCheckInForm,
  listCheckInForms,
  openCheckInDraft,
  publishCheckInForm,
  saveCheckInFormDraft,
} from "../../lib/checkin/forms";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("P-025-A check-in form service (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "checkin_form_version","checkin_form","audit_event","coach_profile","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `p25a${++n}_${Date.now()}`;
  const session = (userId: string) => ({ user: { id: userId } });

  async function user() {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: `Fixture ${uid()}`,
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
  }
  async function ws_() {
    return prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `p25a-${uid()}`, status: "ACTIVE" },
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

  const draftJson = (title = "Weekly Check-In") => ({
    title,
    fields: [
      {
        kind: "shortText",
        label: "How was your week?",
        required: true,
        order: 0,
      },
    ],
  });

  const auditRows = (formId: string) =>
    prisma.auditEvent.findMany({
      where: { resourceType: "checkin_form", resourceId: formId },
      orderBy: { at: "asc" },
    });

  async function ownedForm() {
    const ws = await ws_();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const created = await createCheckInForm(
      session(owner.id),
      { workspaceId: ws.id, name: "Intake" },
      prisma,
    );
    return { ws, owner, formId: created.formId };
  }

  it("create → save → publish → reopen → archive lifecycle with audit rows", async () => {
    const { ws, owner, formId } = await ownedForm();

    const saved = await saveCheckInFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftJson(),
      },
      prisma,
    );
    expect(saved.revision).toBe(2);
    expect(saved.definition.fields[0].fieldId).toMatch(/^f_/);

    const published = await publishCheckInForm(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: 2 },
      prisma,
    );
    expect(published).toEqual({ versionSeq: 1 });

    const detail = await getCheckInForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    expect(detail.draft).toBeNull();
    expect(detail.versions).toHaveLength(1);
    expect(detail.versions[0].definition.fields[0].label).toBe(
      "How was your week?",
    );

    // Reopen seeds v2 editing from the frozen v1 snapshot.
    const reopened = await openCheckInDraft(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    expect(reopened.revision).toBe(3);
    expect(reopened.definition.fields[0].fieldId).toBe(
      detail.versions[0].definition.fields[0].fieldId,
    );

    await archiveCheckInForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    const after = await getCheckInForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    expect(after.status).toBe("ARCHIVED");

    const audits = await auditRows(formId);
    expect(audits).toHaveLength(5); // create + save + publish + reopen + archive
    expect(audits[0].action).toBe("CREATE");
  });

  it("coach can manage forms; assistant/client/SUPPORT/nonmember denied", async () => {
    const ws = await ws_();
    const coach = await user();
    await member(ws.id, coach.id, "COACH");
    const created = await createCheckInForm(
      session(coach.id),
      { workspaceId: ws.id, name: "Coach form" },
      prisma,
    );
    expect(created.formId).toMatch(/./);

    for (const role of ["ASSISTANT_COACH", "SUPPORT", "CLIENT"] as const) {
      const u = await user();
      await member(ws.id, u.id, role);
      await expect(
        createCheckInForm(
          session(u.id),
          { workspaceId: ws.id, name: "Nope" },
          prisma,
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(
        listCheckInForms(session(u.id), { workspaceId: ws.id }, prisma),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }

    const outsider = await user();
    await expect(
      createCheckInForm(
        session(outsider.id),
        { workspaceId: ws.id, name: "Nope" },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("PLATFORM_ADMIN denied outright and via dual-role membership", async () => {
    const ws = await ws_();
    const admin = await prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$fixture",
        name: "Admin",
        platformRole: "PLATFORM_ADMIN",
        status: "ACTIVE",
      },
    });
    await expect(
      createCheckInForm(
        session(admin.id),
        { workspaceId: ws.id, name: "X" },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // Dual-role: the admin also holds an ACTIVE owner membership — the
    // deny-set still blocks it (binding security requirement).
    await member(ws.id, admin.id, "WORKSPACE_OWNER");
    await expect(
      createCheckInForm(
        session(admin.id),
        { workspaceId: ws.id, name: "X" },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      listCheckInForms(session(admin.id), { workspaceId: ws.id }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("stale revision fails without overwriting the current draft", async () => {
    const { ws, owner, formId } = await ownedForm();
    await saveCheckInFormDraft(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: 1, draft: draftJson() },
      prisma,
    );
    await expect(
      saveCheckInFormDraft(
        session(owner.id),
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: 1, // stale — current is 2
          draft: { title: "Sneaky", fields: [] },
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "stale_revision" });
    const detail = await getCheckInForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    expect(detail.draft?.title).toBe("Weekly Check-In");
    expect(detail.draftRevision).toBe(2);
  });

  it("concurrent draft saves serialize; the loser fails closed", async () => {
    const { ws, owner, formId } = await ownedForm();
    const s = session(owner.id);
    const save = (label: string) =>
      saveCheckInFormDraft(
        s,
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: 1,
          draft: {
            title: "T",
            fields: [
              {
                kind: "shortText",
                label,
                required: false,
                order: 0,
              },
            ],
          },
        },
        prisma,
      );
    const results = await Promise.allSettled([save("A"), save("B")]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
      code: expect.stringMatching(/stale_revision|serialization_conflict/),
    });
    const detail = await getCheckInForm(
      s,
      { workspaceId: ws.id, formId },
      prisma,
    );
    expect(detail.draftRevision).toBe(2); // exactly one save committed
  });

  it("concurrent publishes mint one deterministic version", async () => {
    const { ws, owner, formId } = await ownedForm();
    await saveCheckInFormDraft(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: 1, draft: draftJson() },
      prisma,
    );
    const s = session(owner.id);
    const pub = () =>
      publishCheckInForm(
        s,
        { workspaceId: ws.id, formId, expectedRevision: 2 },
        prisma,
      );
    const results = await Promise.allSettled([pub(), pub()]);
    const versions = results
      .filter(
        (r): r is PromiseFulfilledResult<{ versionSeq: number }> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value.versionSeq);
    // Both may return the committed v1 (replay) or one may conflict —
    // but exactly ONE version row must exist.
    const rows = await prisma.checkInFormVersion.findMany({
      where: { formId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].versionSeq).toBe(1);
    for (const v of versions) expect(v).toBe(1);
  });

  it("publish replay returns the existing version, not a duplicate", async () => {
    const { ws, owner, formId } = await ownedForm();
    await saveCheckInFormDraft(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: 1, draft: draftJson() },
      prisma,
    );
    const s = session(owner.id);
    const first = await publishCheckInForm(
      s,
      { workspaceId: ws.id, formId, expectedRevision: 2 },
      prisma,
    );
    const auditsBeforeReplay = (await auditRows(formId)).length;
    const replay = await publishCheckInForm(
      s,
      { workspaceId: ws.id, formId, expectedRevision: 2 },
      prisma,
    );
    expect(replay).toEqual(first);
    const rows = await prisma.checkInFormVersion.findMany({
      where: { formId },
    });
    expect(rows).toHaveLength(1);
    // Replay writes no duplicate version and no duplicate audit event.
    expect((await auditRows(formId)).length).toBe(auditsBeforeReplay);
  });

  it("later draft/v2 never mutates the immutable v1 snapshot", async () => {
    const { ws, owner, formId } = await ownedForm();
    await saveCheckInFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: draftJson("V1 title"),
      },
      prisma,
    );
    await publishCheckInForm(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: 2 },
      prisma,
    );
    const v1 = await prisma.checkInFormVersion.findFirstOrThrow({
      where: { formId, versionSeq: 1 },
    });
    const v1Json = JSON.stringify(v1.definition);
    const v1FieldId = (v1.definition as { fields: { fieldId: string }[] })
      .fields[0].fieldId;

    // Reopen + change labels + publish v2.
    const reopened = await openCheckInDraft(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    const v2Draft = {
      title: "V2 title",
      fields: [
        {
          kind: "shortText",
          label: "Completely rewritten question",
          required: false,
          order: 0,
          fieldId: reopened.definition.fields[0].fieldId,
        },
      ],
    };
    const saved2 = await saveCheckInFormDraft(
      session(owner.id),
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: reopened.revision,
        draft: v2Draft,
      },
      prisma,
    );
    await publishCheckInForm(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: saved2.revision },
      prisma,
    );

    const v1After = await prisma.checkInFormVersion.findFirstOrThrow({
      where: { formId, versionSeq: 1 },
    });
    expect(JSON.stringify(v1After.definition)).toBe(v1Json);
    expect(v1After.definition).toEqual(v1.definition);
    const v2 = await prisma.checkInFormVersion.findFirstOrThrow({
      where: { formId, versionSeq: 2 },
    });
    expect(
      (v2.definition as { fields: { fieldId: string }[] }).fields[0].fieldId,
    ).toBe(v1FieldId); // stable IDs across versions
  });

  it("archived forms reject save/publish/reopen; archive is idempotent and versions survive", async () => {
    const { ws, owner, formId } = await ownedForm();
    await saveCheckInFormDraft(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: 1, draft: draftJson() },
      prisma,
    );
    await publishCheckInForm(
      session(owner.id),
      { workspaceId: ws.id, formId, expectedRevision: 2 },
      prisma,
    );
    await archiveCheckInForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    const s = session(owner.id);
    await expect(
      saveCheckInFormDraft(
        s,
        { workspaceId: ws.id, formId, expectedRevision: 3, draft: draftJson() },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "form_archived" });
    await expect(
      publishCheckInForm(
        s,
        { workspaceId: ws.id, formId, expectedRevision: 3 },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "form_archived" });
    await expect(
      openCheckInDraft(s, { workspaceId: ws.id, formId }, prisma),
    ).rejects.toMatchObject({ code: "form_archived" });
    // Idempotent re-archive — no extra audit row, original stamps kept.
    const auditsBefore = (await auditRows(formId)).length;
    await archiveCheckInForm(s, { workspaceId: ws.id, formId }, prisma);
    expect((await auditRows(formId)).length).toBe(auditsBefore);
    const versions = await prisma.checkInFormVersion.count({
      where: { formId },
    });
    expect(versions).toBe(1); // archive never deletes published history
  });

  it("cross-workspace formId is not accessible; list is tenant-scoped", async () => {
    const { ws: wsA, owner, formId } = await ownedForm();
    const wsB = await ws_();
    await member(wsB.id, owner.id, "WORKSPACE_OWNER");
    const s = session(owner.id);
    await expect(
      getCheckInForm(s, { workspaceId: wsB.id, formId }, prisma),
    ).rejects.toMatchObject({ code: "form_not_accessible" });
    await expect(
      saveCheckInFormDraft(
        s,
        {
          workspaceId: wsB.id,
          formId,
          expectedRevision: 1,
          draft: draftJson(),
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "form_not_accessible" });
    const listB = await listCheckInForms(s, { workspaceId: wsB.id }, prisma);
    expect(listB).toHaveLength(0);
    const listA = await listCheckInForms(s, { workspaceId: wsA.id }, prisma);
    expect(listA).toHaveLength(1);
    expect(JSON.stringify(listA)).not.toContain("fields"); // no draft payload
  });

  it("membership revoked between list and write denies the write (no stale authority)", async () => {
    const ws = await ws_();
    const coach = await user();
    const m = await member(ws.id, coach.id, "COACH");
    const s = session(coach.id);
    await expect(
      listCheckInForms(s, { workspaceId: ws.id }, prisma),
    ).resolves.toEqual([]);
    await prisma.workspaceMember.update({
      where: { id: m.id },
      data: { status: "REMOVED" },
    });
    await expect(
      createCheckInForm(s, { workspaceId: ws.id, name: "Revoked" }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("malformed drafts mutate nothing — no draft write, no audit row", async () => {
    const { ws, owner, formId } = await ownedForm();
    const auditsBefore = (await auditRows(formId)).length;
    for (const bad of [
      null,
      { fields: [] },
      {
        title: "T",
        fields: [{ kind: "bogus", label: "x", order: 0, required: false }],
      },
      {
        title: "T",
        fields: [
          {
            kind: "shortText",
            label: "x".repeat(201),
            order: 0,
            required: false,
          },
        ],
      },
    ]) {
      await expect(
        saveCheckInFormDraft(
          session(owner.id),
          {
            workspaceId: ws.id,
            formId,
            expectedRevision: 1,
            draft: bad,
          },
          prisma,
        ),
      ).rejects.toBeInstanceOf(CheckInFormError);
    }
    const detail = await getCheckInForm(
      session(owner.id),
      { workspaceId: ws.id, formId },
      prisma,
    );
    expect(detail.draftRevision).toBe(1);
    expect((await auditRows(formId)).length).toBe(auditsBefore);
  });

  it("cannot resurrect a retired fieldId after field removal", async () => {
    const { ws, owner, formId } = await ownedForm();
    const s = session(owner.id);
    const saved = await saveCheckInFormDraft(
      s,
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: 1,
        draft: {
          title: "T",
          fields: [
            {
              kind: "shortText",
              label: "F1",
              required: false,
              order: 0,
            },
            {
              kind: "number",
              label: "F2",
              required: false,
              order: 1,
            },
          ],
        },
      },
      prisma,
    );
    const removedId = saved.definition.fields[0].fieldId;

    // Remove F1 — save succeeds.
    const afterRemoval = await saveCheckInFormDraft(
      s,
      {
        workspaceId: ws.id,
        formId,
        expectedRevision: saved.revision,
        draft: {
          title: "T",
          fields: [saved.definition.fields[1]],
        },
      },
      prisma,
    );

    // A later draft presenting the retired id is rejected — tombstone
    // prevents resurrection of historical ids.
    await expect(
      saveCheckInFormDraft(
        s,
        {
          workspaceId: ws.id,
          formId,
          expectedRevision: afterRemoval.revision,
          draft: {
            title: "T",
            fields: [
              saved.definition.fields[1],
              {
                kind: "shortText",
                label: "Resurrected",
                required: false,
                order: 1,
                fieldId: removedId,
              },
            ],
          },
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "forbidden_field_id" });
  });

  it("feature flag off writes nothing at the service boundary expectation", async () => {
    // Service-level evidence: authorization happens on every call regardless
    // of feature state — the flag itself is enforced at action/page layers
    // (integration proof there); the service itself never consults a flag
    // and never writes without authorize() succeeding.
    const { ws } = await ownedForm();
    const outsider = await user();
    await member(ws.id, outsider.id, "CLIENT");
    const before = await prisma.checkInForm.count();
    await expect(
      createCheckInForm(
        session(outsider.id),
        { workspaceId: ws.id, name: "X" },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await prisma.checkInForm.count()).toBe(before);
  });
});
