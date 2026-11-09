// Progress-photo poses for check-in "Progress photos" (Visual upload) questions.

import type { CoachClient, Question, Submission } from "../model";

/**
 * Legacy standard set. Kept for migrating old demo data only; new templates
 * never write preset poses and the client app does not fall back to them.
 */
export const DEFAULT_POSES = [
  "Front relaxed",
  "Side relaxed",
  "Back relaxed",
  "Front double biceps",
  "Back double biceps",
];

/**
 * Poses a photo question asks for. Poses are client-owned: the value lives in
 * the client assignment snapshot's question options, so an empty list is a
 * valid "generic multi-upload" state.
 */
export function questionPoses(question: Pick<Question, "options">): string[] {
  const seen = new Set<string>();
  const poses: string[] = [];
  for (const pose of question.options.split(",")) {
    const value = pose.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    poses.push(value);
  }
  return poses;
}

/** Every pose configured on the client's photo questions, in question order. */
export function clientPoses(client: CoachClient): string[] {
  const questions =
    client.assignment?.snapshot.variants.find(
      (variant) => variant.id === client.assignment?.variantId,
    )?.questions ?? [];
  const seen = new Set<string>();
  const poses: string[] = [];
  for (const question of questions) {
    if (question.type !== "Visual upload") continue;
    for (const pose of questionPoses(question)) {
      if (seen.has(pose)) continue;
      seen.add(pose);
      poses.push(pose);
    }
  }
  return poses;
}

/** Photos matching one pose; falls back to every photo when no pose is set. */
export function photosForPose(
  submission: Pick<Submission, "photos">,
  pose: string,
): NonNullable<Submission["photos"]> {
  const photos = submission.photos ?? [];
  if (!pose) return photos;
  return photos.filter((photo) => photo.pose === pose);
}

/**
 * Pose options for the overview comparison: the client's ordered poses first,
 * then an "Other" bucket for photos whose pose was removed from their list.
 */
export function comparisonPoses(
  client: CoachClient,
  submissions: Pick<Submission, "photos">[],
): { poses: string[]; other: boolean } {
  const configured = clientPoses(client);
  const known = new Set(configured);
  const fallback = [
    ...new Set(
      submissions.flatMap((submission) =>
        (submission.photos ?? []).map((photo) => photo.pose),
      ),
    ),
  ];
  // Unassigned/legacy clients with no configured poses keep their shot list.
  const ordered = configured.length ? configured : fallback;
  const other =
    configured.length > 0 && fallback.some((pose) => !known.has(pose));
  return { poses: other ? [...ordered, "Other"] : ordered, other };
}

/** Minimal migration: add the question id when a photo carries one. */
export function withPhotoQuestion(
  photos: NonNullable<Submission["photos"]>,
  question: string | undefined,
): NonNullable<Submission["photos"]> {
  return photos.map((photo) =>
    question && !photo.question ? { ...photo, question } : photo,
  );
}
