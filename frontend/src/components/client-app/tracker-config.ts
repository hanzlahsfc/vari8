import type { TrackerConfig } from "../coach/client-tracker-preview/preview-model";
import { allParameters, type Variant } from "../coach/model";

/**
 * Pure translation from a variant to the client tracker configuration.
 * Lives in its own module so node-run checks can import it without a TSX
 * dependency on the client app views.
 */
export function trackerConfig(configuration: Variant): TrackerConfig {
  const catalog = allParameters();
  const cycleTrackingEnabled =
    configuration.cycleTrackingEnabled ??
    configuration.fields.some(
      (field) =>
        catalog.find((parameter) => parameter.id === field.id)?.group ===
        "Cycle tracking",
    );
  return {
    parameterIds: configuration.fields
      .filter((field) =>
        catalog.some(
          (parameter) =>
            parameter.id === field.id &&
            (cycleTrackingEnabled || parameter.group !== "Cycle tracking"),
        ),
      )
      .map((field) => field.id),
    cycleTrackingEnabled,
    fieldUnits: Object.fromEntries(
      configuration.fields.map((field) => [field.id, field.unit]),
    ),
    fieldOptions: Object.fromEntries(
      configuration.fields
        .filter((field) => field.options)
        .map((field) => [field.id, field.options ?? []]),
    ),
    weightUnit:
      configuration.fields.find((field) => field.id === "weight")?.unit === "lb"
        ? "lb"
        : "kg",
    lengthUnit:
      configuration.fields.find((field) => field.id === "waist")?.unit === "in"
        ? "in"
        : "cm",
    waterUnit:
      configuration.fields.find((field) => field.id === "water")?.unit ===
      "fl oz"
        ? "fl oz"
        : "L",
    ratingScale: "1-10",
    energyUnit:
      configuration.fields.find((field) => field.id === "calories")?.unit ===
      "kJ"
        ? "kJ"
        : "kcal",
    ratingScales: Object.fromEntries(
      configuration.fields
        .filter((field) => ["1–10", "1–5", "Word labels"].includes(field.unit))
        .map((field) => [
          field.id,
          field.unit === "1–5"
            ? ("1-5" as const)
            : field.unit === "Word labels"
              ? ("words" as const)
              : ("1-10" as const),
        ]),
    ),
  };
}
