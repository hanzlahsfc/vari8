"use client";

import { useMemo, useState } from "react";
import type { CoachClient } from "../../coach/model";
import { groupByTiming } from "../../coach/supplements/group-by-timing";
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
  const groups = groupByTiming(sups);
  if (!sups.length)
    return <div className="cm-note">No supplements prescribed.</div>;
  return (
    <>
      {!embedded && (
        <div className="cm-h1" style={{ marginBottom: 10 }}>
          Supplements
        </div>
      )}
      {groups.map((group) => (
        <div
          key={group.key || "no-timing"}
          className="cm-card cm-supp-group"
          style={{ padding: "8px 14px" }}
        >
          <div className="cm-sh" style={{ marginBottom: 4 }}>
            {group.label}
          </div>
          <div className="cm-supp-grid">
            {group.items.map((s) => {
              const dose = dosageForQuantity(s.product, s.quantity);
              const key = `${group.key}-${s.id}`;
              return (
                <div key={key} className="cm-row cm-supp-item">
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
                      onClick={() =>
                        setTicks((c) => ({ ...c, [key]: !c[key] }))
                      }
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
        </div>
      ))}
    </>
  );
}
