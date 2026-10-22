"use client";

import { groupConsecutiveSetPrescriptions } from "@/components/coach/plans/training/training-model";
import { Card } from "@/components/vari8/components";
import type { ParsedDemo } from "./demo/state";
import { useDemoSlice } from "./demo/store";
import { ClientScreen, DemoGate } from "./shell";

export function TrainingScreen({ demo }: { demo: ParsedDemo }) {
  const [training] = useDemoSlice("training");
  const plan = training.plan;
  return (
    <ClientScreen
      title="Training"
      description={plan ? `${plan.name} - ${plan.weeks} weeks` : undefined}
    >
      <DemoGate demo={demo} empty="No training plan is published yet.">
        <div className="client-card-stack">
          {training.sessions.map((session) => (
            <Card key={session.id}>
              <div className="client-card-stack">
                <strong>{session.name}</strong>
                {session.exercises.map((exercise) => (
                  <div key={exercise.id} className="client-card-stack">
                    <div className="client-kv">
                      <span>{exercise.name}</span>
                      <span>{exercise.muscle}</span>
                    </div>
                    <div className="client-set-row">
                      {groupConsecutiveSetPrescriptions(exercise.sets)
                        .map((group) => {
                          const p = group.prescription;
                          const reps = p.repsMax
                            ? `${p.reps}-${p.repsMax}`
                            : `${p.reps}`;
                          return `${group.count} x ${reps} reps ${p.type} @ ${p.tempo}, rest ${p.rest}`;
                        })
                        .join("  +  ")}
                    </div>
                    {exercise.progression ? (
                      <p className="client-hint">{exercise.progression}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </DemoGate>
    </ClientScreen>
  );
}
