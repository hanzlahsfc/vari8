// W2-A1: the workspace-wide client detail bundle the canvas hydrates once
// after its seed runs - every client's phases, coach notes and week notes,
// plus the workspace-level private note list. notes.write is staff-only, so
// clients and foreign-workspace members get a literal 403 at the gate.

import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readClientDetailBundle } from "@/lib/workspace/client-detail";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

export const GET = defineApiV1Route({
  capability: "notes.write",
  params: paramsSchema,
  handler: ({ workspace }) => readClientDetailBundle(workspace),
});
