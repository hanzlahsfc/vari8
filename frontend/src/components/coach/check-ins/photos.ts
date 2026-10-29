// Progress-photo poses for check-in "Visual upload" questions.

import type { Question } from "../model";

export const DEFAULT_POSES = [
  "Front relaxed",
  "Side relaxed",
  "Back relaxed",
  "Front double biceps",
  "Back double biceps",
];

/**
 * Poses a visual-upload question asks for: its comma-separated `options`,
 * falling back to the standard set when no poses are configured.
 */
export function questionPoses(question: Pick<Question, "options">): string[] {
  const poses = question.options
    .split(",")
    .map((pose) => pose.trim())
    .filter(Boolean);
  return poses.length ? poses : [...DEFAULT_POSES];
}
