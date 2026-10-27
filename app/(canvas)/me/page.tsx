import type { Metadata } from "next";
import { Suspense } from "react";

import { ClientRoute } from "@/components/canvas/client-app/client-route";
import type { CoachClient, Variant } from "@/components/canvas/coach/model";
import { prisma } from "@/lib/db";

import {
  clientConfigFromDefinition,
  clientPlansPresence,
} from "./client-config";
import { requireClientAccess } from "../require-canvas-access";

export const metadata: Metadata = {
  title: "Client app - Ethereal workspace",
  description: "Your coaching plan, tracker and check-ins.",
};

/**
 * Card w2-c1: `/me` mounts the shared client app shell for the signed-in
 * client. Identity comes from `requireClientAccess` (workspace + profile
 * bound to the session, O9); the coach's variant is resolved from the
 * client's active setup pin, the published template version definition,
 * through the `modules` slot that mirrors the canvas Variant
 * (lib/db-types/template-slots.ts). Sections then derive from
 * `clientAppSections` exactly like the coach preview: a view the coach
 * disabled never reaches the nav.
 */
export default async function MePage() {
  const viewer = await requireClientAccess();
  const { workspace, clientProfileId } = viewer;

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

  const [supplementPlanCount, activityTargetCount, workspaceAppearance] =
    await Promise.all([
      prisma.supplementPlan.count({
        where: { workspaceId: workspace.id, clientProfileId },
      }),
      prisma.activityTarget.count({
        where: { workspaceId: workspace.id, clientProfileId, stoppedAt: null },
      }),
      prisma.workspace.findUnique({
        where: { id: workspace.id },
        select: { appearanceMode: true, appearanceAccent: true },
      }),
    ]);

  const configuration: Variant = {
    id: pin?.templateVersionId ?? "remote",
    name: "Coaching plan",
    nutrition: config.nutrition,
    views: config.views,
    habits: config.habits,
    widgets: [],
    fields: [],
    roadmap: [],
    training: { fields: [], volume: true, breakdown: "", presentation: "" },
    questions: [],
    summaries: [],
  };

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
    plan: {
      calories: 0,
      protein: 0,
      sets: 0,
      instructions: "",
      nutritionVariant: "Training day",
      program: "Evergreen",
      weeks: 0,
    },
    entries: [],
    habits: [],
    plans: {
      nutrition: { mealPlan: { history: [] }, iifym: { history: [] } },
      training: { history: [] },
      goals: [],
      ...clientPlansPresence({
        hasSupplementPlan: supplementPlanCount > 0,
        activityTargetCount,
      }),
    },
  } as unknown as CoachClient;

  return (
    <Suspense>
      <ClientRoute
        own={{ workspaceId: workspace.id, clientProfileId }}
        session={{
          clientName: viewer.name,
          clientInitials: viewer.initials,
          workspaceName: workspace.name,
          configuration,
          client,
          appearance: {
            mode:
              workspaceAppearance?.appearanceMode === "LIGHT"
                ? "light"
                : "dark",
            accent: workspaceAppearance?.appearanceAccent ?? undefined,
          },
        }}
      />
    </Suspense>
  );
}
