import type { IExerciseData, Muscle } from "react-body-highlighter";
import Model from "react-body-highlighter";
import type { MuscleGroup, VolumeTarget } from "./muscle-volume";
import "./muscle-heatmap.css";

const MUSCLES_BY_TARGET = {
  chest: ["chest"],
  "upper-chest": ["chest"],
  "mid-lower-chest": ["chest"],
  latissimus: ["upper-back", "trapezius"],
  "upper-back": ["upper-back", "trapezius"],
  "spinal-erectors": ["lower-back"],
  "anterior-deltoids": ["front-deltoids"],
  "lateral-deltoids": ["front-deltoids", "back-deltoids"],
  "posterior-deltoids": ["back-deltoids"],
  biceps: ["biceps"],
  forearms: ["forearm"],
  triceps: ["triceps"],
  abdominals: ["abs"],
  obliques: ["obliques"],
  "gluteus-maximus": ["gluteal"],
  "gluteus-medius": ["gluteal", "abductors"],
  quadriceps: ["quadriceps"],
  hamstrings: ["hamstring"],
  calves: ["calves", "left-soleus", "right-soleus"],
  adductors: ["adductor"],
} satisfies Record<string, readonly Muscle[]>;

const MUSCLES_BY_REGION: Record<MuscleGroup, readonly Muscle[]> = {
  chest: ["chest"],
  back: ["upper-back", "trapezius", "lower-back"],
  shoulders: ["front-deltoids", "back-deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  core: ["abs", "obliques"],
  glutes: ["gluteal"],
  quadriceps: ["quadriceps"],
  hamstrings: ["hamstring"],
  calves: ["calves"],
};

const HIGHLIGHTED_COLORS = [16, 28, 41, 53, 66, 78].map(
  (percent) =>
    `color-mix(in srgb, var(--cd-accent) ${percent}%, var(--cd-surface))`,
);
const BODY_COLOR = "color-mix(in srgb, var(--cd-muted) 14%, var(--cd-surface))";

function musclesFor(target: VolumeTarget): readonly Muscle[] {
  const byTarget: Record<string, readonly Muscle[]> = MUSCLES_BY_TARGET;
  return byTarget[target.id] ?? MUSCLES_BY_REGION[target.region];
}

/** Weighted volume per library muscle, quantised to the six accent steps. */
function buildHeatmapData(targets: readonly VolumeTarget[]): IExerciseData[] {
  const totals = new Map<Muscle, number>();
  for (const target of targets) {
    const weight = target.direct + 0.5 * target.indirect;
    for (const muscle of musclesFor(target)) {
      totals.set(muscle, (totals.get(muscle) ?? 0) + weight);
    }
  }
  const max = Math.max(0, ...totals.values());
  if (max <= 0) return [];
  return [...totals].flatMap(([muscle, total]) =>
    total > 0
      ? [
          {
            name: muscle,
            muscles: [muscle],
            frequency: Math.ceil((total / max) * 6),
          },
        ]
      : [],
  );
}

export function MuscleHeatmap({
  targets,
  unassignedSets = 0,
  className = "",
}: {
  targets: readonly VolumeTarget[];
  unassignedSets?: number;
  className?: string;
}) {
  const data = buildHeatmapData(targets);
  const description = targets
    .filter((t) => t.direct + t.indirect > 0)
    .map(
      (t) =>
        `${t.label}: ${t.direct} direct${t.indirect ? ` + ${t.indirect} indirect` : ""}`,
    )
    .join(", ");
  return (
    <div
      className={`muscle-heatmap ${className}`.trim()}
      role="img"
      aria-label={`Weekly muscle volume by target. ${description}${unassignedSets ? `, ${unassignedSets} unassigned sets` : ""}`}
    >
      <div aria-hidden="true" className="mh-figure">
        <Model
          type="anterior"
          data={data}
          bodyColor={BODY_COLOR}
          highlightedColors={HIGHLIGHTED_COLORS}
        />
        <span className="mh-caption">Front</span>
      </div>
      <div aria-hidden="true" className="mh-figure">
        <Model
          type="posterior"
          data={data}
          bodyColor={BODY_COLOR}
          highlightedColors={HIGHLIGHTED_COLORS}
        />
        <span className="mh-caption">Back</span>
      </div>
    </div>
  );
}
