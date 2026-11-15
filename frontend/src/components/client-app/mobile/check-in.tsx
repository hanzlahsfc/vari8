"use client";

import type { CoachClient } from "../../coach/model";
import { useCoach, useCoachNow, useDisplay } from "../../coach/store";
import { useLocalToday } from "../../coach/targets/use-local-today";
import { templateSetup } from "../../coach/template-setup";
import { CheckInForm } from "../check-in";
import { nextCheckIn } from "./data";

export function ClientCheckInSheet({
  client,
  onClose,
}: {
  client: CoachClient;
  onClose: () => void;
}) {
  const { formatDate, formatClock } = useDisplay();
  const now = useCoachNow();
  const { state } = useCoach();
  const today = useLocalToday();
  const configuration = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const due = nextCheckIn(state, client, today, now);
  if (!configuration) return null;
  return (
    <>
      <button
        type="button"
        className="cm-dim"
        onClick={onClose}
        aria-label="Close check-in"
      />
      <div className="cm-sheet" role="dialog" aria-label="Check-in">
        <div className="cm-grab" />
        <div className="cm-sheet-head">
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Weekly check-in</div>
            <div className="cm-mut" style={{ fontSize: 12 }}>
              {due
                ? due.dueToday
                  ? `due today by ${formatClock(due.deadline)}`
                  : `due ${formatDate(due.date, { weekday: "short", day: "numeric", month: "short" })} by ${formatClock(due.deadline)}`
                : "~5 min"}
            </div>
          </div>
          <button
            type="button"
            className="cm-x"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="cm-sheet-body">
          <CheckInForm
            configuration={configuration}
            client={client}
            occurrence={due?.event}
          />
        </div>
      </div>
    </>
  );
}
