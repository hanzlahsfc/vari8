"use client";
import { useMemo } from "react";
import { SegmentedControl } from "../../vari8/components";
import { SearchableSelect } from "../../vari8/inputs";
import { DEFAULT_TIME_ZONE, resolvedTimeZone } from "../model";
import { useCoach } from "../store";
import { Select } from "../ui";
import {
  SettingRow,
  SettingsCard,
  usePatchPreferences,
  useSaved,
} from "./shell";

const LOCALES = [
  { value: "en-GB", label: "Day month year" },
  { value: "en-US", label: "Month day, year" },
  { value: "de-AT", label: "Day.month.year" },
] as const;
const EXAMPLE_DATE = new Date(Date.UTC(2026, 9, 13, 12));

export function RegionSettings() {
  const { state } = useCoach();
  const patch = usePatchPreferences();
  const { saved, mark } = useSaved();
  const region = state.preferences.region;
  const timeZone = resolvedTimeZone(state.preferences);
  const zones = useMemo(() => {
    const all =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : [DEFAULT_TIME_ZONE];
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const seen = new Set<string>();
    const options = [];
    if (browser) {
      options.push({
        value: browser,
        label: `${browser} (this device)`,
      });
      seen.add(browser);
    }
    for (const zone of all) {
      if (seen.has(zone)) continue;
      seen.add(zone);
      options.push({ value: zone, label: zone });
    }
    if (!seen.has(DEFAULT_TIME_ZONE))
      options.push({ value: DEFAULT_TIME_ZONE, label: DEFAULT_TIME_ZONE });
    return options;
  }, []);
  const dateOptions = LOCALES.map(({ value, label }) => ({
    value,
    label: `${new Intl.DateTimeFormat(value, {
      day: "numeric",
      month: "short",
      year: "numeric",
      // Fixed example day renders in UTC so it stays 13 Oct in every zone.
      timeZone: "UTC",
    }).format(EXAMPLE_DATE)} — ${label}`,
  }));
  return (
    <SettingsCard
      id="settings-region"
      title="Region & units"
      description="Dates, times and units across your workspace and the athlete app."
      saved={saved}
    >
      <SettingRow
        label="Time zone"
        hint="Used for dates, deadlines, working hours and reminders."
      >
        <SearchableSelect
          label="Time zone"
          value={timeZone}
          onValueChange={(zone) => {
            patch({ region: { timeZone: zone } });
            mark();
          }}
          options={zones}
        />
      </SettingRow>
      <SettingRow label="Date format" hint="Shown with a live example.">
        <Select
          label="Date format"
          value={region?.locale ?? "en-GB"}
          onChange={(locale) => {
            patch({
              region: {
                locale: locale as "en-GB" | "en-US" | "de-AT",
              },
            });
            mark();
          }}
          options={dateOptions}
        />
      </SettingRow>
      <SettingRow label="Time format">
        <SegmentedControl
          label="Time format"
          value={region?.hourCycle ?? "24"}
          onValueChange={(hourCycle) => {
            patch({ region: { hourCycle: hourCycle as "12" | "24" } });
            mark();
          }}
          options={[
            { value: "24", label: "24-hour" },
            { value: "12", label: "12-hour" },
          ]}
        />
      </SettingRow>
      <SettingRow
        label="Default body-weight unit"
        hint="Applies to new templates. Existing templates and athletes keep their units."
      >
        <SegmentedControl
          label="Default body-weight unit"
          value={region?.bodyWeightUnit ?? "kg"}
          onValueChange={(bodyWeightUnit) => {
            patch({
              region: { bodyWeightUnit: bodyWeightUnit as "kg" | "lb" },
            });
            mark();
          }}
          options={[
            { value: "kg", label: "kg" },
            { value: "lb", label: "lb" },
          ]}
        />
      </SettingRow>
      <SettingRow
        label="Default training load unit"
        hint="Applies to new templates. Existing templates and athletes keep their units."
      >
        <SegmentedControl
          label="Default training load unit"
          value={region?.loadUnit ?? "kg"}
          onValueChange={(loadUnit) => {
            patch({ region: { loadUnit: loadUnit as "kg" | "lb" } });
            mark();
          }}
          options={[
            { value: "kg", label: "kg" },
            { value: "lb", label: "lb" },
          ]}
        />
      </SettingRow>
    </SettingsCard>
  );
}
