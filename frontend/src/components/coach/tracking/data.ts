// Persisted client tracking: `client.tracking` holds the tracker log so
// coach-added data survives reloads. Clients seeded before the field existed
// still expose their legacy `client.entries` summary through the same shape.

import type { TrackerEntry } from "../../ethereal/client-tracker/model";
import type { CoachClient } from "../model";

export function clientTracking(client: CoachClient): TrackerEntry[] {
  if (client.tracking) return client.tracking.entries;
  return client.entries.map((entry) => ({
    date: entry.date,
    values: {
      weight: entry.weight,
      sleep: entry.sleep,
      steps: entry.steps,
      calories: entry.calories,
      waist: null,
      protein: null,
      stress: null,
      energy: null,
      rhr: null,
      fbg: null,
    },
  }));
}

export function clientTrackingText(
  client: CoachClient,
): Record<string, string> {
  return client.tracking?.text ?? {};
}

/** Return a copy of the client with one tracker value written on `date`. */
export function withTrackingValue(
  client: CoachClient,
  date: string,
  fieldId: string,
  value: number | null,
): CoachClient {
  const tracking = client.tracking ?? {
    entries: clientTracking(client),
    text: {},
  };
  const entries = [...tracking.entries];
  const index = entries.findIndex((entry) => entry.date === date);
  if (index < 0) {
    entries.push({ date, values: { [fieldId]: value } });
    entries.sort((a, b) => a.date.localeCompare(b.date));
  } else {
    entries[index] = {
      ...entries[index],
      values: { ...entries[index].values, [fieldId]: value },
    };
  }
  return { ...client, tracking: { ...tracking, entries } };
}

/** Return a copy of the client with one tracker text value written. */
export function withTrackingText(
  client: CoachClient,
  date: string,
  fieldId: string,
  value: string,
): CoachClient {
  const tracking = client.tracking ?? {
    entries: clientTracking(client),
    text: {},
  };
  const text = { ...tracking.text, [`${date}:${fieldId}`]: value };
  if (!value.trim()) delete text[`${date}:${fieldId}`];
  return { ...client, tracking: { ...tracking, text } };
}
