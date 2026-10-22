import {
  arrange,
  type Breakpoint,
  columnsFor,
  type Layout,
  minimumHeight,
} from "./grid";
import {
  catalogue,
  defaultSettings,
  type SizeName,
  safeResourceUrl,
  type WidgetInstance,
  type WidgetKind,
} from "./model";
export type DashboardDraft = {
  version: 1;
  name: string;
  widgets: WidgetInstance[];
  layouts: Partial<Record<Breakpoint, Layout>>;
  widths: Partial<Record<Breakpoint, number>>;
};
export const emptyDashboardDraft = (): DashboardDraft => ({
  version: 1,
  name: "Daily overview",
  widgets: [],
  layouts: { desktop: {} },
  widths: { desktop: 1040 },
});
export const breakpoints: Breakpoint[] = ["desktop", "tablet", "mobile"];
const sizeNames: SizeName[] = [
  "Compact",
  "Regular",
  "Wide",
  "Tall",
  "Expanded",
];
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function isValidDashboardDraft(value: unknown): value is DashboardDraft {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    typeof value.name !== "string" ||
    value.name.length > 80 ||
    !Array.isArray(value.widgets) ||
    !isObject(value.layouts) ||
    !isObject(value.widths)
  )
    return false;
  const ids = new Set<string>();
  const kindById = new Map<string, WidgetKind>();
  for (const widget of value.widgets) {
    if (
      !isObject(widget) ||
      typeof widget.id !== "string" ||
      !widget.id ||
      ids.has(widget.id) ||
      !catalogue.some((entry) => entry.id === widget.kind) ||
      !isObject(widget.settings)
    )
      return false;
    ids.add(widget.id);
    kindById.set(widget.id, widget.kind as WidgetKind);
    const settings = widget.settings;
    const contentKind = widget.kind === "CU17" || widget.kind === "CU18";
    const content = settings.content;
    if (
      typeof settings.title !== "string" ||
      typeof settings.source !== "string" ||
      typeof settings.summary !== "string" ||
      typeof settings.period !== "string" ||
      (settings.historyPeriod !== undefined &&
        !["auto", "3m", "6m", "1y"].includes(
          settings.historyPeriod as string,
        )) ||
      typeof settings.target !== "boolean" ||
      !sizeNames.includes(settings.size as SizeName) ||
      !Array.isArray(settings.fields) ||
      settings.fields.some((field) => typeof field !== "string") ||
      (settings.labels !== undefined &&
        (!isObject(settings.labels) ||
          Object.values(settings.labels).some(
            (label) => typeof label !== "string",
          ))) ||
      (contentKind && !isObject(content)) ||
      (content !== undefined &&
        (!isObject(content) ||
          typeof content.body !== "string" ||
          content.body.length > 2000 ||
          !["neutral", "accent", "important"].includes(
            content.tone as string,
          ) ||
          typeof content.actionLabel !== "string" ||
          content.actionLabel.length > 64 ||
          typeof content.actionUrl !== "string" ||
          content.actionUrl.length > 2048 ||
          (content.actionLabel.trim() !== "") !==
            (content.actionUrl.trim() !== "") ||
          (content.actionUrl.trim() !== "" &&
            !safeResourceUrl(content.actionUrl)))) ||
      typeof settings.option !== "string" ||
      typeof settings.unit !== "string"
    )
      return false;
  }
  for (const key of Object.keys(value.layouts)) {
    if (
      !breakpoints.includes(key as Breakpoint) ||
      !isObject(value.layouts[key])
    )
      return false;
    const columns = columnsFor(key as Breakpoint);
    for (const [id, rect] of Object.entries(
      value.layouts[key] as Record<string, unknown>,
    )) {
      if (
        !isObject(rect) ||
        ![rect.x, rect.y, rect.w, rect.h].every(Number.isSafeInteger) ||
        (rect.x as number) < 0 ||
        (rect.y as number) < 0 ||
        (rect.w as number) < 1 ||
        (rect.h as number) < 1 ||
        (rect.x as number) + (rect.w as number) > columns ||
        (rect.h as number) <
          minimumHeight(key as Breakpoint, kindById.get(id)) ||
        (key === "mobile" && rect.w !== columns) ||
        !sizeNames.includes(rect.size as SizeName)
      )
        return false;
    }
  }
  for (const [key, width] of Object.entries(value.widths)) {
    if (
      !breakpoints.includes(key as Breakpoint) ||
      typeof width !== "number" ||
      !Number.isFinite(width) ||
      width < 1 ||
      width > 10000
    )
      return false;
  }
  return true;
}

export function createDashboardDraft(): DashboardDraft {
  const draft = emptyDashboardDraft();
  draft.widgets = (["BN01", "BN15", "TL26", "TL11"] as WidgetKind[]).map(
    (kind) => ({ id: `seed-${kind}`, kind, settings: defaultSettings(kind) }),
  );
  draft.layouts.desktop = arrange(draft.widgets, "desktop", 1040);
  return draft;
}
