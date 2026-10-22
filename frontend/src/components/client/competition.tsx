"use client";

import Link from "next/link";
import { Card, Status } from "@/components/vari8/components";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice, useDemoStore } from "./demo/store";
import { ClientScreen, DemoGate } from "./shell";

const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar day difference from the demo "today" to the show date. The
// countdown is computed at render time and never stored (R2 default 2).
export function daysUntilShow(showDate: string, asOf: string): number {
  return Math.round(
    (Date.parse(`${showDate}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) /
      DAY_MS,
  );
}

export function countdownLabel(days: number): string {
  if (days > 0) return `T-${days} days`;
  if (days === 0) return "Show day";
  return "Show passed";
}

// One line on the client home, nothing more (R2 defaults 1 and 9). The sheet
// block is SHOW / DIVISION / DATE / T-minus, so the line keeps that order.
export function CompetitionLine() {
  const { asOf } = useDemoStore();
  const [competition] = useDemoSlice("competition");
  const record = competition.record;
  if (!record) return null;
  const label = countdownLabel(daysUntilShow(record.showDate, asOf));
  return (
    <Link className="client-comp" href="/client/competition">
      {`${record.show} · ${record.division} · ${record.showDate} · ${label}`}
    </Link>
  );
}

export function CompetitionScreen({ demo }: { demo: ParsedDemo }) {
  const { asOf } = useDemoStore();
  const [competition] = useDemoSlice("competition");
  const record = competition.record;
  return (
    <ClientScreen
      title="Competition"
      description="One show record, demo data only. The phase label stays beside the coach phase plan, it does not generate one."
    >
      <DemoGate
        demo={demo}
        empty="No competition is set. Your coach publishes the show details."
      >
        {record && (
          <>
            <Card>
              <div className="client-card-stack">
                <div className="client-kv">
                  <span>Show</span>
                  <span>{record.show}</span>
                </div>
                <div className="client-kv">
                  <span>Division</span>
                  <span>{record.division}</span>
                </div>
                <div className="client-kv">
                  <span>Show date</span>
                  <span>{record.showDate}</span>
                </div>
                <div className="client-kv">
                  <span>Phase</span>
                  <Status tone="warning">{record.phase}</Status>
                </div>
              </div>
            </Card>
            <Card>
              <p className="client-hint">Countdown</p>
              <p className="client-figure">
                {countdownLabel(daysUntilShow(record.showDate, asOf))}
              </p>
              <p className="client-hint">
                Computed from the show date, never stored.
              </p>
            </Card>
          </>
        )}
      </DemoGate>
    </ClientScreen>
  );
}
