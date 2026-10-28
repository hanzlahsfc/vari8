import { prisma } from "@/lib/db";
import {
  toWorkspaceAppearance,
  type WorkspaceAppearance,
} from "@/lib/canvas/workspace-appearance";

const select = {
  appearanceMode: true,
  appearanceAccent: true,
  appearanceFont: true,
  appearanceDensity: true,
  logoMediaId: true,
} as const;

/**
 * Card w2-c2: the signed-in client's own workspace appearance for the `/me`
 * server component. Called with the viewer's workspace id after
 * `requireClientAccess` resolved the membership, so the read is already
 * own-scoped. A failed or empty read returns null: the provider falls back
 * to the existing local store per field.
 */
export async function readClientWorkspaceAppearance(
  workspaceId: string,
): Promise<WorkspaceAppearance | null> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select,
    });
    return workspace ? toWorkspaceAppearance(workspace) : null;
  } catch {
    return null;
  }
}
