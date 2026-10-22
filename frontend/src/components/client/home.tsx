"use client";

import Link from "next/link";
import { Card } from "@/components/vari8/components";
import { CompetitionLine } from "./competition";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice, useDemoStore } from "./demo/store";
import { LegacySheetDemo } from "./legacy-sheet/dialog";
import { ClientScreen, clientNavItems, DemoGate } from "./shell";

export function ClientHome({ demo }: { demo: ParsedDemo }) {
  const { client } = useDemoStore();
  const [home] = useDemoSlice("home");
  const summary = home.summary;
  return (
    <ClientScreen
      title={`Hi ${client.name.split(" ")[0]}`}
      description="Your week at a glance. Demo data only."
    >
      <DemoGate
        demo={demo}
        empty="Nothing scheduled yet. Your coach has not published a program."
      >
        {summary && (
          <>
            <div className="client-grid">
              <Card>
                <p className="client-hint">Sessions this week</p>
                <p className="client-figure">
                  {summary.sessionsDone}/{summary.sessionsPlanned}
                </p>
              </Card>
              <Card>
                <p className="client-hint">Next check-in</p>
                <p className="client-figure">{summary.nextCheckIn}</p>
              </Card>
              <Card>
                <p className="client-hint">Unread messages</p>
                <p className="client-figure">{summary.unreadMessages}</p>
              </Card>
              <Card>
                <p className="client-hint">Open tasks</p>
                <p className="client-figure">{summary.openTasks}</p>
              </Card>
            </div>
            <div className="client-grid">
              {clientNavItems
                .filter((item) => item.id !== "home")
                .map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="client-nav-card"
                  >
                    <Card className="client-nav-card-inner">{item.label}</Card>
                  </Link>
                ))}
            </div>
            <CompetitionLine />
            <LegacySheetDemo />
          </>
        )}
      </DemoGate>
    </ClientScreen>
  );
}
