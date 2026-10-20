import { CHECKIN_SCHEDULE_HORIZON_DAYS } from "../../lib/checkin/schedules";
import { resolveLocalInstant } from "../../lib/checkin/timezone";
import type { SeedContext } from "./index";

/**
 * PR-M8 (D30, D34) — canvas demo Check-In domain seed.
 *
 * Values are copied from the canvas demo state
 * (`frontend/src/components/coach/model.ts` `createInitialState`):
 *
 *   - ONE weekly "Full" form carrying the canvas default-variant
 *     questions: "How did you feel this week?" (long text, required),
 *     "How was your training?" (rating, scale 1–10, required) and
 *     "Anything you would like me to know?" (long text, optional) —
 *     plus the two collectors the demo submissions actually carry,
 *     "Your note" (the canvas Submission.note textarea) and "Progress
 *     visuals" (the canvas VISUAL upload / Submission.visuals).
 *   - ONE "Custom update" form for the additional check-ins the canvas
 *     draws (Extra.type === "Custom"), with the numeric metrics the
 *     demo custom submission answers carry plus the same note/visual
 *     collectors.
 *   - Per-client weekly rules from `schedules: [{effective: "2026-10-01",
 *     weekdays: [i % 7]}]` — canvas weekday numbering is Monday=0
 *     (`(getUTCDay() + 6) % 7`). The canvas stores no time or zone;
 *     the seed pins 09:00 Europe/Vienna (the canvas's own formatDate
 *     zone and the parity freeze zone).
 *   - Generated occurrences anchored at the D32 parity freeze date
 *     2026-10-19 (Europe/Vienna) through T+56 inclusive, so the wiring
 *     PR's parity run compares like with like. Earlier recurring dates
 *     arrive through the read-only projection, never as rows.
 *   - The two demo extras (coach notes), the three demo submissions
 *     (typed answers incl. the rating and the visual media ids), one
 *     staff review, and one staff feedback reply — literal copies.
 *
 * Synthetic only: deterministic `seed-m8-*` ids, upsert throughout so
 * `npm run seed:dev` stays re-runnable. Demo submissions are written
 * the way a real submission writes rows (immutable submission + typed
 * answers + media joins); required-field gaps in the canvas demo state
 * are copied literally (requiredness is a service rule, not a CHECK).
 */

const WORKSPACE_SLUG = "canvas-demo";
const TZ = "Europe/Vienna";
const LOCAL_MINUTES = 9 * 60; // 09:00 — the canvas stores no time
const RULE_START = "2026-10-01"; // canvas Schedule.effective
const ANCHOR_TODAY = "2026-10-19"; // D32 parity freeze, Europe/Vienna

const CANVAS_WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

const WEEKLY_DEFINITION = {
  title: "Weekly check-in",
  fields: [
    {
      fieldId: "q-energy",
      kind: "longText",
      label: "How did you feel this week?",
      required: true,
      order: 0,
    },
    {
      fieldId: "q-training",
      kind: "rating",
      label: "How was your training?",
      required: true,
      order: 1,
      ratingScheme: "SCALE_1_10",
    },
    {
      fieldId: "q-note",
      kind: "longText",
      label: "Anything you would like me to know?",
      required: false,
      order: 2,
    },
    {
      fieldId: "q-your-note",
      kind: "longText",
      label: "Your note",
      required: false,
      order: 3,
    },
    {
      fieldId: "q-visuals",
      kind: "visual",
      label: "Progress visuals",
      required: false,
      order: 4,
    },
  ],
};

const CUSTOM_DEFINITION = {
  title: "Custom update",
  fields: [
    {
      fieldId: "q-bodyweight",
      kind: "number",
      label: "Bodyweight (kg)",
      required: true,
      order: 0,
    },
    {
      fieldId: "q-sleep",
      kind: "number",
      label: "Sleep (hours)",
      required: true,
      order: 1,
    },
    {
      fieldId: "q-your-note",
      kind: "longText",
      label: "Your note",
      required: false,
      order: 2,
    },
    {
      fieldId: "q-visuals",
      kind: "visual",
      label: "Progress visuals",
      required: false,
      order: 3,
    },
  ],
};

function dueAtFor(localDate: string): Date {
  const resolved = resolveLocalInstant(TZ, localDate, LOCAL_MINUTES);
  if (resolved.status !== "ok")
    throw new Error(`unrepresentable seed due instant ${localDate} ${TZ}`);
  return resolved.instant;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Weekly dates of `weekday` in [lo, hi] — same shape the generator
 *  enumerates through T+56. */
function weeklyDates(weekdayIndex: number, lo: string, hi: string): string[] {
  const out: string[] = [];
  const first = new Date(`${lo}T00:00:00Z`);
  // JS getUTCDay(): Sunday=0; canvas numbering is Monday=0..Sunday=6.
  const jsDay = (weekdayIndex + 1) % 7;
  first.setUTCDate(first.getUTCDate() + ((jsDay - first.getUTCDay() + 7) % 7));
  for (let d = first.toISOString().slice(0, 10); d <= hi; d = addDays(d, 7))
    out.push(d);
  return out;
}

export default async function seed(ctx: SeedContext): Promise<void> {
  const { prisma } = ctx;

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true },
  });
  const ws = workspace.id;
  const coachMember = await prisma.workspaceMember.findFirstOrThrow({
    where: { workspaceId: ws, role: "COACH", status: "ACTIVE" },
    select: { id: true, userId: true },
  });
  const clients = await prisma.clientProfile.findMany({
    where: { workspaceId: ws },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (clients.length < 15)
    throw new Error(
      `expected the 15 canvas demo clients, found ${clients.length} — run 00-workspace.seed.ts first`,
    );
  const clientId = (i: number) => clients[i]!.id;

  // ── Forms + one published version each (immutable definition snapshot) ──

  const weeklyForm = await prisma.checkInForm.upsert({
    where: { id: "seed-m8-form-weekly" },
    update: {},
    create: {
      id: "seed-m8-form-weekly",
      workspaceId: ws,
      name: "Weekly check-in",
      status: "ACTIVE",
      draftRevision: 1,
      createdByMemberId: coachMember.id,
    },
  });
  const weeklyVersion = await prisma.checkInFormVersion.upsert({
    where: { id: "seed-m8-fv-weekly-1" },
    update: {},
    create: {
      id: "seed-m8-fv-weekly-1",
      workspaceId: ws,
      formId: weeklyForm.id,
      versionSeq: 1,
      definition: WEEKLY_DEFINITION,
      publishOriginRevision: 1,
      publishedByMemberId: coachMember.id,
    },
  });
  const customForm = await prisma.checkInForm.upsert({
    where: { id: "seed-m8-form-custom" },
    update: {},
    create: {
      id: "seed-m8-form-custom",
      workspaceId: ws,
      name: "Custom update",
      status: "ACTIVE",
      draftRevision: 1,
      createdByMemberId: coachMember.id,
    },
  });
  const customVersion = await prisma.checkInFormVersion.upsert({
    where: { id: "seed-m8-fv-custom-1" },
    update: {},
    create: {
      id: "seed-m8-fv-custom-1",
      workspaceId: ws,
      formId: customForm.id,
      versionSeq: 1,
      definition: CUSTOM_DEFINITION,
      publishOriginRevision: 1,
      publishedByMemberId: coachMember.id,
    },
  });

  // ── Rules (canvas schedules) + generated occurrences through T+56 ──

  const horizonEnd = addDays(ANCHOR_TODAY, CHECKIN_SCHEDULE_HORIZON_DAYS);
  let generated = 0;
  for (let i = 0; i < 14; i++) {
    // canvas: schedules [{effective:"2026-10-01", weekdays: i === 14 ? [] : [i % 7]}]
    const weekday = CANVAS_WEEKDAYS[i % 7];
    const rule = await prisma.checkInScheduleRule.upsert({
      where: { id: `seed-m8-rule-${i}` },
      update: {},
      create: {
        id: `seed-m8-rule-${i}`,
        workspaceId: ws,
        clientProfileId: clientId(i),
        formId: weeklyForm.id,
        weekday,
        localTimeMinutes: LOCAL_MINUTES,
        timezone: TZ,
        startDate: new Date(`${RULE_START}T00:00:00Z`),
        createdByMemberId: coachMember.id,
      },
    });
    for (const d of weeklyDates(i % 7, ANCHOR_TODAY, horizonEnd)) {
      await prisma.checkInInstance.upsert({
        where: { id: `seed-m8-occ-${i}-${d}` },
        update: {},
        create: {
          id: `seed-m8-occ-${i}-${d}`,
          workspaceId: ws,
          clientProfileId: clientId(i),
          formId: weeklyForm.id,
          formVersionId: weeklyVersion.id,
          dueAt: dueAtFor(d),
          dueTz: TZ,
          scheduledByMemberId: coachMember.id,
          originRuleId: rule.id,
          occurrenceDate: new Date(`${d}T00:00:00Z`),
        },
      });
      generated += 1;
    }
  }

  // ── Demo users for the three submitted clients (no credentials — the
  //    SEED-FIX credential path owns sign-in; live-user.ts grants it on
  //    throwaway lane databases). ──

  const demoClientUser = async (i: number, slug: string) => {
    const user = await prisma.user.upsert({
      where: { email: `${slug}@canvas-demo.test` },
      update: {},
      create: {
        email: `${slug}@canvas-demo.test`,
        name: clients[i]!.name,
        status: "ACTIVE",
      },
    });
    // Rerun safety: free the user from any profile it already owns —
    // `clients` is createdAt-ordered and bulk rows share a timestamp, so a
    // previous run may have linked this user to a different profile.
    await prisma.clientProfile.updateMany({
      where: { workspaceId: ws, userId: user.id },
      data: { userId: null },
    });
    await prisma.clientProfile.update({
      where: { id: clientId(i) },
      data: { userId: user.id },
    });
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: ws, userId: user.id },
      select: { id: true },
    });
    const memberId =
      member?.id ??
      (
        await prisma.workspaceMember.create({
          data: {
            workspaceId: ws,
            userId: user.id,
            role: "CLIENT",
            status: "ACTIVE",
          },
          select: { id: true },
        })
      ).id;
    return { userId: user.id, memberId };
  };

  // ── One-off "Additional" check-ins (canvas extras — coach notes) ──

  const extra = async (
    id: string,
    i: number,
    localDate: string,
    coachNote: string | null,
  ) =>
    prisma.checkInInstance.upsert({
      where: { id },
      update: {},
      create: {
        id,
        workspaceId: ws,
        clientProfileId: clientId(i),
        formId: customForm.id,
        formVersionId: customVersion.id,
        dueAt: dueAtFor(localDate),
        dueTz: TZ,
        coachNote,
        scheduledByMemberId: coachMember.id,
      },
    });

  // canvas extras: client-005 Maya Patel 2026-10-14, client-001 Emma 2026-10-15
  await extra(
    "seed-m8-extra-maya",
    4,
    "2026-10-14",
    "Mid-week energy and recovery update",
  );
  await extra(
    "seed-m8-extra-emma",
    0,
    "2026-10-15",
    "How is the knee after the adjusted session?",
  );

  // ── Backdated occurrences the demo submissions live on ──

  const backdated = async (
    id: string,
    i: number,
    ruleIndex: number,
    localDate: string,
  ) =>
    prisma.checkInInstance.upsert({
      where: { id },
      update: {},
      create: {
        id,
        workspaceId: ws,
        clientProfileId: clientId(i),
        formId: weeklyForm.id,
        formVersionId: weeklyVersion.id,
        dueAt: dueAtFor(localDate),
        dueTz: TZ,
        scheduledByMemberId: coachMember.id,
        originRuleId: `seed-m8-rule-${ruleIndex}`,
        occurrenceDate: new Date(`${localDate}T00:00:00Z`),
      },
    });

  await backdated("seed-m8-occ-0-2026-10-12", 0, 0, "2026-10-12"); // Emma, Monday
  await backdated("seed-m8-occ-3-2026-10-08", 3, 3, "2026-10-08"); // Oliver, Thursday
  const lilyExtra = await extra(
    "seed-m8-extra-lily",
    2,
    "2026-10-12",
    null, // no canvas Extra row carries a coach note for lily's event
  );

  // ── Answers helper ──

  type AnswerRow = {
    fieldId: string;
    kind: "SHORT_TEXT" | "LONG_TEXT" | "NUMBER" | "RATING" | "VISUAL";
    valueText?: string;
    valueNumeric?: string;
    valueRating?: number;
    mediaIds?: string[];
  };

  const writeSubmission = async (input: {
    submissionId: string;
    instanceId: string;
    formId: string;
    formVersionId: string;
    clientIndex: number;
    submittedBy: { userId: string; memberId: string };
    submittedAt: string;
    answers: AnswerRow[];
  }) => {
    const submission = await prisma.checkInSubmission.upsert({
      where: { instanceId: input.instanceId },
      update: {},
      create: {
        id: input.submissionId,
        workspaceId: ws,
        clientProfileId: clientId(input.clientIndex),
        formId: input.formId,
        formVersionId: input.formVersionId,
        instanceId: input.instanceId,
        submittedByUserId: input.submittedBy.userId,
        submittedByMemberId: input.submittedBy.memberId,
        submittedAt: new Date(input.submittedAt),
      },
      select: { id: true },
    });
    for (const a of input.answers) {
      const answer = await prisma.checkInSubmissionAnswer.upsert({
        where: {
          submissionId_fieldId: {
            submissionId: submission.id,
            fieldId: a.fieldId,
          },
        },
        update: {},
        create: {
          submissionId: submission.id,
          workspaceId: ws,
          clientProfileId: clientId(input.clientIndex),
          fieldId: a.fieldId,
          kind: a.kind,
          valueText: a.valueText ?? null,
          valueNumeric: a.valueNumeric ?? null,
          valueRating: a.valueRating ?? null,
        },
        select: { id: true },
      });
      for (const [position, mediaObjectId] of (a.mediaIds ?? []).entries()) {
        await prisma.checkInAnswerMedia.upsert({
          where: {
            answerId_mediaObjectId: {
              answerId: answer.id,
              mediaObjectId,
            },
          },
          update: {},
          create: {
            answerId: answer.id,
            mediaObjectId,
            workspaceId: ws,
            position,
          },
        });
      }
    }
    return submission;
  };

  // ── submission-emma (Full, recurring 2026-10-12) ──

  const emma = await demoClientUser(0, "emma.anders");
  for (const [n, label] of [
    [1, "Front · 12 October"],
    [2, "Side · 12 October"],
  ] as const) {
    await prisma.mediaObject.upsert({
      where: { id: `seed-m8-media-emma-${n}` },
      update: {},
      create: {
        id: `seed-m8-media-emma-${n}`,
        workspaceId: ws,
        kind: "IMAGE",
        storageKey: `seed/m8/emma-${n}.jpg`,
        fileName: label,
        contentType: "image/jpeg",
        byteSize: BigInt(214_000),
        uploadedByUserId: emma.userId,
      },
    });
  }
  await writeSubmission({
    submissionId: "seed-m8-sub-emma",
    instanceId: "seed-m8-occ-0-2026-10-12",
    formId: weeklyForm.id,
    formVersionId: weeklyVersion.id,
    clientIndex: 0,
    submittedBy: emma,
    submittedAt: "2026-10-12T17:00:00Z",
    answers: [
      {
        fieldId: "q-energy",
        kind: "LONG_TEXT",
        valueText:
          "Energy was good and the morning routine really helped. A busy Friday, but meal prep kept me on track.",
      },
      { fieldId: "q-training", kind: "RATING", valueRating: 8 },
      {
        fieldId: "q-note",
        kind: "LONG_TEXT",
        valueText:
          "My left knee felt unsettled on the last split-squat set. Could we look at the setup?",
      },
      {
        fieldId: "q-your-note",
        kind: "LONG_TEXT",
        valueText: "Kept all three sessions this week.",
      },
      {
        fieldId: "q-visuals",
        kind: "VISUAL",
        mediaIds: ["seed-m8-media-emma-1", "seed-m8-media-emma-2"],
      },
    ],
  });

  // ── submission-lily (Custom, additional 2026-10-12) ──

  const lily = await demoClientUser(2, "lily.chen");
  await writeSubmission({
    submissionId: "seed-m8-sub-lily",
    instanceId: lilyExtra.id,
    formId: customForm.id,
    formVersionId: customVersion.id,
    clientIndex: 2,
    submittedBy: lily,
    submittedAt: "2026-10-12T17:00:00Z",
    answers: [
      { fieldId: "q-bodyweight", kind: "NUMBER", valueNumeric: "67.0" },
      { fieldId: "q-sleep", kind: "NUMBER", valueNumeric: "7.8" },
      {
        fieldId: "q-your-note",
        kind: "LONG_TEXT",
        valueText: "Just a quick update after the weekend. Feeling rested!",
      },
    ],
  });

  // ── submission-oliver (Full, recurring 2026-10-08) + review + feedback ──

  const oliver = await demoClientUser(3, "oliver.stone");
  await writeSubmission({
    submissionId: "seed-m8-sub-oliver",
    instanceId: "seed-m8-occ-3-2026-10-08",
    formId: weeklyForm.id,
    formVersionId: weeklyVersion.id,
    clientIndex: 3,
    submittedBy: oliver,
    submittedAt: "2026-10-08T17:00:00Z",
    answers: [
      {
        fieldId: "q-energy",
        kind: "LONG_TEXT",
        valueText: "A consistent week, no concerns.",
      },
    ],
  });
  // canvas response {text, changes: [], date} → one review + one feedback row.
  await prisma.checkInReview.upsert({
    where: { submissionId: "seed-m8-sub-oliver" },
    update: {},
    create: {
      id: "seed-m8-review-oliver",
      workspaceId: ws,
      clientProfileId: clientId(3),
      submissionId: "seed-m8-sub-oliver",
      reviewedByMemberId: coachMember.id,
      reviewedAt: new Date("2026-10-09T08:30:00Z"),
    },
  });
  await prisma.checkInFeedback.upsert({
    where: {
      submissionId_clientRequestId: {
        submissionId: "seed-m8-sub-oliver",
        clientRequestId: "seed-m8-oliver-fb-1",
      },
    },
    update: {},
    create: {
      id: "seed-m8-feedback-oliver",
      workspaceId: ws,
      clientProfileId: clientId(3),
      submissionId: "seed-m8-sub-oliver",
      authoredByMemberId: coachMember.id,
      body: "Keep the controlled tempo this week. Great consistency.",
      clientRequestId: "seed-m8-oliver-fb-1",
      sentAt: new Date("2026-10-09T08:30:00Z"),
    },
  });

  console.log(
    `[seed] check-ins: 2 forms, 14 rules, ${generated} generated occurrences ` +
      `(${ANCHOR_TODAY}..${horizonEnd} ${TZ}), 3 extras, 3 submissions, ` +
      `1 review + 1 feedback`,
  );
}
