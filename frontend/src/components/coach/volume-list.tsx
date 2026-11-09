import { useState } from "react";
import type { VolumeTarget } from "./muscle-volume";

/** Flat target rows: solid bar = primary (direct) sets, light extension = additional (indirect). */
export function VolumeList({
  targets,
  unassignedSets = 0,
}: {
  targets: readonly VolumeTarget[];
  unassignedSets?: number;
}) {
  const [showUntrained, setShowUntrained] = useState(false);
  const trained = targets.filter((t) => t.direct + t.indirect > 0);
  const visible = showUntrained ? targets : trained;
  const maxVol = Math.max(0, ...targets.map((t) => t.direct + t.indirect));
  return (
    <div className="tr-volume-list">
      {trained.length ? (
        <p className="tr-volume-caption">
          Solid = primary · light = additional
        </p>
      ) : (
        <p className="tr-volume-caption">
          No prescribed sets in this period yet.
        </p>
      )}
      {visible.map((t) => (
        <div className="tr-volume-row" key={t.id}>
          <span
            title={`${t.direct} direct (primary)${t.indirect ? ` + ${t.indirect} indirect (additional)` : ""}`}
          >
            {t.label}
          </span>
          <span className="tr-volume-bar" aria-hidden="true">
            <i
              className="tr-volume-bar-indirect"
              style={{
                transform: `scaleX(${maxVol ? (t.direct + t.indirect) / maxVol : 0})`,
              }}
            />
            <i
              className="tr-volume-bar-direct"
              style={{ transform: `scaleX(${maxVol ? t.direct / maxVol : 0})` }}
            />
          </span>
          <b>
            {t.direct}
            {t.indirect > 0 && (
              <span className="tr-volume-indirect"> +{t.indirect}</span>
            )}
          </b>
        </div>
      ))}
      {trained.length < targets.length && (
        <button
          className="tr-volume-toggle"
          type="button"
          onClick={() => setShowUntrained((v) => !v)}
        >
          {showUntrained ? "Hide untrained targets" : "Show untrained targets"}
        </button>
      )}
      {unassignedSets > 0 && (
        <p className="tr-volume-caption">{unassignedSets} unassigned sets</p>
      )}
    </div>
  );
}
