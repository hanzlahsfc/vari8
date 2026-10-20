import { ALL_PARAMETERS, type Variant } from "./model";

/** Shared defaults keep the editor's overview and the athlete's tracker in agreement. */
export function trackerOverviewIds(configuration: Variant): string[] {
  const active = configuration.fields.flatMap((field) => {
    const parameter = ALL_PARAMETERS.find((item) => item.id === field.id);
    return parameter &&
      !parameter.inputType &&
      !(
        configuration.cycleTrackingEnabled === false &&
        parameter.group === "Cycle tracking"
      )
      ? [parameter]
      : [];
  });
  const sanitize = (ids: string[]) =>
    [...new Set(ids)]
      .filter((id) => active.some((parameter) => parameter.id === id))
      .slice(0, 4);
  if (configuration.trackerHighlights !== undefined)
    return sanitize(configuration.trackerHighlights);
  const summaries = sanitize(configuration.summaries);
  if (summaries.length) return summaries;
  const groups = new Set<string>();
  return active
    .filter((parameter) => {
      if (groups.has(parameter.group)) return false;
      groups.add(parameter.group);
      return true;
    })
    .slice(0, 4)
    .map((parameter) => parameter.id);
}
