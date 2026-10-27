// W2-A2 workspace exercise-library read surface.
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { listExerciseLibraryItems } from "@/lib/exercise/library";

/**
 * GET /api/v1/workspaces/:workspaceId/exercise-library
 *
 * The coach-editable exercise library for the training program editor.
 * `library.manage` scopes it to workspace staff (owner and coach);
 * clients are denied (403) by the capability matrix, and a
 * foreign-workspace caller fails the member check the same way.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

export const GET = defineApiV1Route({
  capability: "library.manage",
  params: paramsSchema,
  handler: async ({ params }) =>
    listExerciseLibraryItems({ workspaceId: params.workspaceId }),
});
