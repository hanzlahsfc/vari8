"use client";

import { TrackingView } from "@/components/coach/client-tracker-preview/tracking-view";
import { trackerConfig } from "./demo/fixtures";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice, useDemoStore } from "./demo/store";
import { ClientScreen, DemoGate } from "./shell";

export function TrackerScreen({ demo }: { demo: ParsedDemo }) {
  const { asOf, client } = useDemoStore();
  const [tracker, setTracker] = useDemoSlice("tracker");

  return (
    <ClientScreen title="Tracker" description="Log your daily metrics.">
      <DemoGate
        demo={demo}
        empty="Your coach has not configured any metrics yet."
      >
        <TrackingView
          config={trackerConfig}
          entries={tracker.entries}
          onUpdateValue={(date, id, value) =>
            setTracker((current) => {
              const index = current.entries.findIndex(
                (entry) => entry.date === date,
              );
              const entries =
                index >= 0
                  ? current.entries.map((entry, i) =>
                      i === index
                        ? { ...entry, values: { ...entry.values, [id]: value } }
                        : entry,
                    )
                  : [...current.entries, { date, values: { [id]: value } }];
              return { ...current, entries };
            })
          }
          textValues={tracker.textValues}
          onUpdateText={(date, id, value) =>
            setTracker((current) => ({
              ...current,
              textValues: { ...current.textValues, [`${date}:${id}`]: value },
            }))
          }
          comments={tracker.comments}
          onSaveComment={(date, id, text) =>
            setTracker((current) => ({
              ...current,
              comments: { ...current.comments, [`${date}:${id}`]: text },
            }))
          }
          clientName={client.name}
          clientInitials={client.initials}
          asOf={asOf}
          persistenceHint="Demo session - nothing is saved"
        />
      </DemoGate>
    </ClientScreen>
  );
}
