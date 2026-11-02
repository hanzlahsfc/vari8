import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import { prisma } from "@/lib/db";
import {
  PREFERENCE_KEYS,
  PreferenceError,
  listMemberPreferences,
  updateMemberPreferences,
} from "@/lib/workspace/member-preferences";

/**
 * W2-T1 settings API. Every member reads and writes their own slice:
 * profile display name (users.name) and the member-scoped preference rows
 * behind the settings surface. Capabilities are own.read / own.write, so the
 * resolved memberId is always the caller's own - no member can read or
 * write another member's preferences through this route.
 *
 * PATCH accepts a partial object: `name`, `preferences` (partial array of
 * {key, enabled}), or both. The response is always the full settings object
 * (R10: the full list after a partial update).
 */

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    preferences: z
      .array(z.object({ key: z.string(), enabled: z.boolean() }))
      .max(PREFERENCE_KEYS.length)
      .optional(),
  })
  .strict();

type SettingsBody = {
  profile: { name: string | null; email: string; role: string };
  preferences: { key: string; enabled: boolean }[];
};

async function readSettings(
  viewer: { userId: string; email: string },
  workspace: { workspaceId: string; memberId: string; role: string },
): Promise<SettingsBody> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: viewer.userId },
    select: { name: true },
  });
  return {
    profile: { name: user.name, email: viewer.email, role: workspace.role },
    preferences: await listMemberPreferences(
      workspace.workspaceId,
      workspace.memberId,
    ),
  };
}

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  handler: async ({ viewer, workspace }) => readSettings(viewer, workspace),
});

export const PATCH = defineApiV1Route({
  capability: "own.write",
  params: paramsSchema,
  handler: async ({ viewer, workspace, request }) => {
    const raw = await request.json().catch(() => null);
    const body = patchSchema.parse(raw);
    if (body.name === undefined && body.preferences === undefined)
      throw new ApiError(400, "invalid_input");
    try {
      if (body.name !== undefined)
        await prisma.user.update({
          where: { id: viewer.userId },
          data: { name: body.name },
        });
      if (body.preferences !== undefined)
        await updateMemberPreferences(
          workspace.workspaceId,
          workspace.memberId,
          body.preferences,
        );
    } catch (error) {
      if (error instanceof PreferenceError)
        throw new ApiError(400, "invalid_input");
      throw error;
    }
    return readSettings(viewer, workspace);
  },
});
