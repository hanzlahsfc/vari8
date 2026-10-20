import source from "@/lib/canvas/data/mock-data.json";

export const seed = source;
export const clients = seed.clients;
export const clientProfile = seed.clientProfile;
export const dashboard = seed.dashboard;

export type Client = (typeof seed.clients)[number];
export type Meal = (typeof seed.mealPlan.variants)[number]["meals"][number];
export type VariantId = "td" | "ntd";
export type MealVariant = (typeof seed.mealPlan.variants)[number];

export const mealVariants = seed.mealPlan.variants;

export function getVariant(id: VariantId): MealVariant {
  return mealVariants.find((variant) => variant.id === id) ?? mealVariants[0];
}

export function isEmma(client: Client): boolean {
  return client.id === seed.defaultDemoClientId;
}

export function formatDate(value: string, withYear = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(date);
}

export function templateName(client: Client): string {
  const withoutBrand = client.template.replace(/^Forma\s+/i, "");
  return `${withoutBrand} template`;
}
