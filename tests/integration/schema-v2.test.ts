/**
 * PR-M0 (schema v2) - integrity contract on real PostgreSQL: new-table
 * uniqueness, composite same-workspace coherence FKs, restore-window
 * CHECKs, extended kind/column CHECKs, archive provenance, D31
 * summaryParameterIds bound. One `it` per rule; each asserts the literal
 * rejection (P2002/P2003 or the named CHECK) plus an accepted control row.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = !!url;

describe.skipIf(!enabled)("PR-M0 schema v2 (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "message_read","message_attachment","message_draft_attachment","message_draft","message","conversation","checkin_answer_media","exercise_library_item","saved_meal","client_goal","tracker_comment","coach_task","coach_note","client_plan","iifym_plan_version","iifym_plan","media_object","checkin_submission_answer","checkin_submission","checkin_instance","checkin_form_version","checkin_form","daily_entry_revision_value","daily_entry_revision","daily_entry","client_setup_pin","client_setup","coaching_template_version_parameter","coaching_template_version","coaching_template","parameter_definition","client_assignment","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => prisma?.$disconnect());

  const uid = () => `sv${++n}_${Date.now()}`;
  const user = () =>
    prisma.user.create({
      data: { email: `${uid()}@example.test`, name: `U ${uid()}` },
    });
  const ws = () =>
    prisma.workspace.create({
      data: { name: `WS ${uid()}`, slug: `sv-${uid()}`, status: "ACTIVE" },
    });
  const member = (workspaceId: string, userId: string) =>
    prisma.workspaceMember.create({
      data: { workspaceId, userId, role: "COACH", status: "ACTIVE" },
    });
  const profile = (workspaceId: string) =>
    prisma.clientProfile.create({
      data: { workspaceId, name: `C ${uid()}` },
    });
  const media = (workspaceId: string) =>
    prisma.mediaObject.create({
      data: {
        workspaceId,
        kind: "IMAGE",
        storageKey: `s3://test/${uid()}`,
        fileName: "f.png",
        contentType: "image/png",
        byteSize: 100,
      },
    });
  const param = (workspaceId: string, memberId: string, kind = "MEASUREMENT") =>
    prisma.parameterDefinition.create({
      data: {
        workspaceId,
        key: `p_${uid()}`,
        kind: kind as never,
        label: `L ${uid()}`,
        createdByMemberId: memberId,
        updatedByMemberId: memberId,
      },
    });
  const conversation = (workspaceId: string, clientProfileId: string) =>
    prisma.conversation.create({ data: { workspaceId, clientProfileId } });
  const message = (
    workspaceId: string,
    conversationId: string,
    clientRequestId?: string,
  ) =>
    prisma.message.create({
      data: {
        workspaceId,
        conversationId,
        senderKind: "STAFF",
        clientRequestId: clientRequestId ?? `req_${uid()}`,
      },
    });

  /** Rejects with a CHECK violation naming the given constraint. */
  async function expectCheck(promise: Promise<unknown>, name: string) {
    let err: unknown;
    try {
      await promise;
    } catch (e) {
      err = e;
    }
    expect(err, `expected rejection naming ${name}`).toBeTruthy();
    const text = `${(err as { message?: string })?.message ?? ""} ${JSON.stringify(
      (err as { meta?: unknown })?.meta ?? {},
    )}`;
    expect(text).toContain(name);
  }

  it("conversation: a second conversation for the same client is rejected", async () => {
    const w = await ws();
    const cp = await profile(w.id);
    await conversation(w.id, cp.id);
    await expect(conversation(w.id, cp.id)).rejects.toMatchObject({
      code: "P2002",
    });
    // Control: a different client in the same workspace gets its thread.
    const cp2 = await profile(w.id);
    await conversation(w.id, cp2.id);
  });

  it("message_draft: second draft for the same (conversation, author) rejected; different author accepted", async () => {
    const w = await ws();
    const u1 = await user();
    const u2 = await user();
    const cp = await profile(w.id);
    const conv = await conversation(w.id, cp.id);
    await prisma.messageDraft.create({
      data: {
        workspaceId: w.id,
        conversationId: conv.id,
        authorUserId: u1.id,
        body: "hi",
      },
    });
    await expect(
      prisma.messageDraft.create({
        data: {
          workspaceId: w.id,
          conversationId: conv.id,
          authorUserId: u1.id,
          body: "again",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await prisma.messageDraft.create({
      data: {
        workspaceId: w.id,
        conversationId: conv.id,
        authorUserId: u2.id,
        body: "other author",
      },
    });
  });

  it("message: duplicate client_request_id in one conversation rejected", async () => {
    const w = await ws();
    const cp = await profile(w.id);
    const conv = await conversation(w.id, cp.id);
    const reqId = `req_${uid()}`;
    await message(w.id, conv.id, reqId);
    await expect(message(w.id, conv.id, reqId)).rejects.toMatchObject({
      code: "P2002",
    });
    // Control: the same request id in another conversation is a new key.
    const cp2 = await profile(w.id);
    const conv2 = await conversation(w.id, cp2.id);
    await message(w.id, conv2.id, reqId);
  });

  it("message_read: duplicate (message, user) rejected", async () => {
    const w = await ws();
    const u = await user();
    const cp = await profile(w.id);
    const conv = await conversation(w.id, cp.id);
    const msg = await message(w.id, conv.id);
    await prisma.messageRead.create({
      data: { messageId: msg.id, userId: u.id, readAt: new Date() },
    });
    await expect(
      prisma.messageRead.create({
        data: { messageId: msg.id, userId: u.id, readAt: new Date() },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    // Control: a different user may mark the same message read.
    const u2 = await user();
    await prisma.messageRead.create({
      data: { messageId: msg.id, userId: u2.id, readAt: new Date() },
    });
  });

  it("message_attachment: media from a foreign workspace rejected", async () => {
    const w1 = await ws();
    const w2 = await ws();
    const cp = await profile(w1.id);
    const conv = await conversation(w1.id, cp.id);
    const msg = await message(w1.id, conv.id);
    const foreign = await media(w2.id);
    await expect(
      prisma.messageAttachment.create({
        data: {
          messageId: msg.id,
          mediaObjectId: foreign.id,
          workspaceId: w1.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    // Control: same-workspace media attaches.
    const own = await media(w1.id);
    await prisma.messageAttachment.create({
      data: {
        messageId: msg.id,
        mediaObjectId: own.id,
        workspaceId: w1.id,
      },
    });
  });

  it("tracker_comment: duplicate (client, date, parameter) rejected; foreign-workspace parameter rejected", async () => {
    const w1 = await ws();
    const w2 = await ws();
    const u = await user();
    const u2 = await user();
    const m = await member(w1.id, u.id);
    const m2 = await member(w2.id, u2.id);
    const cp = await profile(w1.id);
    const p = await param(w1.id, m.id);
    const entryDate = new Date("2026-10-20T00:00:00Z");
    await prisma.trackerComment.create({
      data: {
        workspaceId: w1.id,
        clientProfileId: cp.id,
        entryDate,
        parameterId: p.id,
        body: "note",
        authorMemberId: m.id,
      },
    });
    await expect(
      prisma.trackerComment.create({
        data: {
          workspaceId: w1.id,
          clientProfileId: cp.id,
          entryDate,
          parameterId: p.id,
          body: "dup",
          authorMemberId: m.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    // Composite coherence FK: parameter must live in the comment's workspace.
    const foreignParam = await param(w2.id, m2.id);
    await expect(
      prisma.trackerComment.create({
        data: {
          workspaceId: w1.id,
          clientProfileId: cp.id,
          entryDate: new Date("2026-10-21T00:00:00Z"),
          parameterId: foreignParam.id,
          body: "x",
          authorMemberId: m.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("client_goal: parameter from a foreign workspace rejected", async () => {
    const w1 = await ws();
    const w2 = await ws();
    const u = await user();
    const u2 = await user();
    const m = await member(w1.id, u.id);
    const m2 = await member(w2.id, u2.id);
    const cp = await profile(w1.id);
    const foreignParam = await param(w2.id, m2.id);
    await expect(
      prisma.clientGoal.create({
        data: {
          workspaceId: w1.id,
          clientProfileId: cp.id,
          parameterId: foreignParam.id,
          targetValue: 80,
          unit: "kg",
          targetDate: new Date("2027-01-01T00:00:00Z"),
          createdByMemberId: m.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    // Control: same-workspace parameter accepted.
    const p = await param(w1.id, m.id);
    await prisma.clientGoal.create({
      data: {
        workspaceId: w1.id,
        clientProfileId: cp.id,
        parameterId: p.id,
        targetValue: 80,
        unit: "kg",
        targetDate: new Date("2027-01-01T00:00:00Z"),
        createdByMemberId: m.id,
      },
    });
  });

  it("coach_note: GENERAL note without a client rejected", async () => {
    const w = await ws();
    const u = await user();
    const m = await member(w.id, u.id);
    await expectCheck(
      prisma.coachNote.create({
        data: {
          workspaceId: w.id,
          visibility: "GENERAL",
          body: "general",
          authorMemberId: m.id,
        },
      }),
      "coach_note_visibility_client_check",
    );
    // Control: GENERAL with a client, and PRIVATE workspace-level both pass.
    const cp = await profile(w.id);
    await prisma.coachNote.create({
      data: {
        workspaceId: w.id,
        clientProfileId: cp.id,
        visibility: "GENERAL",
        body: "general",
        authorMemberId: m.id,
      },
    });
    await prisma.coachNote.create({
      data: {
        workspaceId: w.id,
        visibility: "PRIVATE",
        body: "private",
        authorMemberId: m.id,
      },
    });
  });

  it("restore window: coach_task deleted_at without restore_until rejected; restore_until before deleted_at rejected", async () => {
    const w = await ws();
    const u = await user();
    const m = await member(w.id, u.id);
    const base = {
      workspaceId: w.id,
      title: "t",
      createdByMemberId: m.id,
    };
    await expectCheck(
      prisma.coachTask.create({
        data: { ...base, deletedAt: new Date("2026-10-20T10:00:00Z") },
      }),
      "coach_task_restore_pairing_check",
    );
    await expectCheck(
      prisma.coachTask.create({
        data: {
          ...base,
          deletedAt: new Date("2026-10-20T10:00:00Z"),
          restoreUntil: new Date("2026-10-20T09:00:00Z"),
        },
      }),
      "coach_task_restore_window_check",
    );
    // Control: a valid deleted+restore pair, and a live row, both pass.
    await prisma.coachTask.create({
      data: {
        ...base,
        deletedAt: new Date("2026-10-20T10:00:00Z"),
        restoreUntil: new Date("2026-10-21T10:00:00Z"),
      },
    });
    await prisma.coachTask.create({ data: base });
  });

  it("summaryParameterIds: template version definition with 5 ids rejected, 4 accepted", async () => {
    const w = await ws();
    const u = await user();
    const m = await member(w.id, u.id);
    const tpl = await prisma.coachingTemplate.create({
      data: { workspaceId: w.id, name: "T", createdByMemberId: m.id },
    });
    const def = (ids: string[]) => ({
      parameters: {},
      sections: [],
      summaryParameterIds: ids,
    });
    await expectCheck(
      prisma.coachingTemplateVersion.create({
        data: {
          workspaceId: w.id,
          templateId: tpl.id,
          versionSeq: 1,
          definition: def(["a", "b", "c", "d", "e"]),
          publishOriginRevision: 1,
          publishedByMemberId: m.id,
        },
      }),
      "coaching_template_version_summary_parameters_check",
    );
    await prisma.coachingTemplateVersion.create({
      data: {
        workspaceId: w.id,
        templateId: tpl.id,
        versionSeq: 1,
        definition: def(["a", "b", "c", "d"]),
        publishOriginRevision: 1,
        publishedByMemberId: m.id,
      },
    });
  });

  /** Workspace + member + profile + pin chain for daily-entry values. */
  async function entryChain(kind: string) {
    const w = await ws();
    const u = await user();
    const m = await member(w.id, u.id);
    const cp = await profile(w.id);
    const p = await param(w.id, m.id, kind);
    const tpl = await prisma.coachingTemplate.create({
      data: { workspaceId: w.id, name: "T", createdByMemberId: m.id },
    });
    const ver = await prisma.coachingTemplateVersion.create({
      data: {
        workspaceId: w.id,
        templateId: tpl.id,
        versionSeq: 1,
        definition: { parameters: {}, sections: [] },
        publishOriginRevision: 1,
        publishedByMemberId: m.id,
      },
    });
    const setup = await prisma.clientSetup.create({
      data: { workspaceId: w.id, clientProfileId: cp.id },
    });
    const pin = await prisma.clientSetupPin.create({
      data: {
        clientSetupId: setup.id,
        workspaceId: w.id,
        clientProfileId: cp.id,
        seq: 1,
        templateId: tpl.id,
        templateVersionId: ver.id,
        assignedByMemberId: m.id,
      },
    });
    const entry = await prisma.dailyEntry.create({
      data: {
        workspaceId: w.id,
        clientProfileId: cp.id,
        entryDate: new Date("2026-10-20T00:00:00Z"),
        createdByMemberId: m.id,
      },
    });
    const rev = await prisma.dailyEntryRevision.create({
      data: {
        dailyEntryId: entry.id,
        workspaceId: w.id,
        clientProfileId: cp.id,
        clientSetupPinId: pin.id,
        templateVersionId: ver.id,
        seq: 1,
        canonicalHash: `h_${uid()}`,
        declaredAt: new Date("2026-10-20T10:00:00Z"),
        createdByMemberId: m.id,
      },
    });
    return { w, cp, p, rev };
  }

  it("daily_entry_revision_value: TIME 1440 rejected, 1439 accepted; BLOOD_PRESSURE with only systolic rejected", async () => {
    const c1 = await entryChain("TIME");
    await expectCheck(
      prisma.dailyEntryRevisionValue.create({
        data: {
          revisionId: c1.rev.id,
          workspaceId: c1.w.id,
          parameterId: c1.p.id,
          kind: "TIME",
          valueMinutes: 1440,
        },
      }),
      "daily_entry_revision_value_kind_column_chk",
    );
    // Control: 1439 is the last valid minute-of-day.
    await prisma.dailyEntryRevisionValue.create({
      data: {
        revisionId: c1.rev.id,
        workspaceId: c1.w.id,
        parameterId: c1.p.id,
        kind: "TIME",
        valueMinutes: 1439,
      },
    });
    const c2 = await entryChain("BLOOD_PRESSURE");
    await expectCheck(
      prisma.dailyEntryRevisionValue.create({
        data: {
          revisionId: c2.rev.id,
          workspaceId: c2.w.id,
          parameterId: c2.p.id,
          kind: "BLOOD_PRESSURE",
          valueSystolic: 120,
        },
      }),
      "daily_entry_revision_value_kind_column_chk",
    );
    // Control: both readings present.
    await prisma.dailyEntryRevisionValue.create({
      data: {
        revisionId: c2.rev.id,
        workspaceId: c2.w.id,
        parameterId: c2.p.id,
        kind: "BLOOD_PRESSURE",
        valueSystolic: 120,
        valueDiastolic: 80,
      },
    });
  });

  it("checkin_submission_answer: RATING without value_rating rejected", async () => {
    const w = await ws();
    const u = await user();
    const m = await member(w.id, u.id);
    const cp = await profile(w.id);
    const form = await prisma.checkInForm.create({
      data: { workspaceId: w.id, name: "F", createdByMemberId: m.id },
    });
    const ver = await prisma.checkInFormVersion.create({
      data: {
        workspaceId: w.id,
        formId: form.id,
        versionSeq: 1,
        definition: { questions: [] },
        publishOriginRevision: 1,
        publishedByMemberId: m.id,
      },
    });
    const inst = await prisma.checkInInstance.create({
      data: {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.id,
        formVersionId: ver.id,
        dueAt: new Date("2026-10-21T09:00:00Z"),
        scheduledByMemberId: m.id,
      },
    });
    const sub = await prisma.checkInSubmission.create({
      data: {
        workspaceId: w.id,
        clientProfileId: cp.id,
        formId: form.id,
        formVersionId: ver.id,
        instanceId: inst.id,
        submittedByUserId: u.id,
        submittedByMemberId: m.id,
      },
    });
    const answer = (kind: string, extra: Record<string, unknown>) =>
      prisma.checkInSubmissionAnswer.create({
        data: {
          submissionId: sub.id,
          workspaceId: w.id,
          clientProfileId: cp.id,
          fieldId: `f_${uid()}`,
          kind: kind as never,
          ...extra,
        },
      });
    await expectCheck(answer("RATING", {}), "checkin_submission_answer_kind_column_check");
    // Control: RATING with value_rating, and a VISUAL row with no values.
    await answer("RATING", { valueRating: 8 });
    await answer("VISUAL", {});
  });

  it("archive: client_profile archive_reason without archived_at rejected", async () => {
    const w = await ws();
    await expectCheck(
      prisma.clientProfile.create({
        data: { workspaceId: w.id, name: "C", archiveReason: "left" },
      }),
      "client_profile_archive_reason_check",
    );
    // Control: reason together with archived_at, and a live profile.
    await prisma.clientProfile.create({
      data: {
        workspaceId: w.id,
        name: "C",
        archivedAt: new Date("2026-10-20T10:00:00Z"),
        archiveReason: "left",
      },
    });
    await prisma.clientProfile.create({ data: { workspaceId: w.id, name: "C" } });
  });
});
