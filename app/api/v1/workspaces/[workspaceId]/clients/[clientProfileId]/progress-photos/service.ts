import {
  ApiError,
  type ApiViewer,
  type ApiWorkspaceContext,
} from "@/lib/api/v1";
import { prisma } from "@/lib/db";
import { parseClientObjectKey } from "@/lib/storage";

/**
 * Card 08 (#172) progress-photo service - one decision point for the dated
 * gallery on top of the media upload. Called only inside `defineApiV1Route`,
 * so the viewer is authenticated and `workspace.scope` already carries the
 * caller's D15 capability scope.
 *
 * Scope semantics ("own" = client role):
 *   - The client profile is resolved from the viewer's account and must
 *     equal the path's clientProfileId - a foreign id is 403, not found.
 *   - Staff (workspace scope) name the client in the path; the profile
 *     must belong to the workspace or it is 404.
 *   - Own scope additionally filters to clientVisible entries: a photo a
 *     coach marked staff-only reads as absent to the client.
 *
 * Comparison is closed to one client: both entries must resolve under the
 * path's (workspace, client) pair, so a pair spanning two clients is 404.
 * Delete soft-deletes the entry only - the media_object row and its bytes
 * stay for the retention pass.
 */

export type ProgressPhotoEntryWire = {
  id: string;
  mediaObjectId: string;
  takenOn: string;
  clientVisible: boolean;
  checkInSubmissionId: string | null;
  createdAt: string;
};

export type CreateProgressPhotoInput = {
  mediaObjectId: string;
  takenOn?: string;
  checkInSubmissionId?: string;
  clientVisible?: boolean;
};

const ENTRY_SELECT = {
  id: true,
  mediaObjectId: true,
  takenOn: true,
  clientVisible: true,
  checkInSubmissionId: true,
  createdAt: true,
} as const;

function toWire(entry: {
  id: string;
  mediaObjectId: string;
  takenOn: Date;
  clientVisible: boolean;
  checkInSubmissionId: string | null;
  createdAt: Date;
}): ProgressPhotoEntryWire {
  return {
    id: entry.id,
    mediaObjectId: entry.mediaObjectId,
    // @db.Date arrives as a UTC-midnight Date; the wire value is the
    // calendar date the client picked.
    takenOn: entry.takenOn.toISOString().slice(0, 10),
    clientVisible: entry.clientVisible,
    checkInSubmissionId: entry.checkInSubmissionId,
    createdAt: entry.createdAt.toISOString(),
  };
}

/** The client profile this call is anchored to, fail-closed. */
async function resolveClientProfile(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  clientProfileId: string,
): Promise<{ id: string }> {
  if (workspace.scope === "own") {
    const own = await prisma.clientProfile.findFirst({
      where: { workspaceId: workspace.workspaceId, userId: viewer.userId },
      select: { id: true },
    });
    if (!own || own.id !== clientProfileId)
      throw new ApiError(403, "forbidden");
    return own;
  }
  const profile = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId: workspace.workspaceId },
    select: { id: true },
  });
  if (!profile) throw new ApiError(404, "not_found");
  return profile;
}

/** A YYYY-MM-DD string that names a real calendar date, or throws 400. */
function parseTakenOn(takenOn: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(takenOn);
  const date = match ? new Date(`${takenOn}T00:00:00.000Z`) : null;
  if (!match || !date || Number.isNaN(date.getTime()))
    throw new ApiError(400, "invalid_input");
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  )
    throw new ApiError(400, "invalid_input");
  return date;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * GET collection - the client's gallery. Staff see every live entry; own
 * scope sees only clientVisible ones.
 */
export async function listProgressPhotos(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  clientProfileId: string,
) {
  const profile = await resolveClientProfile(
    viewer,
    workspace,
    clientProfileId,
  );
  const entries = await prisma.progressPhotoEntry.findMany({
    where: {
      workspaceId: workspace.workspaceId,
      clientProfileId: profile.id,
      deletedAt: null,
      ...(workspace.scope === "own" ? { clientVisible: true } : {}),
    },
    orderBy: [{ takenOn: "desc" }, { id: "asc" }],
    select: ENTRY_SELECT,
  });
  return { entries: entries.map(toWire) };
}

/**
 * GET one entry by id. Under own scope a foreign entry or a staff-only one
 * is not found - same as absent.
 */
export async function getProgressPhoto(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  clientProfileId: string,
  entryId: string,
) {
  const profile = await resolveClientProfile(
    viewer,
    workspace,
    clientProfileId,
  );
  const entry = await prisma.progressPhotoEntry.findFirst({
    where: {
      id: entryId,
      workspaceId: workspace.workspaceId,
      clientProfileId: profile.id,
      deletedAt: null,
      ...(workspace.scope === "own" ? { clientVisible: true } : {}),
    },
    select: ENTRY_SELECT,
  });
  if (!entry) throw new ApiError(404, "not_found");
  return { entry: toWire(entry) };
}

/**
 * GET compare - any two live entries of the path's client. A pair spanning
 * two clients can never both resolve, so the refusal is a plain 404.
 */
export async function compareProgressPhotos(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  clientProfileId: string,
  firstId: string,
  secondId: string,
) {
  const profile = await resolveClientProfile(
    viewer,
    workspace,
    clientProfileId,
  );
  const entries = await prisma.progressPhotoEntry.findMany({
    where: {
      id: { in: [firstId, secondId] },
      workspaceId: workspace.workspaceId,
      clientProfileId: profile.id,
      deletedAt: null,
      ...(workspace.scope === "own" ? { clientVisible: true } : {}),
    },
    select: ENTRY_SELECT,
  });
  const first = entries.find((entry) => entry.id === firstId);
  const second = entries.find((entry) => entry.id === secondId);
  if (!first || !second) throw new ApiError(404, "not_found");
  return { first: toWire(first), second: toWire(second) };
}

/**
 * POST - attach a live image media_object as a dated gallery photo. The
 * object must sit under the path client's storage prefix, be an IMAGE,
 * and not already back another entry. takenOn defaults to today; a client
 * cannot mark their own photo staff-only.
 */
export async function createProgressPhoto(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  clientProfileId: string,
  input: CreateProgressPhotoInput,
) {
  const profile = await resolveClientProfile(
    viewer,
    workspace,
    clientProfileId,
  );

  const media = await prisma.mediaObject.findFirst({
    where: {
      id: input.mediaObjectId,
      workspaceId: workspace.workspaceId,
      deletedAt: null,
    },
    select: { id: true, kind: true, storageKey: true },
  });
  if (!media) throw new ApiError(404, "not_found");
  if (media.kind !== "IMAGE") throw new ApiError(400, "invalid_input");

  const key = parseClientObjectKey(media.storageKey);
  if (
    key.workspaceId !== workspace.workspaceId ||
    key.clientProfileId !== profile.id
  )
    throw new ApiError(400, "invalid_input");

  const takenOn =
    input.takenOn === undefined ? todayUtc() : parseTakenOn(input.takenOn);

  if (input.checkInSubmissionId !== undefined) {
    const submission = await prisma.checkInSubmission.findFirst({
      where: {
        id: input.checkInSubmissionId,
        workspaceId: workspace.workspaceId,
        clientProfileId: profile.id,
      },
      select: { id: true },
    });
    if (!submission) throw new ApiError(400, "invalid_input");
  }

  const existing = await prisma.progressPhotoEntry.findFirst({
    where: { mediaObjectId: media.id },
    select: { id: true },
  });
  if (existing) throw new ApiError(400, "invalid_input");

  const entry = await prisma.progressPhotoEntry.create({
    data: {
      workspaceId: workspace.workspaceId,
      clientProfileId: profile.id,
      mediaObjectId: media.id,
      takenOn,
      checkInSubmissionId: input.checkInSubmissionId ?? null,
      clientVisible:
        workspace.scope === "own" ? true : (input.clientVisible ?? true),
    },
    select: ENTRY_SELECT,
  });
  return { entry: toWire(entry) };
}

/**
 * DELETE - soft delete. The entry leaves every gallery; the media_object
 * row is untouched so the retention pass still owns the bytes.
 */
export async function deleteProgressPhoto(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  clientProfileId: string,
  entryId: string,
) {
  const profile = await resolveClientProfile(
    viewer,
    workspace,
    clientProfileId,
  );
  const entry = await prisma.progressPhotoEntry.findFirst({
    where: {
      id: entryId,
      workspaceId: workspace.workspaceId,
      clientProfileId: profile.id,
      deletedAt: null,
      ...(workspace.scope === "own" ? { clientVisible: true } : {}),
    },
    select: { id: true },
  });
  if (!entry) throw new ApiError(404, "not_found");
  await prisma.progressPhotoEntry.update({
    where: { id: entry.id },
    data: { deletedAt: new Date() },
  });
  return { deleted: true, id: entry.id };
}
