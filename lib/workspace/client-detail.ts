// W2-A1: the coach-side client detail domain - profile core, phase plan,
// coach notes (internal PRIVATE / general GENERAL, pin-to-overview flag) and
// per-week timeline notes - plus the workspace-level private note list.
// Authorization is resolved by the route helper (capability notes.write is
// staff-only); this service trusts the typed workspace context and scopes
// every query by workspaceId anyway so no row can cross a tenant boundary.
//
// Write shape: each PUT carries the canvas's full owned collection and the
// service reconciles it (update in place, create new ids, remove missing
// ids) inside one transaction. That keeps the idempotency key the whole
// payload, matching how the canvas edits these collections.

import type { PrismaClient } from "@prisma/client";

import { ApiError, type ApiWorkspaceContext } from "@/lib/api/v1";
import { prisma } from "@/lib/db";
import { RESTORE_WINDOW_MS } from "../notes/service";
import type { PrismaLike } from "./access";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type DetailNote = { id: string; text: string; pinned?: boolean };
export type DetailPhase = {
  id: string;
  name: string;
  startDate: string;
  durationWeeks: number;
};

export type ClientDetail = {
  clientProfileId: string;
  name: string;
  label: string | null;
  email: string | null;
  coachingSince: string | null;
  heightCm: number | null;
  phases: DetailPhase[];
  internalNotes: DetailNote[];
  generalNotes: DetailNote[];
  weekNotes: Record<string, string>;
};

export type ClientDetailBundle = {
  clients: ClientDetail[];
  workspaceNotes: DetailNote[];
};

export type ClientDetailWrite = {
  phases: DetailPhase[];
  internalNotes: DetailNote[];
  generalNotes: DetailNote[];
  weekNotes: Record<string, string>;
};

const dateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

const asDay = (value: string): Date | null => {
  if (!DAY.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

async function requireClient(
  workspaceId: string,
  clientProfileId: string,
  client: PrismaLike,
) {
  const profile = await client.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId },
    select: {
      id: true,
      name: true,
      label: true,
      coachingSince: true,
      heightCm: true,
      user: { select: { email: true } },
    },
  });
  if (!profile) throw new ApiError(404, "not_found");
  return profile;
}

function toDetail(
  profile: {
    id: string;
    name: string;
    label: string | null;
    coachingSince: Date | null;
    heightCm: unknown;
    user: { email: string } | null;
  },
  phases: {
    id: string;
    name: string;
    startDate: Date;
    durationWeeks: number;
  }[],
  notes: { id: string; visibility: string; body: string; pinned: boolean }[],
  weekNotes: { weekStart: Date; body: string }[],
): ClientDetail {
  return {
    clientProfileId: profile.id,
    name: profile.name,
    label: profile.label,
    email: profile.user?.email ?? null,
    coachingSince: dateOnly(profile.coachingSince),
    heightCm:
      profile.heightCm === null || profile.heightCm === undefined
        ? null
        : Number(profile.heightCm),
    phases: phases.map((p) => ({
      id: p.id,
      name: p.name,
      startDate: p.startDate.toISOString().slice(0, 10),
      durationWeeks: p.durationWeeks,
    })),
    internalNotes: notes
      .filter((n) => n.visibility === "PRIVATE")
      .map((n) => ({
        id: n.id,
        text: n.body,
        ...(n.pinned ? { pinned: true } : {}),
      })),
    generalNotes: notes
      .filter((n) => n.visibility === "GENERAL")
      .map((n) => ({ id: n.id, text: n.body })),
    weekNotes: Object.fromEntries(
      weekNotes.map((n) => [n.weekStart.toISOString().slice(0, 10), n.body]),
    ),
  };
}

/** The coach detail read for one client: profile core + owned collections. */
export async function readClientDetail(
  workspace: ApiWorkspaceContext,
  clientProfileId: string,
  client: PrismaLike = prisma,
): Promise<ClientDetail> {
  const workspaceId = workspace.workspaceId;
  const profile = await requireClient(workspaceId, clientProfileId, client);
  const [phases, notes, weekNotes] = await Promise.all([
    client.clientPhase.findMany({
      where: { workspaceId, clientProfileId },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    }),
    client.coachNote.findMany({
      where: { workspaceId, clientProfileId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    client.clientWeekNote.findMany({
      where: { workspaceId, clientProfileId },
      orderBy: [{ weekStart: "asc" }],
    }),
  ]);
  return toDetail(profile, phases, notes, weekNotes);
}

/** The workspace-wide bundle the canvas hydrates once after the seed runs. */
export async function readClientDetailBundle(
  workspace: ApiWorkspaceContext,
  client: PrismaLike = prisma,
): Promise<ClientDetailBundle> {
  const workspaceId = workspace.workspaceId;
  const profiles = await client.clientProfile.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      label: true,
      coachingSince: true,
      heightCm: true,
      user: { select: { email: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const ids = profiles.map((p) => p.id);
  const [phases, notes, weekNotes, workspaceNotes] = await Promise.all([
    client.clientPhase.findMany({
      where: { workspaceId, clientProfileId: { in: ids } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    }),
    client.coachNote.findMany({
      where: {
        workspaceId,
        clientProfileId: { in: ids },
        deletedAt: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    client.clientWeekNote.findMany({
      where: { workspaceId, clientProfileId: { in: ids } },
      orderBy: [{ weekStart: "asc" }],
    }),
    client.coachNote.findMany({
      where: {
        workspaceId,
        clientProfileId: null,
        visibility: "PRIVATE",
        deletedAt: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const byClient = <T extends { clientProfileId: string | null }>(
    rows: T[],
  ) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      if (row.clientProfileId === null) continue;
      const list = map.get(row.clientProfileId) ?? [];
      list.push(row);
      map.set(row.clientProfileId, list);
    }
    return map;
  };
  const phaseBy = byClient(phases);
  const noteBy = byClient(notes);
  const weekBy = byClient(weekNotes);
  return {
    clients: profiles.map((profile) =>
      toDetail(
        profile,
        phaseBy.get(profile.id) ?? [],
        noteBy.get(profile.id) ?? [],
        weekBy.get(profile.id) ?? [],
      ),
    ),
    workspaceNotes: workspaceNotes.map((n) => ({
      id: n.id,
      text: n.body,
      ...(n.pinned ? { pinned: true } : {}),
    })),
  };
}

async function reconcileNotes(
  tx: PrismaLike,
  workspaceId: string,
  clientProfileId: string | null,
  visibility: "PRIVATE" | "GENERAL",
  memberId: string,
  items: DetailNote[],
): Promise<void> {
  const existing = await tx.coachNote.findMany({
    where: { workspaceId, clientProfileId, visibility },
    select: { id: true, deletedAt: true },
  });
  const byId = new Map(existing.map((row) => [row.id, row]));
  const keep = new Set<string>();
  for (const item of items) {
    keep.add(item.id);
    const pinned = visibility === "PRIVATE" && item.pinned === true;
    const row = byId.get(item.id);
    if (row) {
      await tx.coachNote.update({
        where: {
          id_workspaceId: { id: row.id, workspaceId },
        },
        data: {
          body: item.text,
          pinned,
          deletedAt: null,
          restoreUntil: null,
          revision: { increment: 1 },
        },
      });
    } else {
      try {
        await tx.coachNote.create({
          data: {
            id: item.id,
            workspaceId,
            clientProfileId,
            visibility,
            body: item.text,
            pinned,
            authorMemberId: memberId,
          },
        });
      } catch (error) {
        // A supplied id that belongs to another scope collides on the PK.
        throw new ApiError(409, "conflict", String(error));
      }
    }
  }
  const removedAt = new Date();
  await tx.coachNote.updateMany({
    where: {
      workspaceId,
      clientProfileId,
      visibility,
      id: { notIn: [...keep] },
      deletedAt: null,
    },
    data: {
      deletedAt: removedAt,
      restoreUntil: new Date(removedAt.getTime() + RESTORE_WINDOW_MS),
    },
  });
}

/** Full replace of the coach-owned detail collections for one client. */
export async function writeClientDetail(
  workspace: ApiWorkspaceContext,
  clientProfileId: string,
  input: ClientDetailWrite,
  db: PrismaClient = prisma,
): Promise<ClientDetail> {
  const workspaceId = workspace.workspaceId;
  await db.$transaction(async (tx) => {
    await requireClient(workspaceId, clientProfileId, tx);
    const memberId = workspace.memberId;

    const existingPhases = await tx.clientPhase.findMany({
      where: { workspaceId, clientProfileId },
      select: { id: true },
    });
    const phaseIds = new Set(existingPhases.map((row) => row.id));
    const keepPhases = new Set<string>();
    for (const phase of input.phases) {
      const start = asDay(phase.startDate);
      if (!start) throw new ApiError(400, "invalid_input");
      keepPhases.add(phase.id);
      if (phaseIds.has(phase.id)) {
        await tx.clientPhase.update({
          where: { id_workspaceId: { id: phase.id, workspaceId } },
          data: {
            name: phase.name,
            startDate: start,
            durationWeeks: phase.durationWeeks,
          },
        });
      } else {
        await tx.clientPhase.create({
          data: {
            id: phase.id,
            workspaceId,
            clientProfileId,
            name: phase.name,
            startDate: start,
            durationWeeks: phase.durationWeeks,
          },
        });
      }
    }
    await tx.clientPhase.deleteMany({
      where: {
        workspaceId,
        clientProfileId,
        id: { notIn: [...keepPhases] },
      },
    });

    await reconcileNotes(
      tx,
      workspaceId,
      clientProfileId,
      "PRIVATE",
      memberId,
      input.internalNotes,
    );
    await reconcileNotes(
      tx,
      workspaceId,
      clientProfileId,
      "GENERAL",
      memberId,
      input.generalNotes,
    );

    const existingWeeks = await tx.clientWeekNote.findMany({
      where: { workspaceId, clientProfileId },
      select: { weekStart: true },
    });
    const keepWeeks = new Set<string>();
    for (const [week, body] of Object.entries(input.weekNotes)) {
      const weekStart = asDay(week);
      if (!weekStart || !body.trim()) continue;
      keepWeeks.add(week);
      await tx.clientWeekNote.upsert({
        where: {
          clientProfileId_weekStart: { clientProfileId, weekStart },
        },
        update: { body },
        create: {
          workspaceId,
          clientProfileId,
          weekStart,
          body,
          authorMemberId: memberId,
        },
      });
    }
    const drop = existingWeeks
      .map((row) => row.weekStart.toISOString().slice(0, 10))
      .filter((week) => !keepWeeks.has(week))
      .map((week) => new Date(`${week}T00:00:00.000Z`));
    if (drop.length) {
      await tx.clientWeekNote.deleteMany({
        where: { clientProfileId, weekStart: { in: drop } },
      });
    }
  });
  return readClientDetail(workspace, clientProfileId, db);
}

/** The workspace-level private note list (coach/notes.tsx). */
export async function listWorkspaceCoachNotes(
  workspace: ApiWorkspaceContext,
  client: PrismaLike = prisma,
): Promise<{ notes: DetailNote[] }> {
  const rows = await client.coachNote.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      clientProfileId: null,
      visibility: "PRIVATE",
      deletedAt: null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return { notes: rows.map((n) => ({ id: n.id, text: n.body })) };
}

/** Full replace of the workspace-level private note list. */
export async function writeWorkspaceCoachNotes(
  workspace: ApiWorkspaceContext,
  notes: DetailNote[],
  db: PrismaClient = prisma,
): Promise<{ notes: DetailNote[] }> {
  await db.$transaction(async (tx) => {
    await reconcileNotes(
      tx,
      workspace.workspaceId,
      null,
      "PRIVATE",
      workspace.memberId,
      notes,
    );
  });
  return listWorkspaceCoachNotes(workspace, db);
}
