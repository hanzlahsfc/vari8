import { ApiError } from "@/lib/api/v1";
import { toWorkspaceAppearance } from "@/lib/canvas/workspace-appearance";
import { prisma } from "@/lib/db";
import { getObjectStorage, presignTtlSeconds } from "@/lib/storage";

/**
 * GET /api/v1/workspaces/:workspaceId/appearance (card w2-c2): the caller's
 * own workspace appearance for client surfaces. The route wrapper already
 * resolved an ACTIVE membership in an ACTIVE workspace, so the read is
 * own-scoped by construction; a foreign workspace id never reaches here
 * (403 upstream). Returns the wire DTO with only valid fields set.
 *
 * `logoUrl` is minted server-side from the workspace's own `logoMediaId`
 * through the shared object-storage presign path (the same mechanism the
 * media download route uses). The media GET enforces a client-own profile
 * prefix, so a client-side mint can never resolve a workspace logo; the
 * authorization here is the workspace row the caller already owns access
 * to. Only an IMAGE object in this same workspace is ever minted, and any
 * resolution failure degrades to null so the surfaces fall back to text
 * branding.
 */
export async function readWorkspaceAppearance(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      appearanceMode: true,
      appearanceAccent: true,
      appearanceFont: true,
      appearanceDensity: true,
      logoMediaId: true,
    },
  });
  if (!workspace) throw new ApiError(404, "not_found");
  return {
    appearance: toWorkspaceAppearance(workspace),
    logoUrl: await mintWorkspaceLogoUrl(workspaceId, workspace.logoMediaId),
  };
}

async function mintWorkspaceLogoUrl(
  workspaceId: string,
  logoMediaId: string | null,
): Promise<string | null> {
  if (!logoMediaId) return null;
  try {
    const media = await prisma.mediaObject.findFirst({
      where: { id: logoMediaId, workspaceId, kind: "IMAGE", deletedAt: null },
      select: { storageKey: true },
    });
    if (!media) return null;
    const backend = await getObjectStorage();
    const download = await backend.presignGet(
      media.storageKey,
      presignTtlSeconds(),
    );
    return download.url;
  } catch {
    return null;
  }
}
