export type TrackerConfig = {
  parameterIds: string[];
  summaryParameterIds?: string[];
  weightUnit: "kg" | "lb";
  lengthUnit: "cm" | "in";
  waterUnit: "L" | "fl oz";
  ratingScale: "1-10" | "1-5" | "words";
};

export type TrackerParameter = {
  id: string;
  label: string;
  categoryId: string;
  unit: string;
  kind: "number" | "rating";
  summary: "average" | "latest" | "distribution" | "total";
  decimals: number;
  min: number;
  max: number;
};

export type TrackerCategory = {
  id: string;
  label: string;
  description: string;
};

export type TrackerEntry = {
  date: string;
  values: Record<string, number | null>;
};

// Field names and suggested summaries follow the library; tracker scope follows
// infinity/tracker-refinement/tracker-parameter-library.html and
// infinity/ui-design-handoff/functional-development-brief.html.
export const categories: TrackerCategory[] = [
  {
    id: "body",
    label: "Body measurements",
    description: "Weight and optional measurements over time.",
  },
  {
    id: "nutrition",
    label: "Nutrition",
    description: "Daily energy, protein and fluid intake.",
  },
  {
    id: "recovery",
    label: "Recovery",
    description: "Sleep duration, sleep quality and stress ratings.",
  },
  {
    id: "movement",
    label: "Movement",
    description: "Everyday steps and active minutes.",
  },
];

export const parameters: TrackerParameter[] = [
  {
    id: "weight",
    label: "Bodyweight",
    categoryId: "body",
    unit: "kg",
    kind: "number",
    summary: "average",
    decimals: 1,
    min: 30,
    max: 250,
  },
  {
    id: "waist",
    label: "Waist circumference",
    categoryId: "body",
    unit: "cm",
    kind: "number",
    summary: "latest",
    decimals: 1,
    min: 40,
    max: 180,
  },
  {
    id: "calories",
    label: "Energy intake",
    categoryId: "nutrition",
    unit: "kcal",
    kind: "number",
    summary: "average",
    decimals: 0,
    min: 500,
    max: 7000,
  },
  {
    id: "protein",
    label: "Protein intake",
    categoryId: "nutrition",
    unit: "g",
    kind: "number",
    summary: "average",
    decimals: 0,
    min: 0,
    max: 400,
  },
  {
    id: "water",
    label: "Water intake",
    categoryId: "nutrition",
    unit: "L",
    kind: "number",
    summary: "average",
    decimals: 1,
    min: 0,
    max: 10,
  },
  {
    id: "sleep",
    label: "Sleep duration",
    categoryId: "recovery",
    unit: "h",
    kind: "number",
    summary: "average",
    decimals: 1,
    min: 0,
    max: 18,
  },
  {
    id: "sleep-quality",
    label: "Sleep quality",
    categoryId: "recovery",
    unit: "rating",
    kind: "rating",
    summary: "distribution",
    decimals: 0,
    min: 1,
    max: 10,
  },
  {
    id: "stress",
    label: "Stress",
    categoryId: "recovery",
    unit: "rating",
    kind: "rating",
    summary: "distribution",
    decimals: 0,
    min: 1,
    max: 10,
  },
  {
    id: "steps",
    label: "Step count",
    categoryId: "movement",
    unit: "steps",
    kind: "number",
    summary: "average",
    decimals: 0,
    min: 0,
    max: 60000,
  },
  {
    id: "active-minutes",
    label: "Active minutes",
    categoryId: "movement",
    unit: "min",
    kind: "number",
    summary: "total",
    decimals: 0,
    min: 0,
    max: 1440,
  },
];

export const defaultConfig: TrackerConfig = {
  parameterIds: [
    "weight",
    "calories",
    "protein",
    "sleep",
    "sleep-quality",
    "steps",
  ],
  weightUnit: "kg",
  lengthUnit: "cm",
  waterUnit: "L",
  ratingScale: "1-10",
};

const dates = [
  "2026-09-14",
  "2026-09-15",
  "2026-09-16",
  "2026-09-17",
  "2026-09-18",
  "2026-09-19",
  "2026-09-20",
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
];

const demoValues: Array<Record<string, number | null>> = [
  {
    weight: 68.7,
    waist: 76.2,
    calories: 1980,
    protein: 112,
    water: 2.1,
    sleep: 7.4,
    "sleep-quality": 7,
    stress: 4,
    steps: 8240,
    "active-minutes": 46,
  },
  {
    weight: 68.2,
    waist: null,
    calories: 2140,
    protein: 126,
    water: 2.4,
    sleep: 7.8,
    "sleep-quality": 8,
    stress: 3,
    steps: 10120,
    "active-minutes": 58,
  },
  {
    weight: null,
    waist: null,
    calories: 1870,
    protein: 108,
    water: 1.9,
    sleep: 6.9,
    "sleep-quality": 6,
    stress: 5,
    steps: 7630,
    "active-minutes": 32,
  },
  {
    weight: 68.1,
    waist: null,
    calories: 2050,
    protein: 119,
    water: 2.2,
    sleep: 7.2,
    "sleep-quality": 7,
    stress: 4,
    steps: 9320,
    "active-minutes": 51,
  },
  {
    weight: null,
    waist: null,
    calories: 2260,
    protein: 131,
    water: 2.6,
    sleep: 8.1,
    "sleep-quality": 8,
    stress: 3,
    steps: 11840,
    "active-minutes": 68,
  },
  {
    weight: 68.3,
    waist: null,
    calories: null,
    protein: null,
    water: null,
    sleep: 8.3,
    "sleep-quality": 9,
    stress: 2,
    steps: 13220,
    "active-minutes": 74,
  },
  {
    weight: null,
    waist: null,
    calories: null,
    protein: null,
    water: null,
    sleep: 7.6,
    "sleep-quality": 8,
    stress: 3,
    steps: 10980,
    "active-minutes": 61,
  },
  {
    weight: 68.0,
    waist: 76.0,
    calories: 2010,
    protein: 116,
    water: 2.3,
    sleep: 7.1,
    "sleep-quality": 7,
    stress: 4,
    steps: 8840,
    "active-minutes": 48,
  },
  {
    weight: null,
    waist: null,
    calories: 1930,
    protein: 122,
    water: 2.0,
    sleep: 6.6,
    "sleep-quality": 6,
    stress: 6,
    steps: 7120,
    "active-minutes": 27,
  },
  {
    weight: 67.9,
    waist: null,
    calories: 2180,
    protein: 134,
    water: 2.5,
    sleep: 7.9,
    "sleep-quality": 8,
    stress: 3,
    steps: 11420,
    "active-minutes": 63,
  },
  {
    weight: null,
    waist: null,
    calories: 2090,
    protein: 127,
    water: 2.1,
    sleep: 7.3,
    "sleep-quality": 7,
    stress: 4,
    steps: 9720,
    "active-minutes": 54,
  },
  {
    weight: 68.0,
    waist: null,
    calories: 2360,
    protein: 139,
    water: 2.8,
    sleep: 8.0,
    "sleep-quality": 8,
    stress: 2,
    steps: 12580,
    "active-minutes": 72,
  },
  {
    weight: null,
    waist: null,
    calories: null,
    protein: null,
    water: null,
    sleep: 8.2,
    "sleep-quality": 9,
    stress: 2,
    steps: 14110,
    "active-minutes": 82,
  },
  {
    weight: 68.1,
    waist: null,
    calories: null,
    protein: null,
    water: null,
    sleep: 7.7,
    "sleep-quality": 8,
    stress: 3,
    steps: 10640,
    "active-minutes": 57,
  },
  {
    weight: 67.8,
    waist: 75.8,
    calories: 1960,
    protein: 118,
    water: 2.2,
    sleep: 7.6,
    "sleep-quality": 8,
    stress: 3,
    steps: 9360,
    "active-minutes": 52,
  },
  {
    weight: null,
    waist: null,
    calories: 2070,
    protein: 125,
    water: 2.4,
    sleep: 6.8,
    "sleep-quality": 6,
    stress: 5,
    steps: 8020,
    "active-minutes": 38,
  },
  {
    weight: 67.9,
    waist: null,
    calories: 1890,
    protein: 111,
    water: 1.8,
    sleep: 7.0,
    "sleep-quality": 7,
    stress: 5,
    steps: 7410,
    "active-minutes": 31,
  },
  {
    weight: null,
    waist: null,
    calories: 2160,
    protein: 130,
    water: 2.6,
    sleep: 7.8,
    "sleep-quality": 8,
    stress: 3,
    steps: 11260,
    "active-minutes": 65,
  },
  {
    weight: 67.7,
    waist: null,
    calories: 2020,
    protein: 121,
    water: 2.3,
    sleep: 7.3,
    "sleep-quality": 7,
    stress: 4,
    steps: 9880,
    "active-minutes": 49,
  },
  {
    weight: null,
    waist: null,
    calories: 2280,
    protein: 137,
    water: 2.7,
    sleep: 8.1,
    "sleep-quality": 9,
    stress: 2,
    steps: 12840,
    "active-minutes": 76,
  },
  {
    weight: 67.8,
    waist: null,
    calories: null,
    protein: null,
    water: null,
    sleep: 8.4,
    "sleep-quality": 9,
    stress: 2,
    steps: 14620,
    "active-minutes": 88,
  },
  {
    weight: 67.6,
    waist: 75.8,
    calories: 2050,
    protein: 124,
    water: 2.4,
    sleep: 7.7,
    "sleep-quality": 8,
    stress: 3,
    steps: 10420,
    "active-minutes": 56,
  },
  {
    weight: null,
    waist: null,
    calories: 1990,
    protein: 117,
    water: 2.2,
    sleep: 7.2,
    "sleep-quality": 7,
    stress: 4,
    steps: 9120,
    "active-minutes": 47,
  },
  {
    weight: 67.8,
    waist: null,
    calories: null,
    protein: null,
    water: null,
    sleep: 7.9,
    "sleep-quality": 8,
    stress: 3,
    steps: 12180,
    "active-minutes": 67,
  },
];

export const sampleEntries: TrackerEntry[] = dates.map((date, index) => ({
  date,
  values: demoValues[index],
}));

function convert(
  value: number,
  parameter: TrackerParameter,
  config: TrackerConfig,
) {
  if (parameter.id === "weight" && config.weightUnit === "lb")
    return value * 2.20462;
  if (parameter.id === "waist" && config.lengthUnit === "in")
    return value / 2.54;
  if (parameter.id === "water" && config.waterUnit === "fl oz")
    return value * 33.814;
  if (parameter.kind === "rating" && config.ratingScale === "1-5")
    return Math.round(1 + ((value - 1) * 4) / 9);
  return value;
}

export function displayedValue(
  parameter: TrackerParameter,
  value: number,
  config: TrackerConfig,
): number {
  return convert(value, parameter, config);
}

function unitFor(parameter: TrackerParameter, config: TrackerConfig) {
  if (parameter.id === "weight") return config.weightUnit;
  if (parameter.id === "waist") return config.lengthUnit;
  if (parameter.id === "water") return config.waterUnit;
  if (parameter.kind === "rating")
    return config.ratingScale === "words" ? "" : config.ratingScale;
  return parameter.unit;
}

function ratingWord(parameter: TrackerParameter, value: number) {
  if (parameter.id === "sleep-quality")
    return value <= 3 ? "Poor" : value <= 7 ? "Okay" : "Good";
  return value <= 3 ? "Low" : value <= 7 ? "Moderate" : "High";
}

export function formatValue(
  parameter: TrackerParameter,
  value: number,
  config: TrackerConfig,
): string {
  if (parameter.kind === "rating" && config.ratingScale === "words")
    return ratingWord(parameter, value);
  const converted = displayedValue(parameter, value, config);
  if (parameter.kind === "rating") {
    const scale = config.ratingScale === "1-5" ? 5 : 10;
    return `${converted.toLocaleString("en-GB", { maximumFractionDigits: 0 })} / ${scale}`;
  }
  const number = converted.toLocaleString("en-GB", {
    minimumFractionDigits: parameter.decimals,
    maximumFractionDigits: parameter.decimals,
  });
  const unit = unitFor(parameter, config);
  return `${number}${unit ? ` ${unit}` : ""}`;
}

function validValues(parameter: TrackerParameter, entries: TrackerEntry[]) {
  return entries
    .map(({ values }) => values[parameter.id])
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
}

function band(
  parameter: TrackerParameter,
  value: number,
  config: TrackerConfig,
) {
  const quality = parameter.id === "sleep-quality";
  const low = quality ? "Poor" : "Low";
  const middle = quality ? "Okay" : "Moderate";
  const high = quality ? "Good" : "High";
  if (config.ratingScale === "words") return ratingWord(parameter, value);
  if (config.ratingScale === "1-5") {
    const shown = Math.round(1 + ((value - 1) * 4) / 9);
    if (shown <= 2) return `${low} (1–2)`;
    if (shown === 3) return `${middle} (3)`;
    return `${high} (4–5)`;
  }
  if (value <= 3) return `${low} (1–3)`;
  if (value <= 7) return `${middle} (4–7)`;
  return `${high} (8–10)`;
}

export function summarize(
  parameter: TrackerParameter,
  entries: TrackerEntry[],
  config: TrackerConfig,
): string {
  const values = validValues(parameter, entries);
  if (values.length === 0) return "No entries";

  if (parameter.summary === "distribution") {
    const counts = new Map<string, number>();
    for (const value of values) {
      const label = band(parameter, value, config);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].map(([label, count]) => `${label} ${count}`).join(" · ");
  }

  if (parameter.summary === "latest") {
    const lastEntry = [...entries]
      .sort((first, second) => second.date.localeCompare(first.date))
      .find(
        ({ values: entryValues }) =>
          typeof entryValues[parameter.id] === "number",
      );
    const lastValue = lastEntry?.values[parameter.id];
    return typeof lastValue === "number"
      ? formatValue(parameter, lastValue, config)
      : "No entries";
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  const result = parameter.summary === "total" ? total : total / values.length;
  return formatValue(parameter, result, config);
}

// The week ledger consistently shows observed daily means, independently of
// the parameter library's optional summary preference.
export function weeklyAverage(
  parameter: TrackerParameter,
  entries: TrackerEntry[],
  config: TrackerConfig,
): number | null {
  const values = validValues(parameter, entries);
  if (!values.length) return null;
  return (
    values.reduce(
      (sum, value) => sum + displayedValue(parameter, value, config),
      0,
    ) / values.length
  );
}

// Deltas compare displayed values so their units match the visible ledger.
export function weeklyDifference(
  parameter: TrackerParameter,
  currentEntries: TrackerEntry[],
  previousEntries: TrackerEntry[],
  config: TrackerConfig,
): number | null {
  const current = weeklyAverage(parameter, currentEntries, config);
  const previous = weeklyAverage(parameter, previousEntries, config);
  return current === null || previous === null ? null : current - previous;
}

export function previousReadingDifference(
  parameter: TrackerParameter,
  date: string,
  entries: TrackerEntry[],
  config: TrackerConfig,
): number | null {
  const current = entries.find((entry) => entry.date === date)?.values[
    parameter.id
  ];
  if (typeof current !== "number" || !Number.isFinite(current)) return null;
  const previous = [...entries]
    .filter(
      (entry) =>
        entry.date < date &&
        typeof entry.values[parameter.id] === "number" &&
        Number.isFinite(entry.values[parameter.id]),
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.values[parameter.id];
  return typeof previous === "number"
    ? displayedValue(parameter, current, config) -
        displayedValue(parameter, previous, config)
    : null;
}
