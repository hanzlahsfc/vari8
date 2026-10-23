"use client";

import { useState } from "react";
import { groupConsecutiveSetPrescriptions } from "@/components/coach/plans/training/training-model";
import { Button, Card, Input, Status } from "@/components/vari8/components";
import { prescriptionVersions } from "./demo/fixtures";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice } from "./demo/store";
import type { LoggedSet, LogSession } from "./logbook-model";
import {
  finishSession,
  prescriptionFor,
  resumeIndex,
  startSession,
} from "./logbook-model";
import { ClientScreen, DemoGate } from "./shell";

const statusTone = (status: LogSession["status"]) =>
  status === "done"
    ? "positive"
    : status === "skipped"
      ? "danger"
      : status === "in-progress"
        ? "info"
        : "neutral";

function prescriptionForSession(session: LogSession) {
  return prescriptionFor(session, prescriptionVersions);
}

function SessionView({
  session,
  onChange,
  onClose,
}: {
  session: LogSession;
  onChange: (next: LogSession) => void;
  onClose: () => void;
}) {
  const prescription = prescriptionForSession(session);
  const readOnly =
    session.status !== "in-progress" && session.status !== "planned";
  const [drafts, setDrafts] = useState<Record<string, LoggedSet>>({});
  const [dirty, setDirty] = useState(false);
  const [leaveArmed, setLeaveArmed] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  if (!prescription)
    return <p className="client-hint">Unknown prescription.</p>;

  const saveSet = (setId: string) => {
    const draft = drafts[setId];
    if (!draft) return;
    onChange({
      ...session,
      status: "in-progress",
      sets: { ...session.sets, [setId]: draft },
    });
    setDrafts((current) => {
      const next = { ...current };
      delete next[setId];
      return next;
    });
    setDirty(Object.keys(drafts).length > 1);
  };

  const leave = () => {
    if (dirty && !leaveArmed) {
      setLeaveArmed(true);
      return;
    }
    setDrafts({});
    setDirty(false);
    onClose();
  };

  const resume = () => {
    const index = resumeIndex(session);
    setCurrentId(index === -1 ? null : session.setIds[index]);
  };

  const finish = (skipped: boolean) => {
    onChange(finishSession(session, { skipped }));
    onClose();
  };

  return (
    <Card>
      <div className="client-card-stack">
        <div className="client-kv">
          <span>
            {prescription.session.name} · Rx v{session.version}
          </span>
          <Status tone={statusTone(session.status)}>{session.status}</Status>
        </div>
        {leaveArmed && dirty && (
          <Status tone="warning">
            Unsaved set drafts - press back again to leave.
          </Status>
        )}
        {readOnly
          ? prescription.session.exercises.map((exercise) => (
              <div key={exercise.id} className="client-card-stack">
                <strong>{exercise.name}</strong>
                {exercise.sets.map((set, index) => {
                  const logged = session.sets[set.id];
                  return (
                    <div className="client-set-row" key={set.id}>
                      <span>Set {index + 1}</span>
                      <span>
                        Rx {set.reps}
                        {set.repsMax ? `-${set.repsMax}` : ""} reps
                        {set.tempo ? ` @ ${set.tempo}` : ""}
                      </span>
                      <span>
                        {logged
                          ? `${logged.reps ?? "-"} reps · ${logged.load ?? "-"} kg · RPE ${logged.rpe ?? "-"}`
                          : "Not recorded"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          : prescription.session.exercises.map((exercise) => (
              <div key={exercise.id} className="client-card-stack">
                <strong>{exercise.name}</strong>
                <div className="client-set-row">
                  {groupConsecutiveSetPrescriptions(exercise.sets)
                    .map((group) => {
                      const p = group.prescription;
                      const reps = p.repsMax
                        ? `${p.reps}-${p.repsMax}`
                        : `${p.reps}`;
                      return `${group.count} x ${reps} reps ${p.type}${p.tempo ? ` @ ${p.tempo}` : ""}, rest ${p.rest}`;
                    })
                    .join("  +  ")}
                </div>
                {exercise.sets.map((set, index) => {
                  const value = drafts[set.id] ??
                    session.sets[set.id] ?? {
                      reps: null,
                      load: null,
                      rpe: null,
                    };
                  const update = (patch: Partial<LoggedSet>) => {
                    setDrafts((current) => ({
                      ...current,
                      [set.id]: { ...value, ...patch },
                    }));
                    setDirty(true);
                  };
                  const num = (raw: string) =>
                    raw === "" ? null : Number(raw);
                  return (
                    <div
                      className="client-set-edit"
                      data-current={set.id === currentId || undefined}
                      key={set.id}
                    >
                      <span>
                        Set {index + 1} · Rx {set.reps}
                        {set.repsMax ? `-${set.repsMax}` : ""}
                        {set.tempo ? ` @ ${set.tempo}` : ""}
                      </span>
                      <div className="client-set-fields">
                        <Input
                          label="Reps"
                          labelHidden
                          type="number"
                          inputMode="numeric"
                          placeholder="reps"
                          value={value.reps ?? ""}
                          onChange={(e) =>
                            update({ reps: num(e.target.value) })
                          }
                        />
                        <Input
                          label="Load kg"
                          labelHidden
                          type="number"
                          inputMode="decimal"
                          placeholder="kg"
                          value={value.load ?? ""}
                          onChange={(e) =>
                            update({ load: num(e.target.value) })
                          }
                        />
                        <Input
                          label="RPE"
                          labelHidden
                          type="number"
                          inputMode="decimal"
                          placeholder="rpe"
                          value={value.rpe ?? ""}
                          onChange={(e) => update({ rpe: num(e.target.value) })}
                        />
                        <Button size="sm" onClick={() => saveSet(set.id)}>
                          Save set
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
        <div className="client-set-row">
          <Button variant="ghost" onClick={leave}>
            Back to logbook
          </Button>
          {!readOnly && (
            <>
              <Button onClick={resume}>Resume first unlogged set</Button>
              <Button variant="primary" onClick={() => finish(false)}>
                Finish session
              </Button>
              <Button variant="destructive" onClick={() => finish(true)}>
                Skip session
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export function LogbookScreen({ demo }: { demo: ParsedDemo }) {
  const [logbook, setLogbook] = useDemoSlice("logbook");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = logbook.sessions.find((s) => s.id === openId) ?? null;
  const current = prescriptionVersions.at(-1);

  const replace = (next: LogSession) =>
    setLogbook((c) => ({
      sessions: c.sessions.map((s) => (s.id === next.id ? next : s)),
    }));

  const startPlanned = (planned: LogSession) => {
    const version = prescriptionForSession(planned);
    if (!version) return;
    const next = startSession({ sessions: [] }, planned.planId, version)
      .sessions[0];
    setLogbook((c) => ({
      sessions: c.sessions.map((s) =>
        s.id === planned.id ? { ...next, id: planned.id } : s,
      ),
    }));
  };

  return (
    <ClientScreen
      title="Logbook"
      description="Log each prescribed set as you train."
    >
      <DemoGate
        demo={demo}
        empty="No sessions yet. Start one from the training plan."
      >
        {open ? (
          <SessionView
            session={open}
            onChange={replace}
            onClose={() => setOpenId(null)}
          />
        ) : (
          <>
            <div className="client-card-stack">
              {logbook.sessions.map((session) => {
                const prescription = prescriptionForSession(session);
                return (
                  <Card key={session.id}>
                    <div className="client-kv">
                      <span>
                        {prescription?.session.name ?? session.sessionId} · Rx v
                        {session.version}
                        {session.result ? ` · ${session.result}` : ""}
                      </span>
                      <span className="client-set-row">
                        <Status tone={statusTone(session.status)}>
                          {session.status}
                        </Status>
                        {session.status === "planned" ? (
                          <Button
                            size="sm"
                            onClick={() => startPlanned(session)}
                          >
                            Start
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setOpenId(session.id)}
                          >
                            {session.status === "in-progress"
                              ? "Continue"
                              : "View"}
                          </Button>
                        )}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
            {current && (
              <div>
                <Button
                  onClick={() =>
                    setLogbook((c) =>
                      startSession(
                        { sessions: c.sessions },
                        "demo-training-plan",
                        current,
                      ),
                    )
                  }
                >
                  Start {current.session.name} (Rx v{current.version})
                </Button>
              </div>
            )}
          </>
        )}
      </DemoGate>
    </ClientScreen>
  );
}
