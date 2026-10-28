import { Prisma } from "@prisma/client";

import {
  prisma as defaultPrisma,
  withSerializedRetry as sharedWithSerializedRetry,
} from "../db";
import { AccessDeniedError, authorize, type SessionLike } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { type ConsentPolicyRegistry } from "../consent";
import {
  dailyEntryConsentRegistry,
  parseDeclaredDate,
  readStaffDailyEntryDetailTx,
  type StaffDailyEntryDetail,
} from "../daily-entry/service";
import {
  checkConsentIntersection,
  CheckInInstanceError,
  type PrismaLike,
  reconcileTrackerContextScopes,
} from "./instances";
import { resolveCheckInConsentPolicy } from "../consent";
import { consentGatesEnabled } from "../runtime";
import { isCheckInsEnabled } from "./forms-gate";

/**
 * P-025-D6 — explicit DailyEntry tracker context inside authorized staff
 * Check-In review (decision #103 + the binding engineering contract).
 *
 * A separate explicit server action in ONE self-contained Serializable
 * transaction — never nested inside the Check-In detail transaction and
 * never calling the public DailyEntry service (which starts its own).
 *
 *   bounded answer-free submission pre-read (foreign/missing →
 *     not_available BEFORE any advisory)
 *   → advisory `csetup:{ws}:{clientProfileId}` (DailyEntry order)
 *   → advisory `member:{ws}:{userId}`  (never `chkin` after `member`)
 *   → workspace_member FOR UPDATE → ACTIVE
 *   → authorize(checkinsCoachReviews/read)  — deny-set denies dual-role PA
 *   → authorize(dailyTracking/read)
 *   → scope reconciliation (ws+ws→ws, ws∩asg→asg, else deny)
 *   → assigned: one shared ACTIVE ClientAssignment re-resolve + FOR UPDATE
 *   → client_profile FOR UPDATE
 *   → Check-In submission/instance coherence under the Serializable
 *     snapshot (no `chkin` advisory, no Check-In row locks — #97 makes
 *     post-submission cancellation impossible and unique(instanceId)
 *     guarantees the committed submission)
 *   → consent intersection FOR UPDATE (Check-In + DailyEntry kinds,
 *     deterministic order; either withdrawal → consent_missing)
 *   → latest committed revision of the EXACT declared entryDate — never
 *     a fallback date, never "latest entry across dates"
 *   → structural `READ daily_entry` audit last; failure rolls back values
 *
 * Deadlock safety: the advisory order is the established DailyEntry
 * order (`csetup` before `member`); `csetup`/`chkin` are disjoint
 * namespaces and `member` is always the last advisory. No
 * member↔csetup inversion can occur because `csetup` is never acquired
 * after `member`.
 */

export type CheckInTrackerContextDeps = {
  db?: PrismaLike;
  checkinRegistry?: ConsentPolicyRegistry;
  dailyRegistry?: ConsentPolicyRegistry;
  /** Test seam — injectable authorization for asymmetric-scope tests. */
  authorize?: typeof authorize;
};

export type CheckInTrackerContextInput = {
  workspaceId: string;
  clientProfileId: string;
  submissionId: string;
  entryDate: string;
};

function isRetryableSerialization(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  )
    return true;
  const meta = (error as { meta?: { code?: string } } | null)?.meta;
  return (
    typeof meta?.code === "string" &&
    (meta.code === "40001" || meta.code === "40P01")
  );
}

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  return sharedWithSerializedRetry(fn, {
    maxAttempts: 4,
    backoffBaseMs: 25,
    backoffCapMs: 250,
    isRetryable: isRetryableSerialization,
    onExhausted: () => new CheckInInstanceError("serialization_conflict"),
  });
}

async function advisoryLock(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    key,
  );
}

function boundedId(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 128)
    throw new CheckInInstanceError("invalid_input");
  return raw;
}

export async function readCheckInReviewTrackerContext(
  session: SessionLike,
  input: CheckInTrackerContextInput,
  deps: CheckInTrackerContextDeps = {},
): Promise<StaffDailyEntryDetail> {
  const db = deps.db ?? (defaultPrisma as unknown as PrismaLike);
  const checkinRegistry = deps.checkinRegistry ?? resolveCheckInConsentPolicy();
  // The shared DailyEntry synthetic registry is gated on the Check-In
  // trusted-runtime classification — production/unknown resolves
  // unconfigured and fails closed.
  const dailyRegistry =
    deps.dailyRegistry ??
    dailyEntryConsentRegistry(isCheckInsEnabled(process.env));
  const authorizeFn = deps.authorize ?? authorize;
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError(
      "unauthenticated",
      "checkinsCoachReviews",
      "read",
    );

  const workspaceId = boundedId(input.workspaceId);
  const clientProfileId = boundedId(input.clientProfileId);
  const submissionId = boundedId(input.submissionId);
  // Declared-date contract — invalid grammar/calendar/bounds is an
  // input error, never an empty state.
  let entryDate: string;
  try {
    entryDate = parseDeclaredDate(input.entryDate);
  } catch {
    throw new CheckInInstanceError("invalid_input");
  }

  // Bounded answer-free pre-read BEFORE any advisory — a foreign,
  // missing, or incoherent tuple fails non-disclosingly and acquires
  // zero advisories on the target client.
  const pre = await db.checkInSubmission.findFirst({
    where: {
      id: submissionId,
      workspaceId,
      clientProfileId,
      instance: { workspaceId, clientProfileId, cancelledAt: null },
    },
    select: { id: true },
  });
  if (!pre) throw new CheckInInstanceError("not_available");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        // 1–2. Advisories — the DailyEntry order; `member` is last.
        await advisoryLock(tx, `csetup:${workspaceId}:${clientProfileId}`);
        await advisoryLock(tx, `member:${workspaceId}:${userId}`);

        // 3. Locked actor member row — authoritative actor state.
        const memberRows = await tx.$queryRawUnsafe<
          { id: string; role: string; status: string }[]
        >(
          `SELECT id, role, status FROM "workspace_member"
           WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE`,
          workspaceId,
          userId,
        );
        const member = memberRows[0];
        if (!member || member.status !== "ACTIVE")
          throw new AccessDeniedError(
            "membership_missing_or_inactive",
            "checkinsCoachReviews",
            "read",
          );

        // 4–5. Both authorizations — strict intersection. The
        // checkinsCoachReviews deny-set denies a dual-role PLATFORM_ADMIN
        // here even when dailyTracking alone would permit via membership.
        const repo = createPrismaAuthorizationRepo(tx as never);
        const ctxCheckIn = await authorizeFn(
          session,
          {
            resource: "checkinsCoachReviews",
            action: "read",
            workspaceId,
            clientProfileId,
          },
          repo,
        );
        const ctxDaily = await authorizeFn(
          session,
          {
            resource: "dailyTracking",
            action: "read",
            workspaceId,
            clientProfileId,
          },
          repo,
        );

        // 6. Scope reconciliation — never widen; unknown → fail closed.
        const effective = reconcileTrackerContextScopes(
          ctxCheckIn.grantedScope,
          ctxDaily.grantedScope,
        );
        if (effective === "denied")
          throw new AccessDeniedError(
            "role_denied",
            "checkinsCoachReviews",
            "read",
          );
        if (ctxCheckIn.workspaceMemberId !== member.id)
          throw new AccessDeniedError(
            "membership_missing_or_inactive",
            "checkinsCoachReviews",
            "read",
          );

        // 7. Assigned scope — ONE shared ACTIVE assignment re-resolve +
        // row lock; the same row binds both resources (same member +
        // client).
        if (effective === "assigned") {
          const resolved = await tx.clientAssignment.findFirst({
            where: {
              workspaceId,
              clientProfileId,
              coachMemberId: member.id,
              status: "ACTIVE",
            },
            select: { id: true },
          });
          if (!resolved)
            throw new AccessDeniedError(
              "not_assigned",
              "checkinsCoachReviews",
              "read",
            );
          const rows = await tx.$queryRawUnsafe<{ status: string }[]>(
            `SELECT status FROM "client_assignment"
             WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
               AND coach_member_id = $4 FOR UPDATE`,
            resolved.id,
            workspaceId,
            clientProfileId,
            member.id,
          );
          if (!rows[0] || rows[0].status !== "ACTIVE")
            throw new AccessDeniedError(
              "not_assigned",
              "checkinsCoachReviews",
              "read",
            );
        }

        // 8. Locked client profile — exact id + workspace equality.
        const profileRows = await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM "client_profile"
           WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
          clientProfileId,
          workspaceId,
        );
        if (!profileRows[0])
          throw new AccessDeniedError(
            "client_outside_workspace",
            "checkinsCoachReviews",
            "read",
          );

        // 9. Check-In coherence under the Serializable snapshot — the
        // submission belongs to this workspace+client and its instance
        // is not cancelled (#97 makes post-submission cancellation
        // impossible; unique(instanceId) pins the committed submission).
        // Snapshot read only — no `chkin` advisory, no Check-In row locks.
        const coherent = await tx.checkInSubmission.findFirst({
          where: {
            id: submissionId,
            workspaceId,
            clientProfileId,
            instance: { workspaceId, clientProfileId, cancelledAt: null },
          },
          select: { id: true },
        });
        if (!coherent) throw new CheckInInstanceError("not_available");

        // 10. Consent intersection — FOR UPDATE, deterministic order.
        await checkConsentIntersection(tx, clientProfileId, [
          { resource: "checkinsCoachReviews", registry: checkinRegistry },
          { resource: "dailyTracking", registry: dailyRegistry },
        ]);

        // 11. Latest committed revision of the EXACT declared date +
        // structural READ daily_entry audit last — same transaction;
        // audit failure rolls back values.
        return readStaffDailyEntryDetailTx(tx, {
          workspaceId,
          clientProfileId,
          entryDate,
          ctx: ctxDaily,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

export type CheckInTrackerContextResult = StaffDailyEntryDetail;
