"use client";

import { useState } from "react";
import { Card, Select } from "@/components/vari8/components";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice } from "./demo/store";
import { ClientScreen, DemoGate } from "./shell";

function PhotoFigure() {
  return (
    <svg viewBox="0 0 40 60" role="img" aria-label="Silhouette placeholder">
      <circle cx="20" cy="10" r="7" fill="currentColor" />
      <rect x="9" y="20" width="22" height="36" rx="8" fill="currentColor" />
    </svg>
  );
}

function PhotoTile({ date }: { date: string }) {
  return (
    <figure className="client-photo-frame">
      <div className="client-photo">
        <PhotoFigure />
      </div>
      <figcaption className="client-photo-caption">{date}</figcaption>
    </figure>
  );
}

export function PhotosScreen({ demo }: { demo: ParsedDemo }) {
  const [photos] = useDemoSlice("photos");
  const dates = photos.dates;
  const [from, setFrom] = useState(dates[0] ?? "");
  const [to, setTo] = useState(dates.at(-1) ?? "");
  const options = dates.map((date) => ({ value: date, label: date }));
  return (
    <ClientScreen
      title="Photos"
      description="Progress photos. Placeholder blocks only, no images."
    >
      <DemoGate demo={demo} empty="No photos uploaded yet.">
        <Card>
          <div className="client-card-stack">
            <strong>Gallery</strong>
            <div className="client-photo-grid">
              {dates.map((date) => (
                <PhotoTile key={date} date={date} />
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <div className="client-card-stack">
            <strong>Compare dates</strong>
            <div className="client-compare">
              <Select
                label="From"
                value={from}
                options={options}
                onValueChange={setFrom}
              />
              <Select
                label="To"
                value={to}
                options={options}
                onValueChange={setTo}
              />
            </div>
            <div className="client-compare">
              <PhotoTile date={from} />
              <PhotoTile date={to} />
            </div>
          </div>
        </Card>
      </DemoGate>
    </ClientScreen>
  );
}
