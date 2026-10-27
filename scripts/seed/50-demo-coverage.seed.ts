import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Prisma } from "@prisma/client";

import {
  computeRevisionCanonicalHash,
  type HashParam,
} from "../../lib/daily-entry/canonical";
import { hashPassword } from "../../lib/password";
import { clientObjectPrefix } from "../../lib/storage";
import { writeLocalObject } from "../../lib/storage/local";
import {
  materializeWeeks,
  normalizeFieldConfig,
  normalizeTrainingDraft,
  type TrainingDraft,
} from "../../lib/trainingprogram/payload";
import type { SeedContext } from "./index";

/**
 * STAGE 11 — opt-in demo coverage profile (VARI8_SEED_DEMO=1).
 *
 * Fills the `canvas-demo` workspace with Lilly's merged frontend demo state
 * from the byte-verbatim JSON snapshot in `./demo-export/` (provenance in
 * `demo-export/PROVENANCE.md`; source ref trackc/merge-frontend-9491897 @
 * 9491897b9dbd1a13855854ae2a2d5fa8d8ae8230). The seed never parses the demo
 * `.ts` files — this JSON fixture is the only runtime input.
 *
 * Determinism: every calendar value resolves `day <n>` / `day <n>T<time>`
 * tokens against the snapshot anchor `index.json.generatedAt`
 * (2026-10-25, UTC). Row ids are the snapshot ids verbatim or a
 * `seed-demo-*` mint. Idempotent: every write is an upsert on a stable key
 * or a find-or-create; a second run touches nothing.
 *
 * Gating: index.ts skips `-demo-` modules unless VARI8_SEED_DEMO=1; the
 * in-module check below is the belt for direct invocation.
 */

const WORKSPACE_SLUG = "canvas-demo";
const TIMEZONE = "Europe/Vienna";
const CHECKIN_LOCAL_MINUTES = 9 * 60; // 09:00 — documented schedule default

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "demo-export");

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;
const load = (file: string): J =>
  JSON.parse(readFileSync(join(FIXTURE, file), "utf8"));

const INDEX = load("index.json") as {
  generatedAt: string;
  clients: { id: string; name: string; file: string }[];
};
const WORKSPACE = load("workspace.json");

/** `day <n>` / `day <n>T<tail>` / literal `YYYY-MM-DD` resolution. */
function resolveDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const m = /^day (-?\d+)(T.*)?$/.exec(value);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const base = new Date(`${INDEX.generatedAt}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(m[1]));
  const day = base.toISOString().slice(0, 10);
  return m[2] ? `${day}${m[2]}` : day;
}
const dayUtc = (v: unknown): Date | null => {
  const r = resolveDate(v);
  return r ? new Date(`${r.slice(0, 10)}T00:00:00Z`) : null;
};
const tsUtc = (v: unknown, fallback = "T12:00:00Z"): Date | null => {
  const r = resolveDate(v);
  if (!r) return null;
  return new Date(r.includes("T") ? r : `${r}${fallback}`);
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const QUESTION_KIND: Record<string, { field: string; answer: string }> = {
  "long text": { field: "longText", answer: "LONG_TEXT" },
  "short text": { field: "shortText", answer: "SHORT_TEXT" },
  number: { field: "number", answer: "NUMBER" },
  date: { field: "date", answer: "DATE" },
  rating: { field: "rating", answer: "RATING" },
  "single choice": { field: "singleChoice", answer: "SINGLE_CHOICE" },
  "multi choice": { field: "multiChoice", answer: "MULTI_CHOICE" },
  choice: { field: "singleChoice", answer: "SINGLE_CHOICE" },
  visual: { field: "visual", answer: "VISUAL" },
  "visual upload": { field: "visual", answer: "VISUAL" },
};

export default async function seed(ctx: SeedContext): Promise<void> {
  if (process.env.VARI8_SEED_DEMO !== "1") return;
  const { prisma } = ctx;
  const workspace = await prisma.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
  });
  if (!workspace) throw new Error("50-demo-coverage: canvas-demo missing");
  const staff = await prisma.workspaceMember.findFirstOrThrow({
    where: {
      workspaceId: workspace.id,
      role: { in: ["WORKSPACE_OWNER", "COACH"] },
      status: "ACTIVE",
    },
    orderBy: { createdAt: "asc" },
  });
  // Workspace preferences -> the workspace settings columns.
  const prefs = WORKSPACE.preferences ?? {};
  const prefData: Prisma.WorkspaceUpdateInput = {
    appearanceMode:
      String(prefs.mode ?? "dark").toUpperCase() === "LIGHT" ? "LIGHT" : "DARK",
    appearanceAccent: String(prefs.accent ?? "#EB91B8"),
    availabilityText: String(prefs.availability ?? ""),
    notificationsEnabled: prefs.notifications !== false,
    priorityNotificationsEnabled: prefs.priorityNotifications !== false,
  };
  if (
    workspace.appearanceMode !== prefData.appearanceMode ||
    workspace.appearanceAccent !== prefData.appearanceAccent ||
    workspace.availabilityText !== prefData.availabilityText ||
    workspace.notificationsEnabled !== prefData.notificationsEnabled ||
    workspace.priorityNotificationsEnabled !==
      prefData.priorityNotificationsEnabled
  )
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: prefData,
    });

  const clients = INDEX.clients.map((c) => ({ meta: c, data: load(c.file) }));
  const password =
    process.env.SEED_DEMO_CLIENT_PASSWORD ?? process.env.SEED_CLIENT_PASSWORD;
  if (!password)
    throw new Error(
      "50-demo-coverage: SEED_DEMO_CLIENT_PASSWORD or SEED_CLIENT_PASSWORD required",
    );

  // ── Accounts: every demo client gets a credential login; client-001 keeps
  // the default-profile client account (its profile is already linked).
  const users = new Map<string, string>(); // clientId -> userId
  const members = new Map<string, string>(); // clientId -> memberId
  for (const { meta, data } of clients) {
    const profile = await prisma.clientProfile.findFirstOrThrow({
      where: { workspaceId: workspace.id, name: data.name },
    });
    let userId = profile.userId;
    if (!userId) {
      const email = String(data.email ?? `${slug(data.name)}@demo.invalid`);
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, name: data.name, status: "ACTIVE" },
      });
      userId = user.id;
      const hash = await hashPassword(password);
      await prisma.account.upsert({
        where: {
          providerId_accountId: { providerId: "credential", accountId: userId },
        },
        update: {},
        create: {
          userId,
          accountId: userId,
          providerId: "credential",
          password: hash,
        },
      });
      await prisma.clientProfile.update({
        where: { id: profile.id },
        data: { userId },
      });
    }
    const member = await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId,
        role: "CLIENT",
        status: "ACTIVE",
      },
    });
    users.set(meta.id, userId);
    members.set(meta.id, member.id);
  }

  // ── Exercise library: union with the canvas starter set (35-training).
  for (const item of WORKSPACE.exerciseLibrary ?? []) {
    const existing = await prisma.exerciseLibraryItem.findFirst({
      where: { workspaceId: workspace.id, name: item.name, archivedAt: null },
    });
    if (existing) continue;
    await prisma.exerciseLibraryItem.create({
      data: {
        id: `seed-demo-${item.id}`,
        workspaceId: workspace.id,
        name: item.name,
        muscle: item.muscle,
        secondaryMuscles: item.secondaryMuscles ?? [],
        notes: item.notes ?? "",
        createdByMemberId: staff.id,
      },
    });
  }

  // ── Check-in forms: one form + published version per canvas template,
  // fields derived from the selected variant's metric fields + questions.
  const formByTemplate = new Map<
    string,
    { formId: string; versionId: string }
  >();
  for (const tpl of WORKSPACE.templates ?? []) {
    const variant =
      tpl.variants.find((v: J) => v.id === tpl.defaultVariant) ??
      tpl.variants[0];
    const formId = `seed-demo-form-${slug(tpl.id)}`;
    const versionId = `${formId}-v1`;
    const fields: J[] = [];
    for (const f of variant.fields ?? [])
      fields.push({
        fieldId: `demo-f-${slug(tpl.id)}-${slug(f.id)}`,
        kind: "number",
        label: `${f.id}${f.unit ? ` (${f.unit})` : ""}`,
        required: true,
        order: fields.length,
      });
    for (const q of variant.questions ?? []) {
      const kind =
        QUESTION_KIND[String(q.type).toLowerCase()]?.field ?? "longText";
      const field: J = {
        fieldId: `demo-q-${slug(tpl.id)}-${slug(q.id)}`,
        kind,
        label: q.label,
        required: Boolean(q.required),
        order: fields.length,
      };
      if (kind === "rating")
        field.ratingScheme = /10/.test(String(q.options))
          ? "SCALE_1_10"
          : "SCALE_1_5";
      if (kind === "singleChoice" || kind === "multiChoice")
        field.options = String(q.options ?? "")
          .split(",")
          .map((o: string) => o.trim())
          .filter(Boolean)
          .map((label: string, i: number) => ({
            optionId: `${field.fieldId}-opt-${i}`,
            label,
          }));
      fields.push(field);
    }
    const definition = { title: `${tpl.name} · ${variant.name}`, fields };
    await prisma.checkInForm.upsert({
      where: { id: formId },
      update: {},
      create: {
        id: formId,
        workspaceId: workspace.id,
        name: tpl.name,
        status: "ACTIVE",
        draft: definition,
        draftRevision: 1,
        draftSavedByMemberId: staff.id,
        createdByMemberId: staff.id,
      },
    });
    await prisma.checkInFormVersion.upsert({
      where: {
        formId_versionSeq: { formId, versionSeq: 1 },
      },
      update: {},
      create: {
        id: versionId,
        workspaceId: workspace.id,
        formId,
        versionSeq: 1,
        definition,
        publishOriginRevision: 1,
        publishedAt: dayUtc(INDEX.generatedAt)!,
        publishedByMemberId: staff.id,
      },
    });
    formByTemplate.set(tpl.id, { formId, versionId });
  }

  // ── Per-client slices ────────────────────────────────────────────────
  for (const { meta, data } of clients) {
    const cid = meta.id;
    const profile = await prisma.clientProfile.findFirstOrThrow({
      where: { workspaceId: workspace.id, name: data.name },
    });
    const clientMemberId = members.get(cid)!;
    const clientUserId = users.get(cid)!;
    const assigned =
      formByTemplate.get(data.assignment?.templateId) ??
      [...formByTemplate.values()][0];

    // Priority flag + archive state (legacy strings stay unmapped).
    await prisma.clientProfile.update({
      where: { id: profile.id },
      data: {
        priorityMessagesAllowed: Boolean(data.priorityMessages),
        archivedAt: data.archived ? dayUtc(INDEX.generatedAt) : null,
      },
    });

    // Check-in schedule rules (one rule per effective window x weekday).
    const schedules = [...(data.schedules ?? [])].sort(
      (a: J, b: J) =>
        (dayUtc(a.effective)?.getTime() ?? 0) -
        (dayUtc(b.effective)?.getTime() ?? 0),
    );
    const WD = [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ];
    const ruleRanges: {
      id: string;
      start: Date;
      end: Date | null;
      day: number;
    }[] = [];
    for (const [si, s] of schedules.entries()) {
      for (const day of s.weekdays ?? []) {
        const start = dayUtc(s.effective);
        if (!start || !WD[day - 1]) continue;
        const next = schedules[si + 1];
        const end = next ? dayUtc(next.effective) : null;
        if (end) end.setUTCDate(end.getUTCDate() - 1);
        ruleRanges.push({
          id: `seed-demo-rule-${cid}-${si}-${day}`,
          start,
          end,
          day,
        });
        await prisma.checkInScheduleRule.upsert({
          where: { id: `seed-demo-rule-${cid}-${si}-${day}` },
          update: {},
          create: {
            id: `seed-demo-rule-${cid}-${si}-${day}`,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            formId: assigned.formId,
            weekday: WD[day - 1] as J,
            localTimeMinutes: CHECKIN_LOCAL_MINUTES,
            timezone: TIMEZONE,
            startDate: start,
            endDate: end,
            status: "ACTIVE",
            createdByMemberId: staff.id,
          },
        });
      }
    }

    // Submissions: instance + submission + typed answers + review/feedback +
    // progress-photo media (bytes from the in-tree demo/physique assets).
    for (const sub of data.related?.submissions ?? []) {
      const date = dayUtc(sub.date);
      if (!date) continue;
      const instanceId = `seed-demo-ci-${sub.id}`;
      // Recurring submissions carry the rule-derived occurrence pair;
      // ruleless dates stay a manual instance (pairing CHECK).
      const dayIndex = ((date.getUTCDay() + 6) % 7) + 1;
      const rule = ruleRanges.find(
        (r) =>
          r.day === dayIndex &&
          r.start.getTime() <= date.getTime() &&
          (!r.end || r.end.getTime() >= date.getTime()),
      );
      await prisma.checkInInstance.upsert({
        where: { id: instanceId },
        update: {},
        create: {
          id: instanceId,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          formId: assigned.formId,
          formVersionId: assigned.versionId,
          dueAt: new Date(`${date.toISOString().slice(0, 10)}T09:00:00Z`),
          dueTz: TIMEZONE,
          scheduledByMemberId: staff.id,
          scheduledAt: date,
          originRuleId: rule?.id ?? null,
          occurrenceDate: rule ? date : null,
          coachNote: sub.note ?? null,
        },
      });
      const submissionId = `seed-demo-sub-${sub.id}`;
      await prisma.checkInSubmission.upsert({
        where: { id: submissionId },
        update: {},
        create: {
          id: submissionId,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          formId: assigned.formId,
          formVersionId: assigned.versionId,
          instanceId,
          submittedByUserId: clientUserId,
          submittedByMemberId: clientMemberId,
          submittedAt: tsUtc(sub.date) ?? date,
        },
      });
      const variant =
        data.assignment?.snapshot?.variants?.find(
          (v: J) => v.id === data.assignment.variantId,
        ) ?? data.assignment?.snapshot?.variants?.[0];
      let order = 0;
      let visualAnswerId: string | null = null;
      for (const ans of sub.answers ?? []) {
        order += 1;
        const q = (variant?.questions ?? []).find(
          (x: J) => x.label === ans.question,
        );
        const kindMap = q
          ? QUESTION_KIND[String(q.type).toLowerCase()]
          : undefined;
        const answerKind = (kindMap?.answer ?? "LONG_TEXT") as J;
        const row: Prisma.CheckInSubmissionAnswerUncheckedCreateInput = {
          id: `seed-demo-ans-${sub.id}-${order}`,
          submissionId,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          fieldId: q
            ? `demo-q-${slug(data.assignment.templateId)}-${slug(q.id)}`
            : `demo-x-${slug(ans.question)}`,
          kind: answerKind,
        };
        const text = String(ans.answer ?? "");
        if (answerKind === "RATING") {
          const n = Number.parseInt(text, 10);
          if (Number.isFinite(n)) row.valueRating = n;
          else row.valueText = text;
        } else if (answerKind === "NUMBER") {
          const n = Number.parseFloat(text.replace(/[^\d.-]/g, ""));
          if (Number.isFinite(n)) row.valueNumeric = n;
          else row.valueText = text;
        } else if (
          answerKind === "SINGLE_CHOICE" ||
          answerKind === "MULTI_CHOICE"
        ) {
          row.valueText = text;
        } else if (answerKind !== "VISUAL") {
          row.valueText = text;
        }
        // VISUAL answers carry no scalar column — the media join is the
        // payload (checkin_submission_answer_kind_column_check).
        await prisma.checkInSubmissionAnswer.upsert({
          where: { id: row.id as string },
          update: {},
          create: row,
        });
        if (answerKind === "VISUAL") visualAnswerId = row.id as string;
      }
      for (const [pi, photo] of (sub.photos ?? []).entries()) {
        const src = String(photo.src ?? "");
        const file = src.split("/").pop();
        if (!file) continue;
        let bytes: Buffer;
        try {
          bytes = readFileSync(
            join(FIXTURE, "../../../frontend/public", src),
          ) as Buffer;
        } catch {
          continue; // media asset absent on this tree — row skips, note in MAPPING
        }
        const storageKey = `${clientObjectPrefix(workspace.id, profile.id)}${sub.id}-${file}`;
        await writeLocalObject(storageKey, new Uint8Array(bytes));
        const mediaId = `seed-demo-media-${sub.id}-${pi}`;
        await prisma.mediaObject.upsert({
          where: { storageKey },
          update: {},
          create: {
            id: mediaId,
            workspaceId: workspace.id,
            kind: "IMAGE",
            storageKey,
            fileName: `${photo.pose} · ${date.toISOString().slice(0, 10)}`,
            contentType: "image/svg+xml",
            byteSize: BigInt(bytes.byteLength),
            uploadedByUserId: clientUserId,
          },
        });
        await prisma.progressPhotoEntry.upsert({
          where: { id: `seed-demo-pp-${sub.id}-${pi}` },
          update: {},
          create: {
            id: `seed-demo-pp-${sub.id}-${pi}`,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            mediaObjectId: mediaId,
            takenOn: date,
            checkInSubmissionId: submissionId,
            clientVisible: true,
          },
        });
        if (visualAnswerId)
          await prisma.checkInAnswerMedia.upsert({
            where: {
              answerId_mediaObjectId: {
                answerId: visualAnswerId,
                mediaObjectId: mediaId,
              },
            },
            update: {},
            create: {
              answerId: visualAnswerId,
              mediaObjectId: mediaId,
              workspaceId: workspace.id,
              position: pi,
            },
          });
      }
      if (sub.response) {
        const sentAt = tsUtc(sub.response.date) ?? date;
        await prisma.checkInReview.upsert({
          where: { id: `seed-demo-rev-${sub.id}` },
          update: {},
          create: {
            id: `seed-demo-rev-${sub.id}`,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            submissionId,
            reviewedByMemberId: staff.id,
            reviewedAt: sentAt,
          },
        });
        await prisma.checkInFeedback.upsert({
          where: { id: `seed-demo-fb-${sub.id}` },
          update: {},
          create: {
            id: `seed-demo-fb-${sub.id}`,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            submissionId,
            authoredByMemberId: staff.id,
            body: sub.response.text ?? "",
            clientRequestId: `seed-demo-fbreq-${sub.id}`,
            sentAt,
          },
        });
      }
    }

    // Additional (non-recurring) check-in requests.
    for (const extra of data.related?.extras ?? []) {
      const date = dayUtc(extra.date);
      if (!date) continue;
      await prisma.checkInInstance.upsert({
        where: { id: `seed-demo-ci-${extra.id}` },
        update: {},
        create: {
          id: `seed-demo-ci-${extra.id}`,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          formId: assigned.formId,
          formVersionId: assigned.versionId,
          dueAt: new Date(`${date.toISOString().slice(0, 10)}T09:00:00Z`),
          dueTz: TIMEZONE,
          scheduledByMemberId: staff.id,
          scheduledAt: date,
          coachNote: extra.note ?? null,
        },
      });
    }

    // Messages: one conversation per client, ordered messages + read rows.
    const msgs = data.related?.messages ?? [];
    if (msgs.length) {
      const conv = await prisma.conversation.upsert({
        where: { id: `seed-demo-conv-${cid}` },
        update: {},
        create: {
          id: `seed-demo-conv-${cid}`,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          lastMessageAt: tsUtc(msgs[msgs.length - 1].date),
        },
      });
      for (const m of msgs) {
        const sentAt = tsUtc(m.date) ?? dayUtc(INDEX.generatedAt)!;
        const isCoach = m.from === "coach";
        const msgId = `seed-demo-msg-${m.id}`;
        await prisma.message.upsert({
          where: { id: msgId },
          update: {},
          create: {
            id: msgId,
            workspaceId: workspace.id,
            conversationId: conv.id,
            senderKind: isCoach ? "STAFF" : "CLIENT",
            senderUserId: isCoach ? staff.userId : clientUserId,
            body: m.text ?? "",
            priority: Boolean(m.priority),
            links: m.link
              ? ({ link: m.link } as Prisma.InputJsonValue)
              : undefined,
            clientRequestId: `seed-demo-mreq-${m.id}`,
            sentAt,
          },
        });
        if (m.read) {
          const readerId = isCoach ? clientUserId : staff.userId;
          await prisma.messageRead.upsert({
            where: { messageId_userId: { messageId: msgId, userId: readerId } },
            update: {},
            create: { messageId: msgId, userId: readerId, readAt: sentAt },
          });
        }
      }
    }

    // Coach notes: internal -> PRIVATE, general -> GENERAL. The pin flag
    // rides the W2-A1 CoachNote.pinned column (it used to be a "[pinned] "
    // body prefix before the column existed).
    for (const [kind, list] of [
      ["PRIVATE", data.internalNotes],
      ["GENERAL", data.generalNotes],
    ] as const) {
      for (const n of list ?? []) {
        await prisma.coachNote.upsert({
          where: { id: `seed-demo-note-${n.id}` },
          update: {},
          create: {
            id: `seed-demo-note-${n.id}`,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            visibility: kind,
            body: n.text ?? "",
            pinned: kind === "PRIVATE" && n.pinned === true,
            authorMemberId: staff.id,
          },
        });
      }
    }

    // W2-A1: phase plan and per-week timeline notes.
    for (const p of data.phases ?? []) {
      const start = dayUtc(p.startDate);
      if (!start) continue;
      await prisma.clientPhase.upsert({
        where: { id: `seed-demo-phase-${p.id}` },
        update: {},
        create: {
          id: `seed-demo-phase-${p.id}`,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          name: p.name ?? "Phase",
          startDate: start,
          durationWeeks: Number(p.durationWeeks) || 1,
        },
      });
    }
    for (const [weekToken, body] of Object.entries(data.weekNotes ?? {})) {
      const weekStart = dayUtc(weekToken);
      if (!weekStart || typeof body !== "string" || !body.trim()) continue;
      await prisma.clientWeekNote.upsert({
        where: {
          clientProfileId_weekStart: {
            clientProfileId: profile.id,
            weekStart,
          },
        },
        update: {},
        create: {
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          weekStart,
          body,
          authorMemberId: staff.id,
        },
      });
    }
    for (const t of data.related?.coachTodos ?? []) {
      await prisma.coachTask.upsert({
        where: { id: `seed-demo-ct-${t.id}` },
        update: {},
        create: {
          id: `seed-demo-ct-${t.id}`,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          title: t.title ?? t.text ?? "Coach to-do",
          completedAt:
            t.done || t.completedAt
              ? dayUtc(t.completedAt ?? t.dueDate ?? INDEX.generatedAt)
              : null,
          createdByMemberId: staff.id,
        },
      });
    }

    // Client tasks.
    for (const t of data.clientTasks ?? []) {
      const done =
        String(t.status).toLowerCase() === "complete" ||
        String(t.status).toLowerCase() === "completed";
      await prisma.clientTask.upsert({
        where: { id: `seed-demo-task-${t.id}` },
        update: {},
        create: {
          id: `seed-demo-task-${t.id}`,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          title: t.title,
          dueDate: dayUtc(t.dueDate) ?? dayUtc(INDEX.generatedAt)!,
          status: done ? "COMPLETED" : "OPEN",
          assignedByMemberId: staff.id,
          completedByUserId: done ? clientUserId : null,
          completedAt: done
            ? new Date(
                `${(dayUtc(t.dueDate) ?? dayUtc(INDEX.generatedAt)!)
                  .toISOString()
                  .slice(0, 10)}T17:00:00Z`,
              )
            : null,
        },
      });
    }

    // Habits + schedules + log.
    for (const h of data.habits ?? []) {
      const habitId = `seed-demo-habit-${h.id}`;
      await prisma.habit.upsert({
        where: { id: habitId },
        update: {},
        create: {
          id: habitId,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          name: h.name,
          target: h.goal ?? "",
          reason: h.reason ?? "",
        },
      });
      const days = h.frequency?.kind === "weekdays" ? h.frequency.days : null;
      const mask = days
        ? days.reduce((acc: number, d: number) => acc | (1 << (d - 1)), 0)
        : 0b1111111;
      await prisma.habitSchedule.upsert({
        where: {
          habitId_effectiveFrom: {
            habitId,
            effectiveFrom:
              dayUtc(data.coachingSince) ?? dayUtc(INDEX.generatedAt)!,
          },
        },
        update: {},
        create: {
          habitId,
          effectiveFrom:
            dayUtc(data.coachingSince) ?? dayUtc(INDEX.generatedAt)!,
          weekdays: mask,
        },
      });
      for (const d of data.habitLog?.[h.id] ?? []) {
        const date = dayUtc(d);
        if (!date) continue;
        await prisma.habitLog.upsert({
          where: { habitId_date: { habitId, date } },
          update: {},
          create: {
            habitId,
            date,
            status: "DONE",
            loggedByUserId: clientUserId,
          },
        });
      }
    }

    // Tracking entries -> daily entries on a shared demo template, plus
    // nutrition logs for macro days.
    const entries = data.tracking?.entries ?? [];
    if (entries.length) {
      const KEYS = [
        "weight",
        "sleep",
        "water",
        "steps",
        "calories",
        "protein",
        "carbs",
        "fat",
      ];
      const paramIds: Record<string, string> = {};
      for (const key of KEYS) {
        paramIds[key] = `seed-demo-de-param-${key}`;
        await prisma.parameterDefinition.upsert({
          where: {
            workspaceId_key: {
              workspaceId: workspace.id,
              key: `p_demo_${key}`,
            },
          },
          update: {},
          create: {
            id: paramIds[key],
            workspaceId: workspace.id,
            key: `p_demo_${key}`,
            kind: "MEASUREMENT",
            label:
              key === "weight"
                ? "Morning weight"
                : key[0].toUpperCase() + key.slice(1),
            dataClassification: "GENERAL_HEALTH",
            createdByMemberId: staff.id,
            updatedByMemberId: staff.id,
          },
        });
      }
      const template = await prisma.coachingTemplate.upsert({
        where: { id: "seed-demo-de-template" },
        update: {},
        create: {
          id: "seed-demo-de-template",
          workspaceId: workspace.id,
          name: "Demo daily tracking",
          description:
            "Stage 11 demo metrics (weight, sleep, water, steps, macros).",
          createdByMemberId: staff.id,
        },
      });
      const definition = {
        sections: [
          {
            sectionId: "seed-demo-de-section",
            order: 1,
            items: KEYS.map((k, i) => ({
              itemId: `seed-demo-de-item-${k}`,
              parameterId: paramIds[k],
              parameterKey: `p_demo_${k}`,
              required: false,
              order: i + 1,
            })),
          },
        ],
        parameters: Object.fromEntries(
          KEYS.map((k) => [
            paramIds[k],
            {
              key: `p_demo_${k}`,
              kind: "MEASUREMENT",
              label: k,
              helpText: null,
              unit: null,
              ratingScheme: null,
              options: [],
              validation: null,
              dataClassification: "GENERAL_HEALTH",
              revision: 1,
            },
          ]),
        ),
      };
      const version = await prisma.coachingTemplateVersion.upsert({
        where: {
          templateId_versionSeq: { templateId: template.id, versionSeq: 1 },
        },
        update: {},
        create: {
          id: "seed-demo-de-tv-1",
          workspaceId: workspace.id,
          templateId: template.id,
          versionSeq: 1,
          definition,
          publishOriginRevision: 1,
          publishedByMemberId: staff.id,
        },
      });
      const setup =
        (await prisma.clientSetup.findFirst({
          where: { workspaceId: workspace.id, clientProfileId: profile.id },
        })) ??
        (await prisma.clientSetup.create({
          data: {
            id: `seed-demo-de-setup-${cid}`,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
          },
        }));
      const pin =
        (await prisma.clientSetupPin.findFirst({
          where: { clientSetupId: setup.id, status: "ACTIVE" },
          include: { templateVersion: { select: { definition: true } } },
        })) ??
        (await prisma.clientSetupPin.create({
          data: {
            id: `seed-demo-de-pin-${cid}`,
            clientSetupId: setup.id,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            seq: 1,
            templateId: template.id,
            templateVersionId: version.id,
            assignedByMemberId: staff.id,
          },
          include: { templateVersion: { select: { definition: true } } },
        }));
      const defParams = (pin.templateVersion.definition as J)
        .parameters as Record<string, J>;
      const defSection = (pin.templateVersion.definition as J).sections?.[0];
      for (const entry of entries) {
        const date = dayUtc(entry.date);
        if (!date) continue;
        const iso = date.toISOString().slice(0, 10);
        const de = await prisma.dailyEntry.upsert({
          where: {
            workspaceId_clientProfileId_entryDate: {
              workspaceId: workspace.id,
              clientProfileId: profile.id,
              entryDate: date,
            },
          },
          update: {},
          create: {
            id: `seed-demo-de-${cid}-${iso}`,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            entryDate: date,
            createdByMemberId: clientMemberId,
          },
        });
        if (de.currentRevisionId) continue;
        const hashParams: HashParam[] = [];
        const values: J[] = [];
        for (const [k, v] of Object.entries(entry.values ?? {})) {
          const pid = paramIds[k];
          const p = defParams?.[pid];
          if (!pid || !p || v === null || v === undefined) continue;
          const num = String(v);
          hashParams.push({
            parameterId: pid,
            parameterKey: `p_demo_${k}`,
            dataClassification: "GENERAL_HEALTH",
            kind: "MEASUREMENT",
            snapshotRevision: 1,
            sectionId: defSection?.sectionId ?? "",
            itemId: `seed-demo-de-item-${k}`,
            value: { tag: "measurement", canonical: num },
          });
          values.push({
            revisionId: `seed-demo-rev-${cid}-${iso}-1`,
            workspaceId: workspace.id,
            parameterId: pid,
            kind: "MEASUREMENT",
            valueNumeric: num,
          });
        }
        if (!values.length) continue;
        const rev = await prisma.dailyEntryRevision.create({
          data: {
            id: `seed-demo-rev-${cid}-${iso}-1`,
            dailyEntryId: de.id,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            clientSetupPinId: pin.id,
            templateVersionId: pin.templateVersionId,
            seq: 1,
            canonicalHash: computeRevisionCanonicalHash({
              pinId: pin.id,
              templateVersionId: pin.templateVersionId,
              params: hashParams,
            }),
            declaredAt: new Date(`${iso}T12:00:00Z`),
            createdByMemberId: clientMemberId,
          },
        });
        for (const row of values) {
          row.revisionId = rev.id;
          await prisma.dailyEntryRevisionValue.create({ data: row });
        }
        await prisma.dailyEntry.update({
          where: { id: de.id },
          data: { currentRevisionId: rev.id },
        });
        const vals = entry.values ?? {};
        if (
          ["calories", "protein", "carbs", "fat"].some((k) => vals[k] != null)
        )
          await prisma.nutritionLog.upsert({
            where: { id: `seed-demo-nl-${cid}-${iso}` },
            update: {},
            create: {
              id: `seed-demo-nl-${cid}-${iso}`,
              dailyEntryId: de.id,
              workspaceId: workspace.id,
              clientProfileId: profile.id,
              entryDate: date,
              protein: vals.protein ?? null,
              carbohydrate: vals.carbs ?? null,
              fat: vals.fat ?? null,
              createdByMemberId: clientMemberId,
              updatedByMemberId: clientMemberId,
            },
          });
      }
    }

    // Legacy summary plan -> ClientPlan.
    if (data.plan) {
      const existingPlan = await prisma.clientPlan.findFirst({
        where: { workspaceId: workspace.id, clientProfileId: profile.id },
      });
      if (!existingPlan)
        await prisma.clientPlan.create({
          data: {
            id: `seed-demo-plan-${cid}`,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            calories: data.plan.calories ?? null,
            protein: data.plan.protein ?? null,
            sets: data.plan.sets ?? null,
            instructions: data.plan.instructions ?? "",
            nutritionVariant:
              data.plan.nutritionVariant === "Training day"
                ? "TRAINING_DAY"
                : data.plan.nutritionVariant === "Rest day"
                  ? "REST_DAY"
                  : null,
            programMode:
              data.plan.program === "Week-based" ? "WEEK_BASED" : "EVERGREEN",
            weeks: Math.max(1, data.plan.weeks ?? 1),
            updatedByMemberId: staff.id,
          },
        });
    }

    // Meal plan + IIFYM lifecycles: draft + published versions, payload
    // verbatim (canvas lifecycle shape documented in MAPPING.md).
    const mp = data.plans?.nutrition?.mealPlan;
    if (mp?.draft || mp?.active) {
      const start =
        dayUtc(mp.draft?.startDate ?? mp.active?.activatedAt) ??
        dayUtc(INDEX.generatedAt)!;
      const planId = `seed-demo-mp-${cid}`;
      await prisma.mealPlan.upsert({
        where: { id: planId },
        update: {},
        create: {
          id: planId,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          title: mp.draft?.name ?? mp.active?.content?.name ?? "Meal plan",
          timezone: TIMEZONE,
          timezoneSetByMemberId: staff.id,
          timezoneSetAt: start,
          draft: (mp.draft ?? null) as Prisma.InputJsonValue,
          draftRevision: 1,
          draftSavedByMemberId: staff.id,
          draftUpdatedAt: start,
          createdByMemberId: staff.id,
        },
      });
      let seq = 0;
      for (const item of [
        ...(mp.history ?? []).map((h: J) => h.content ?? h),
        mp.active?.content,
      ].filter(Boolean)) {
        seq += 1;
        const eff = dayUtc(item.startDate) ?? start;
        await prisma.mealPlanVersion.upsert({
          where: {
            mealPlanId_versionSeq: { mealPlanId: planId, versionSeq: seq },
          },
          update: {},
          create: {
            id: `${planId}-v${seq}`,
            workspaceId: workspace.id,
            mealPlanId: planId,
            clientProfileId: profile.id,
            versionSeq: seq,
            effectiveDate: eff,
            effectiveTimezone: TIMEZONE,
            activationInstant: eff,
            payload: item as Prisma.InputJsonValue,
            publishOriginRevision: seq,
            publishedAt: eff,
            publishedByMemberId: staff.id,
          },
        });
      }
    }
    const ii = data.plans?.nutrition?.iifym;
    if (ii?.draft || ii?.active) {
      const planId = `seed-demo-iifym-${cid}`;
      const content = ii.draft ?? ii.active?.content ?? ii.active;
      const start =
        dayUtc(content?.startDate ?? ii.active?.activatedAt) ??
        dayUtc(INDEX.generatedAt)!;
      await prisma.iifymPlan.upsert({
        where: { id: planId },
        update: {},
        create: {
          id: planId,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          title: content?.name ?? "IIFYM targets",
          timezone: TIMEZONE,
          timezoneSetByMemberId: staff.id,
          timezoneSetAt: start,
          draft: (ii.draft ?? null) as Prisma.InputJsonValue,
          draftRevision: 1,
          draftSavedByMemberId: staff.id,
          draftUpdatedAt: start,
          createdByMemberId: staff.id,
        },
      });
      let seq = 0;
      for (const item of [
        ...(ii.history ?? []).map((h: J) => h.content ?? h),
        ii.active?.content ?? ii.active,
      ].filter(Boolean)) {
        seq += 1;
        const eff = dayUtc(item.startDate) ?? start;
        await prisma.iifymPlanVersion.upsert({
          where: {
            iifymPlanId_versionSeq: { iifymPlanId: planId, versionSeq: seq },
          },
          update: {},
          create: {
            id: `${planId}-v${seq}`,
            workspaceId: workspace.id,
            iifymPlanId: planId,
            clientProfileId: profile.id,
            versionSeq: seq,
            effectiveDate: eff,
            effectiveTimezone: TIMEZONE,
            activationInstant: eff,
            payload: item as Prisma.InputJsonValue,
            publishOriginRevision: seq,
            publishedAt: eff,
            publishedByMemberId: staff.id,
          },
        });
      }
    }

    // Supplements.
    if (data.plans?.supplements?.items?.length) {
      const sp = data.plans.supplements;
      const planId = `seed-demo-supp-${cid}`;
      await prisma.supplementPlan.upsert({
        where: { id: planId },
        update: {},
        create: {
          id: planId,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          name: sp.name ?? "Supplements",
          savedByMemberId: staff.id,
          savedAt: tsUtc(sp.savedAt) ?? dayUtc(INDEX.generatedAt)!,
          createdByMemberId: staff.id,
        },
      });
      for (const [i, item] of (sp.items as J[]).entries()) {
        await prisma.supplementPlanItem.upsert({
          where: { id: `seed-demo-suppi-${item.id}` },
          update: {},
          create: {
            id: `seed-demo-suppi-${item.id}`,
            planId,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            position: i,
            productRefId: item.product?.id ?? item.id,
            brand: item.product?.brand ?? "",
            productName: item.product?.name ?? "",
            referenceQuantity: item.product?.referenceQuantity ?? null,
            quantityUnit: item.product?.quantityUnit ?? null,
            declaredAmount: item.product?.declaredAmount ?? null,
            declaredUnit: item.product?.declaredUnit ?? null,
            productUrl: item.product?.url ?? null,
            quantity: item.quantity ?? 1,
            doseUnit: item.doseUnit ?? "",
            timing: item.timing ?? "",
            status:
              item.status === "must-have"
                ? "MUST_HAVE"
                : item.status === "optional"
                  ? "OPTIONAL"
                  : "NONE",
            notes: item.notes ?? "",
          },
        });
      }
    }

    // Activity targets.
    for (const t of data.plans?.activityTargets ?? []) {
      const eff = dayUtc(t.effectiveFrom);
      if (!eff) continue;
      const target = t.target ?? {};
      const isCardio = target.sessionsPerWeek !== undefined;
      const kind =
        t.metric === "cardio" || isCardio
          ? "CARDIO"
          : target.kind === "minimum"
            ? "MINIMUM"
            : target.kind === "maximum"
              ? "MAXIMUM"
              : target.kind === "range"
                ? "RANGE"
                : "FIXED";
      // Backend vocabulary (activity_target_metric_check): steps targets
      // carry step bounds, cardioMin carries sessions/minutes.
      const metric = t.metric === "cardio" ? "cardioMin" : t.metric;
      if (metric !== "steps" && metric !== "cardioMin") continue;
      const value = target.value ?? target.min ?? null;
      await prisma.activityTarget.upsert({
        where: { id: `seed-demo-at-${t.id}` },
        update: {},
        create: {
          id: `seed-demo-at-${t.id}`,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          metric,
          kind,
          stepMin:
            kind === "CARDIO"
              ? null
              : kind === "MAXIMUM"
                ? null
                : (value ?? target.min ?? null),
          stepMax:
            kind === "CARDIO"
              ? null
              : kind === "MINIMUM"
                ? null
                : kind === "RANGE"
                  ? (target.max ?? null)
                  : kind === "FIXED"
                    ? value
                    : (target.max ?? null),
          sessionsPerWeek: target.sessionsPerWeek ?? null,
          minutesPerSession: target.minutesPerSession ?? null,
          effectiveFrom: eff,
          createdByMemberId: staff.id,
        },
      });
    }

    // Dated goals -> ParameterDefinition + ClientGoal.
    for (const g of data.plans?.goals ?? []) {
      const target = dayUtc(g.date ?? g.targetDate);
      if (!target) continue;
      const pid = `seed-demo-gp-${slug(g.fieldId ?? g.metric ?? "goal")}`;
      await prisma.parameterDefinition.upsert({
        where: {
          workspaceId_key: {
            workspaceId: workspace.id,
            key: `p_demo_goal_${slug(g.fieldId ?? g.metric ?? "goal")}`,
          },
        },
        update: {},
        create: {
          id: pid,
          workspaceId: workspace.id,
          key: `p_demo_goal_${slug(g.fieldId ?? g.metric ?? "goal")}`,
          kind: "MEASUREMENT",
          label: g.label ?? g.fieldId ?? "Goal",
          dataClassification: "GENERAL_HEALTH",
          createdByMemberId: staff.id,
          updatedByMemberId: staff.id,
        },
      });
      await prisma.clientGoal.upsert({
        where: { id: `seed-demo-goal-${g.id}` },
        update: {},
        create: {
          id: `seed-demo-goal-${g.id}`,
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          parameterId: pid,
          targetValue: g.value ?? g.targetValue ?? 0,
          unit: g.unit ?? "",
          targetDate: target,
          createdByMemberId: staff.id,
        },
      });
    }

    // Training program + published version + session/set logs.
    const td = data.plans?.training?.draft;
    let versionId: string | null = null;
    let programId: string | null = null;
    if (td) {
      programId = `seed-demo-tp-${cid}`;
      versionId = `${programId}-v1`;
      const weeks = Number(td.weeks ?? 1) || 1;
      const start = dayUtc(td.startDate) ?? dayUtc(INDEX.generatedAt)!;
      const sessions: J[] = [];
      const exercises: J[] = [];
      const sessionOrder: Record<string, string[]> = {};
      const exerciseOrder: Record<string, Record<string, string[]>> = {};
      const sessionPresence: Record<string, Record<string, boolean>> = {};
      const exercisePresence: Record<string, Record<string, boolean>> = {};
      const fieldCells: Record<string, Record<string, unknown>> = {};
      const setRows: Record<string, Record<string, J[]>> = {};
      const sessionIds = new Map<string, J>();
      const exerciseIds = new Map<string, J>();
      const weekList = Object.keys(td.overrides ?? {})
        .map(Number)
        .sort((a, b) => a - b);
      for (const w of weekList) {
        const wk = td.overrides[w] as J[];
        const presentSessions = new Set<string>();
        const presentEx = new Set<string>();
        sessionOrder[String(w)] = [];
        for (const s of wk) {
          presentSessions.add(s.id);
          sessionIds.set(s.id, s);
          sessionOrder[String(w)].push(s.id);
          exerciseOrder[s.id] ??= {};
          exerciseOrder[s.id][String(w)] = [];
          for (const e of s.exercises ?? []) {
            const exKey = `${s.id}/${e.id}`;
            presentEx.add(exKey);
            exerciseIds.set(exKey, { ...e, sessionId: s.id });
            exerciseOrder[s.id][String(w)].push(e.id);
            const sets = (e.sets ?? e.prescription?.sets ?? []).map(
              (set: J) => ({
                id: set.id,
                reps: set.reps,
                repsMax: set.repsMax,
                tempo: set.tempo ?? "",
                type: set.type ?? "Working",
                rest: set.rest ?? "",
                instructions: set.instructions ?? "",
              }),
            );
            setRows[exKey] ??= {};
            setRows[exKey][String(w)] = sets;
            fieldCells[`${exKey}/sets`] = {
              ...(fieldCells[`${exKey}/sets`] ?? {}),
              [w]: sets.length,
            };
            const rx = sets[0];
            fieldCells[`${exKey}/reps`] = {
              ...(fieldCells[`${exKey}/reps`] ?? {}),
              [w]: rx
                ? rx.repsMax && rx.repsMax !== rx.reps
                  ? `${rx.reps}–${rx.repsMax}`
                  : `${rx.reps}`
                : "",
            };
            if (e.instructions)
              fieldCells[`${exKey}/note`] = {
                ...(fieldCells[`${exKey}/note`] ?? {}),
                [w]: e.instructions,
              };
          }
        }
        for (const sid of sessionIds.keys())
          sessionPresence[sid] = {
            ...(sessionPresence[sid] ?? {}),
            [w]: presentSessions.has(sid),
          };
        for (const exKey of exerciseIds.keys())
          exercisePresence[exKey] = {
            ...(exercisePresence[exKey] ?? {}),
            [w]: presentEx.has(exKey),
          };
      }
      for (const [sid, s] of sessionIds)
        sessions.push({ id: sid, name: s.name });
      for (const e of exerciseIds.values())
        exercises.push({
          id: e.id,
          sessionId: e.sessionId,
          name: e.name,
          muscle: e.muscle,
          secondaryMuscles: e.secondaryMuscles ?? [],
          libraryItemId: e.libraryId ? `seed-demo-${e.libraryId}` : undefined,
        });
      const fieldConfig = normalizeFieldConfig({
        sets: true,
        fixedReps: true,
        repRanges: true,
        tempo: true,
        setType: true,
        restPause: true,
        instructions: true,
        progressionNotes: true,
      });
      const draft: TrainingDraft = normalizeTrainingDraft({
        programMode: td.program === "Week-based" ? "WEEK_BASED" : "EVERGREEN",
        sessions,
        exercises,
        sessionOrder,
        exerciseOrder,
        sessionPresence,
        exercisePresence,
        sessionNames: {},
        fieldCells,
        setRows,
      });
      const payload = materializeWeeks(
        draft,
        start.toISOString().slice(0, 10),
        weeks,
      );
      const existing = await prisma.trainingProgram.findFirst({
        where: {
          workspaceId: workspace.id,
          clientProfileId: profile.id,
          title: td.name,
        },
      });
      if (!existing) {
        await prisma.trainingProgram.create({
          data: {
            id: programId,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            title: td.name,
            startDate: start,
            weekCount: weeks,
            programMode: draft.programMode,
            fieldConfig: fieldConfig as unknown as Prisma.InputJsonValue,
            confirmedTimezone: TIMEZONE,
            timezoneSetByMemberId: staff.id,
            timezoneSetAt: start,
            draft: draft as unknown as Prisma.InputJsonValue,
            draftRevision: 1,
            draftSavedByMemberId: staff.id,
            draftUpdatedAt: start,
            firstPublishedAt: start,
            createdByMemberId: staff.id,
            versions: {
              create: {
                id: versionId,
                workspaceId: workspace.id,
                clientProfileId: profile.id,
                versionSeq: 1,
                effectiveDate: start,
                effectiveTimezone: TIMEZONE,
                activationInstant: start,
                payload: payload as unknown as Prisma.InputJsonValue,
                fieldConfig: fieldConfig as unknown as Prisma.InputJsonValue,
                publishOriginRevision: 1,
                publishedAt: start,
                publishedByMemberId: staff.id,
              },
            },
          },
        });
      } else {
        programId = existing.id;
        const v = await prisma.trainingProgramVersion.findFirst({
          where: { programId: existing.id },
          orderBy: { versionSeq: "asc" },
        });
        versionId = v?.id ?? null;
      }
    }
    if (versionId && programId) {
      for (const log of data.related?.trainingLogs ?? []) {
        const performed = tsUtc(log.startedAt) ?? dayUtc(log.scheduledDate);
        if (!performed) continue;
        const logId = `seed-demo-log-${log.id}`;
        const sessionLog = await prisma.trainingSessionLog.upsert({
          where: { id: logId },
          update: {},
          create: {
            id: logId,
            workspaceId: workspace.id,
            clientProfileId: profile.id,
            programId,
            pinnedVersionId: versionId,
            sessionId: log.sessionId,
            bookedWeek: log.week ?? 1,
            performedDate: new Date(
              performed.toISOString().slice(0, 10) + "T00:00:00Z",
            ),
            status: log.finishedAt ? "COMPLETED" : "IN_PROGRESS",
            startedAt: performed,
            completedAt: tsUtc(log.finishedAt),
          },
        });
        let pos = 0;
        for (const ex of log.exercises ?? []) {
          for (const set of ex.sets ?? []) {
            pos += 1;
            await prisma.trainingSetLog.upsert({
              where: { id: `${logId}-set-${pos}` },
              update: {},
              create: {
                id: `${logId}-set-${pos}`,
                sessionLogId: sessionLog.id,
                workspaceId: workspace.id,
                clientProfileId: profile.id,
                exerciseId: ex.exerciseId ?? ex.exerciseKey,
                setKey: `p:${set.setId}`,
                position: pos,
                actuals: {
                  done: set.done,
                  weight: set.weight,
                  reps: set.reps,
                  rpe: set.rpe,
                  rir: set.rir,
                  note: set.note,
                  flagged: set.flagged,
                  loadUnit: log.loadUnit,
                },
              },
            });
          }
        }
      }
    }

    // Opt-in dashboard draft: tasks + messages surfaces plus the demo
    // tracking widgets, so the client app's remote views render live data
    // without a draft edit (default profile keeps its own draft untouched).
    const demoDashboardConfig = {
      version: 1,
      name: "Demo overview",
      widgets: [
        {
          id: "seed-demo-cu03",
          kind: "CU03",
          settings: {
            title: "Tasks",
            source: "tasks",
            summary: "open",
            period: "30d",
            historyPeriod: "auto",
            target: false,
            size: "Regular",
            fields: [],
            labels: {},
            option: "open",
            unit: "",
            visibility: "client",
          },
        },
        {
          id: "seed-demo-cu06",
          kind: "CU06",
          settings: {
            title: "Messages",
            source: "feedback",
            summary: "latest",
            period: "7d",
            historyPeriod: "auto",
            target: false,
            size: "Regular",
            fields: [],
            labels: {},
            option: "default",
            unit: "",
            visibility: "client",
          },
        },
        {
          id: "seed-demo-bn01",
          kind: "BN01",
          settings: {
            title: "Bodyweight trend",
            source: "bodyweight",
            summary: "daily",
            period: "30d",
            historyPeriod: "auto",
            target: false,
            size: "Wide",
            fields: [],
            labels: {},
            option: "default",
            unit: "kg",
            visibility: "client",
          },
        },
        {
          id: "seed-demo-tl26",
          kind: "TL26",
          settings: {
            title: "Your training",
            source: "workouts",
            summary: "current",
            period: "week",
            historyPeriod: "auto",
            target: false,
            size: "Regular",
            fields: ["exercise", "sets", "reps"],
            labels: {},
            option: "current",
            unit: "",
            visibility: "client",
          },
        },
      ],
      layouts: {
        desktop: {
          "seed-demo-bn01": { x: 0, y: 0, w: 8, h: 4, size: "Wide" },
          "seed-demo-cu03": { x: 8, y: 0, w: 4, h: 4, size: "Regular" },
          "seed-demo-cu06": { x: 8, y: 4, w: 4, h: 4, size: "Regular" },
          "seed-demo-tl26": { x: 0, y: 4, w: 8, h: 4, size: "Regular" },
        },
        tablet: {
          "seed-demo-bn01": { x: 0, y: 0, w: 6, h: 3, size: "Wide" },
          "seed-demo-cu03": { x: 0, y: 3, w: 3, h: 3, size: "Regular" },
          "seed-demo-cu06": { x: 3, y: 3, w: 3, h: 3, size: "Regular" },
          "seed-demo-tl26": { x: 0, y: 6, w: 6, h: 3, size: "Regular" },
        },
        mobile: {
          "seed-demo-bn01": { x: 0, y: 0, w: 2, h: 4, size: "Wide" },
          "seed-demo-cu03": { x: 0, y: 4, w: 2, h: 3, size: "Regular" },
          "seed-demo-cu06": { x: 0, y: 7, w: 2, h: 3, size: "Regular" },
          "seed-demo-tl26": { x: 0, y: 10, w: 2, h: 3, size: "Regular" },
        },
      },
      widths: { desktop: 1040, tablet: 640, mobile: 360 },
    };
    await prisma.clientDashboardLayout.upsert({
      where: {
        workspaceId_clientProfileId: {
          workspaceId: workspace.id,
          clientProfileId: profile.id,
        },
      },
      update: { config: demoDashboardConfig as Prisma.InputJsonValue },
      create: {
        id: `seed-demo-dash-${cid}`,
        workspaceId: workspace.id,
        clientProfileId: profile.id,
        updatedByMemberId: staff.id,
        config: demoDashboardConfig as Prisma.InputJsonValue,
      },
    });
  }

  console.log(
    `[seed] demo coverage: ${clients.length} clients, ` +
      `${WORKSPACE.templates?.length ?? 0} templates, ` +
      `${WORKSPACE.exerciseLibrary?.length ?? 0} library items processed`,
  );
}
