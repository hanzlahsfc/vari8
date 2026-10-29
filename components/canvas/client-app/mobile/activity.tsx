"use client";

import { useMemo } from "react";
import type { CoachClient } from "../../coach/model";
import { useLocalToday } from "../../coach/targets/use-local-today";
import { cardioWeek, stepsLabel, stepsTarget } from "./data";

export function MobileActivity({
  client,
  embedded,
}: {
  client: CoachClient;
  embedded?: boolean;
}) {
  const today = useLocalToday();
  const steps = useMemo(() => stepsTarget(client, today), [client, today]);
  const cardio = useMemo(() => cardioWeek(client, today), [client, today]);
  if (!steps && !cardio)
    return <div className="cm-note">No activity targets.</div>;
  const pips = cardio
    ? Array.from({ length: cardio.sessionsTarget }, (_, i) => i)
    : [];
  return (
    <>
      {!embedded && (
        <div className="cm-h1" style={{ marginBottom: 10 }}>
          Activity
        </div>
      )}
      {steps && (
        <div className="cm-card">
          <div className="cm-row" style={{ gap: 10 }}>
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--cd-accent)"
              strokeWidth="1.75"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Steps</div>
              <div className="cm-mut" style={{ fontSize: 12 }}>
                Daily target
              </div>
            </div>
            <span style={{ fontSize: 17, fontWeight: 600 }}>
              {stepsLabel(steps)}
            </span>
          </div>
        </div>
      )}
      {cardio && (
        <div className="cm-card">
          <div
            className="cm-row"
            style={{ justifyContent: "space-between", marginBottom: 6 }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Cardio</div>
              <div className="cm-mut" style={{ fontSize: 12 }}>
                {cardio.sessionsTarget} × {cardio.minutes} min per week
              </div>
            </div>
            <span style={{ fontSize: 17, fontWeight: 600 }}>
              {cardio.done} of {cardio.sessionsTarget}
            </span>
          </div>
          <div className="cm-row" style={{ gap: 4 }}>
            {pips.map((pip) => (
              <i
                key={`pip-${pip}`}
                style={{
                  width: 14,
                  height: 5,
                  borderRadius: 99,
                  background:
                    pip < cardio.done
                      ? "var(--cd-accent)"
                      : "color-mix(in srgb, var(--cd-text) 18%, transparent)",
                  display: "block",
                }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
