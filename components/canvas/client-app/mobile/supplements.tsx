"use client";

import { useMemo, useState } from "react";
import type { CoachClient } from "../../coach/model";
import { dosageForQuantity } from "../../coach/supplements/model";
import { supplementsToday } from "./data";

export function MobileSupplements({
  client,
  readOnly,
  embedded,
}: {
  client: CoachClient;
  readOnly?: boolean;
  embedded?: boolean;
}) {
  const sups = useMemo(() => supplementsToday(client), [client]);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const groups = new Map<string, typeof sups>();
  for (const s of sups) {
    const key = s.timing || "Any time";
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  if (!sups.length)
    return <div className="cm-note">No supplements prescribed.</div>;
  return (
    <>
      {!embedded && (
        <div className="cm-h1" style={{ marginBottom: 10 }}>
          Supplements
        </div>
      )}
      {[...groups.entries()].map(([timing, items]) => (
        <div key={timing} className="cm-card" style={{ padding: "8px 14px" }}>
          <div className="cm-sh" style={{ marginBottom: 4 }}>
            {timing}
          </div>
          {items.map((s) => {
            const dose = dosageForQuantity(s.product, s.quantity);
            const key = `${timing}-${s.id}`;
            return (
              <div
                key={key}
                className="cm-row"
                style={{
                  justifyContent: "space-between",
                  padding: "7px 0",
                  borderTop: "1px solid var(--cd-line)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5 }}>{s.product.name}</div>
                  <div className="cm-mut" style={{ fontSize: 11.5 }}>
                    {dose ? `${dose.amount} ${dose.unit}` : ""}
                    {s.notes ? ` · ${s.notes}` : ""}
                  </div>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    className={`cm-tick${ticks[key] ? " on" : ""}`}
                    onClick={() => setTicks((c) => ({ ...c, [key]: !c[key] }))}
                    aria-label={`${s.product.name} taken`}
                  >
                    <svg
                      aria-hidden="true"
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
