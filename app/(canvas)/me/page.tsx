import type { Metadata } from "next";
import { Suspense } from "react";

import { auth } from "@/auth";
import { ClientRoute } from "@/components/canvas/client-app/client-route";
import type { CoachClient, Variant } from "@/components/canvas/coach/model";
import {
  draftWireToMealPlan,
  iifymDraftWireToPlan,
  type MealPlanDraftWire,
} from "@/components/canvas/data/nutrition";
import {
  type ActivityTargetVersionWire,
  versionsFromWire,
} from "@/components/canvas/data/activity-targets";
import { AppearanceProvider } from "@/lib/canvas/ethereal-appearance";
import { prisma } from "@/lib/db";
import { readOwnIifymPlan } from "@/lib/iifym/service";
import { readOwnMealPlan } from "@/lib/mealplan/service";

import { readClientWorkspaceAppearance } from "./appearance";
import {
  clientAssignmentFromConfig,
  clientConfigFromDefinition,
  clientEntriesFromRows,
  clientPlansPresence,
} from "./client-config";
import { requireClientAccess } from "../require-canvas-access";

export const metadata: Metadata = {
  title: "Client app - Ethereal workspace",
  description: "Your coaching plan, tracker and check-ins.",
};

const ENTRY_PARAM_PREFIX = "p_demo_";

/**
 * Card w2-c1: `/me` mounts the shared client app shell for the signed-in
 * client. Identity comes from `requireClientAccess` (workspace + profile
 * bound to the session, O9); the coach's variant is resolved from the
 * client's active setup pin, the published template version definition,
 * through the `modules` slot that mirrors the canvas Variant
 * (lib/db-types/template-slots.ts). Sections then derive from
 * `clientAppSections` exactly like the coach preview: a view the coach
 * disabled never reaches the nav.
 *
 * Card w2-c4: the plans parts read the signed-in client's own rows
 * server-side and bind them into the shared CoachClient model - tracker
 * entries and activity target versions for the roadmap week grid, the
 * published meal plan and IIFYM plan for the nutrition part. Every query
 * carries the session-bound workspaceId + clientProfileId pair (the own
 * services rebind the profile from the session user themselves), so the
 * shell is own-scope by construction and no client id travels through the
 * browser. The phase display stays off (roadmapPhases: false): no
 * client-readable phase route exists on this base, recorded as a finding
 * for the A lane.
 */
export default async function MePage() {
  const viewer = await requireClientAccess();
  const { workspace, clientProfileId } = viewer;
  const session = await auth();
  const own = { user: { id: session?.user?.id ?? "" } };

  const setup = await prisma.clientSetup.findFirst({
    where: { workspaceId: workspace.id, clientProfileId },
    select: { id: true },
  });
  const pin = setup
    ? await prisma.clientSetupPin.findFirst({
        where: { clientSetupId: setup.id, status: "ACTIVE" },
        include: { templateVersion: { select: { definition: true } } },
      })
    : null;
  const config = clientConfigFromDefinition(pin?.templateVersion.definition);

  const [
    supplementPlanCount,
    activityTargetRows,
    activityTargetCount,
    workspaceAppearance,
    entryRows,
    ownMealPlan,
    ownIifymPlan,
  ] = await Promise.all([
    prisma.supplementPlan.count({
      where: { workspaceId: workspace.id, clientProfileId },
    }),
    prisma.activityTarget.findMany({
      where: { workspaceId: workspace.id, clientProfileId },
      orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }],
    }),
    prisma.activityTarget.count({
      where: { workspaceId: workspace.id, clientProfileId, stoppedAt: null },
    }),
    readClientWorkspaceAppearance(workspace.id),
    prisma.dailyEntry.findMany({
      where: { workspaceId: workspace.id, clientProfileId },
      orderBy: { entryDate: "asc" },
      select: {
        entryDate: true,
        revisions: {
          orderBy: { seq: "desc" },
          take: 1,
          select: {
            values: {
              select: {
                valueNumeric: true,
                parameter: { select: { key: true } },
              },
            },
          },
        },
      },
    }),
    // Own-bound plan reads; a gate or consent failure degrades to "no plan"
    // instead of breaking the shell (the parts render their empty states).
    readOwnMealPlan(own, { workspaceId: workspace.id }).catch(() => null),
    readOwnIifymPlan(own, { workspaceId: workspace.id }).catch(() => null),
  ]);

  const activityTargets = versionsFromWire(
    activityTargetRows.map((row): ActivityTargetVersionWire => ({
      id: row.id,
      metric: row.metric === "steps" ? "steps" : "cardioMin",
      kind: row.kind,
      stepMin: row.stepMin,
      stepMax: row.stepMax,
      sessionsPerWeek: row.sessionsPerWeek,
      minutesPerSession:
        row.minutesPerSession === null ? null : Number(row.minutesPerSession),
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      stoppedAt: row.stoppedAt?.toISOString() ?? null,
      revision: row.revision,
    })),
  );

  const entries = clientEntriesFromRows(
    entryRows.map((row) => ({
      entryDate: row.entryDate.toISOString().slice(0, 10),
      values: Object.fromEntries(
        (row.revisions[0]?.values ?? []).flatMap((value) =>
          value.valueNumeric === null
            ? []
            : [
                [
                  value.parameter.key.startsWith(ENTRY_PARAM_PREFIX)
                    ? value.parameter.key.slice(ENTRY_PARAM_PREFIX.length)
                    : value.parameter.key,
                  Number(value.valueNumeric),
                ],
              ],
        ),
      ),
    })),
  );

  const mealPlanActive = ownMealPlan?.current
    ? {
        id: `remote-mp-v${ownMealPlan.current.versionSeq}`,
        content: draftWireToMealPlan(
          ownMealPlan.current.payload as MealPlanDraftWire,
          {
            id: "remote-mp",
            clientId: clientProfileId,
            title: "Meal plan",
          },
        ),
        activatedAt: ownMealPlan.current.effectiveDate,
      }
    : undefined;
  const iifymActive = ownIifymPlan?.current
    ? {
        id: `remote-iifym-v${ownIifymPlan.current.versionSeq}`,
        content: iifymDraftWireToPlan(
          ownIifymPlan.current.payload as Parameters<
            typeof iifymDraftWireToPlan
          >[0],
          {
            id: "remote-iifym",
            clientId: clientProfileId,
            title: "IIFYM targets",
          },
        ),
        activatedAt: ownIifymPlan.current.effectiveDate,
      }
    : undefined;

  const configuration: Variant = {
    id: pin?.templateVersionId ?? "remote",
    name: "Coaching plan",
    nutrition: config.nutrition,
    views: config.views,
    habits: config.habits,
    widgets: [],
    fields: config.fields,
    roadmap: config.roadmap,
    roadmapPhases: false,
    roadmapActivityTargets: config.roadmapActivityTargets,
    training: { fields: [], volume: true, breakdown: "", presentation: "" },
    questions: [],
    summaries: [],
  };

  const presence = clientPlansPresence({
    hasSupplementPlan: supplementPlanCount > 0,
    activityTargetCount,
  });

  const client: CoachClient = {
    id: clientProfileId,
    name: viewer.name,
    email: "",
    priorityMessages: false,
    trainingFlags: 0,
    additionalCheckInDates: [],
    clientTasks: [],
    coachTasks: [],
    internalNotes: [],
    generalNotes: [],
    checkIns: [],
    messages: [],
    media: [],
    schedules: [],
    assignment: clientAssignmentFromConfig(configuration),
    plan: {
      calories: 0,
      protein: 0,
      sets: 0,
      instructions: "",
      nutritionVariant: "Training day",
      program: "Evergreen",
      weeks: 0,
    },
    entries,
    habits: [],
    plans: {
      nutrition: {
        mealPlan: {
          history: [],
          ...(mealPlanActive ? { active: mealPlanActive } : {}),
        },
        iifym: { history: [], ...(iifymActive ? { active: iifymActive } : {}) },
      },
      training: { history: [] },
      goals: [],
      supplements: presence.supplements,
      activityTargets,
    },
  } as unknown as CoachClient;

  return (
    <AppearanceProvider workspace={workspaceAppearance}>
      <Suspense>
        <ClientRoute
          own={{ workspaceId: workspace.id, clientProfileId }}
          session={{
            clientName: viewer.name,
            clientInitials: viewer.initials,
            workspaceName: workspace.name,
            configuration,
            client,
            appearance: workspaceAppearance ?? undefined,
          }}
        />
      </Suspense>
    </AppearanceProvider>
  );
}
