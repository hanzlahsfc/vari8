import "./muscle-heatmap.css";

export type MuscleVolume = {
  id: string;
  label: string;
  sets: number;
  intensity: number;
};

type Region = { id: string; side: "front" | "back"; path: string };

const REGIONS: Region[] = [
  {
    id: "shoulders",
    side: "front",
    path: "M25 32 Q31 27 37 33 L34 42 Q28 44 24 39Z",
  },
  {
    id: "shoulders",
    side: "front",
    path: "M53 33 Q59 27 65 32 L66 39 Q62 44 56 42Z",
  },
  {
    id: "shoulders",
    side: "back",
    path: "M25 32 Q31 27 37 33 L34 42 Q28 44 24 39Z",
  },
  {
    id: "shoulders",
    side: "back",
    path: "M53 33 Q59 27 65 32 L66 39 Q62 44 56 42Z",
  },
  {
    id: "chest",
    side: "front",
    path: "M36 37 Q44 33 46 37 L46 51 Q40 53 34 48Z",
  },
  {
    id: "chest",
    side: "front",
    path: "M48 37 Q50 33 58 37 L60 48 Q54 53 48 51Z",
  },
  {
    id: "biceps",
    side: "front",
    path: "M22 43 Q27 41 30 46 L28 61 Q24 63 21 59Z",
  },
  {
    id: "biceps",
    side: "front",
    path: "M60 46 Q63 41 68 43 L69 59 Q66 63 62 61Z",
  },
  {
    id: "triceps",
    side: "back",
    path: "M22 43 Q27 41 30 46 L28 61 Q24 63 21 59Z",
  },
  {
    id: "triceps",
    side: "back",
    path: "M60 46 Q63 41 68 43 L69 59 Q66 63 62 61Z",
  },
  {
    id: "back",
    side: "back",
    path: "M36 36 Q44 33 46 37 L46 63 Q40 67 34 61Z",
  },
  {
    id: "back",
    side: "back",
    path: "M48 37 Q50 33 58 36 L60 61 Q54 67 48 63Z",
  },
  { id: "core", side: "front", path: "M37 53 L47 53 L47 75 Q42 77 37 74Z" },
  { id: "core", side: "front", path: "M49 53 L59 53 L59 74 Q54 77 49 75Z" },
  {
    id: "glutes",
    side: "back",
    path: "M35 69 Q43 66 47 70 L47 82 Q41 85 35 80Z",
  },
  {
    id: "glutes",
    side: "back",
    path: "M49 70 Q53 66 61 69 L61 80 Q55 85 49 82Z",
  },
  {
    id: "quadriceps",
    side: "front",
    path: "M34 83 Q40 81 46 84 L44 111 L34 111Z",
  },
  {
    id: "quadriceps",
    side: "front",
    path: "M50 84 Q56 81 62 83 L62 111 L52 111Z",
  },
  {
    id: "hamstrings",
    side: "back",
    path: "M34 83 Q40 81 46 84 L44 111 L34 111Z",
  },
  {
    id: "hamstrings",
    side: "back",
    path: "M50 84 Q56 81 62 83 L62 111 L52 111Z",
  },
  {
    id: "calves",
    side: "front",
    path: "M35 117 L44 117 L43 142 Q39 145 35 142Z",
  },
  {
    id: "calves",
    side: "front",
    path: "M52 117 L61 117 L61 142 Q57 145 53 142Z",
  },
  {
    id: "calves",
    side: "back",
    path: "M35 117 L44 117 L43 142 Q39 145 35 142Z",
  },
  {
    id: "calves",
    side: "back",
    path: "M52 117 L61 117 L61 142 Q57 145 53 142Z",
  },
];

function Silhouette({
  offset,
  side,
}: {
  offset: number;
  side: Region["side"];
}) {
  return (
    <g transform={`translate(${offset} 0)`} className="mh-silhouette">
      <circle cx="45" cy="12" r="8" />
      <path d="M41 21 L49 21 L51 28 Q60 28 66 34 L68 41 L63 45 L65 63 L59 69 L61 80 L65 86 L63 112 L61 117 L63 144 L59 151 L52 151 L50 145 L49 120 L45 91 L41 120 L40 145 L37 151 L30 151 L27 144 L29 117 L27 112 L25 86 L29 80 L31 69 L25 63 L27 45 L22 41 L24 34 Q30 28 39 28Z" />
      <path d="M24 36 Q17 38 16 47 L18 67 L21 78 L25 76 L24 65 L27 48Z" />
      <path d="M66 36 Q73 38 74 47 L72 67 L69 78 L65 76 L66 65 L63 48Z" />
      <path d="M34 151 L41 151 L41 157 L31 158Z M49 151 L56 151 L59 158 L49 157Z" />
      <path d="M38 27 Q45 31 52 27" className="mh-neck" />
      <text x="45" y="173" textAnchor="middle">
        {side === "front" ? "FRONT" : "BACK"}
      </text>
    </g>
  );
}

export function MuscleHeatmap({
  muscles,
  unassignedSets = 0,
  className = "",
}: {
  muscles: readonly MuscleVolume[];
  unassignedSets?: number;
  className?: string;
}) {
  const byId = new Map(muscles.map((muscle) => [muscle.id, muscle]));
  const description = muscles
    .map(({ label, sets }) => `${label}: ${sets} sets`)
    .join(", ");
  return (
    <div className={`muscle-heatmap ${className}`.trim()}>
      <svg
        viewBox="0 0 180 180"
        role="img"
        aria-label={`Weekly muscle volume. ${description}${unassignedSets ? `, ${unassignedSets} unassigned sets` : ""}`}
      >
        <title>Weekly muscle volume by muscle group</title>
        <Silhouette offset={0} side="front" />
        <Silhouette offset={90} side="back" />
        {REGIONS.map((region) => {
          const muscle = byId.get(region.id);
          const offset = region.side === "front" ? 0 : 90;
          return (
            <path
              key={`${region.side}-${region.id}-${region.path}`}
              d={region.path}
              transform={`translate(${offset} 0)`}
              className="mh-muscle"
              data-active={muscle && muscle.sets > 0 ? "true" : "false"}
              style={
                {
                  "--mh-intensity": muscle?.intensity ?? 0,
                } as React.CSSProperties
              }
            >
              <title>
                {muscle?.label ?? region.id}: {muscle?.sets ?? 0} sets / week
              </title>
            </path>
          );
        })}
      </svg>
      <ul aria-label="Set count by muscle">
        {muscles.map((muscle) => (
          <li key={muscle.id} data-active={muscle.sets > 0 ? "true" : "false"}>
            <span>{muscle.label}</span>
            <b>{muscle.sets}</b>
          </li>
        ))}
      </ul>
      {unassignedSets > 0 && <p>{unassignedSets} unassigned sets</p>}
    </div>
  );
}
