"use client";
import { useState } from "react";
import {
  Checkbox,
  Input as Vari8Input,
  Select as Vari8Select,
} from "../vari8/components";
import { TextArea } from "../vari8/inputs";
import { Button, ParameterValue } from "./form-controls";
import { ALL_PARAMETERS, type CoachClient, type Variant } from "./model";
import { weeklyRoadmapRows } from "./roadmap-preview";

export function FormPreview({
  variant,
  custom,
  client,
}: {
  variant: Variant;
  custom: boolean;
  client?: CoachClient;
}) {
  const [metrics, setMetrics] = useState<string[]>(["weight"]);
  const [note, setNote] = useState(false);
  const [visual, setVisual] = useState(false);
  const summaryRow = client
    ? weeklyRoadmapRows(
        {
          ...variant,
          roadmap: variant.summaries
            .filter(
              (id) =>
                id !== "habits" && variant.fields.some((f) => f.id === id),
            )
            .map((source) => ({
              source,
              calculation: "Weekly average",
              comparison: false,
            })),
        },
        client,
      ).at(-1)
    : null;
  return (
    <div className="cd-form-preview">
      {custom ? (
        <>
          <ParameterValue
            field={
              variant.fields.find((f) => f.id === "weight") ?? {
                id: "weight",
                unit: "kg",
              }
            }
          />
          <div className="cd-check-grid">
            {variant.fields
              .filter((f) => f.id !== "weight")
              .map((f) => (
                <Checkbox
                  key={f.id}
                  label={
                    ALL_PARAMETERS.find((p) => p.id === f.id)?.name ?? f.id
                  }
                  checked={metrics.includes(f.id)}
                  onCheckedChange={(checked) =>
                    setMetrics(
                      checked
                        ? [...metrics, f.id]
                        : metrics.filter((x) => x !== f.id),
                    )
                  }
                />
              ))}
          </div>
          {variant.fields
            .filter((f) => f.id !== "weight" && metrics.includes(f.id))
            .map((f) => (
              <ParameterValue field={f} key={f.id} />
            ))}
          <div className="cd-actions">
            <Button onClick={() => setVisual((v) => !v)}>
              {visual ? "Remove visuals" : "Add visuals"}
            </Button>
            <Button onClick={() => setNote((v) => !v)}>
              {note ? "Remove note" : "Add note"}
            </Button>
          </div>
          {visual && (
            <Vari8Input
              label="Progress visuals"
              type="file"
              accept="image/*"
              multiple
            />
          )}
          {note && (
            <TextArea
              label="Your note"
              rows={3}
              placeholder="Share a quick update…"
            />
          )}
        </>
      ) : (
        <>
          {client ? (
            summaryRow && summaryRow.metrics.length > 0 ? (
              <>
                <h3>This week’s logged summaries</h3>
                {summaryRow.metrics.map((metric) => (
                  <div className="cd-stat-row" key={metric.source}>
                    <span>
                      {ALL_PARAMETERS.find((p) => p.id === metric.source)
                        ?.name ?? metric.source}
                    </span>
                    <strong>
                      {metric.value === null ? (
                        "Not recorded"
                      ) : (
                        <>
                          {Number(metric.value.toFixed(1))} {metric.unit}
                          <small className="cd-muted">
                            {" "}
                            · {metric.count} reading
                            {metric.count === 1 ? "" : "s"}
                          </small>
                        </>
                      )}
                    </strong>
                  </div>
                ))}
              </>
            ) : null
          ) : (
            variant.summaries
              .filter((id) => id !== "habits")
              .map((id) => (
                <ParameterValue
                  key={id}
                  field={
                    variant.fields.find((f) => f.id === id) ?? {
                      id,
                      unit:
                        ALL_PARAMETERS.find((p) => p.id === id)?.units[0] ?? "",
                    }
                  }
                />
              ))
          )}
          {variant.habits &&
            variant.summaries.includes("habits") &&
            (client ? (
              client.habits.map((habit) => (
                <div className="cd-stat-row" key={habit.id}>
                  <span>
                    {habit.name} · {habit.frequency} · {habit.goal}
                  </span>
                  <strong>{habit.completed} completed</strong>
                </div>
              ))
            ) : (
              <div className="cd-stat-row">
                <span>Habit consistency</span>
                <strong>5 / 7</strong>
              </div>
            ))}
          {variant.questions.map((q) => (
            <div className="cd-field" key={q.id}>
              {q.type === "Long text" ? (
                <TextArea
                  label={`${q.label}${q.required ? " *" : " · optional"}`}
                  id={`preview-${q.id}`}
                  rows={3}
                  placeholder="Your answer…"
                  required={q.required}
                />
              ) : q.type === "Choice" || q.type === "Rating" ? (
                <Vari8Select
                  label={`${q.label}${q.required ? " *" : " · optional"}`}
                  id={`preview-${q.id}`}
                  defaultValue=""
                  required={q.required}
                  options={[
                    { value: "", label: "Choose an answer" },
                    ...(q.type === "Choice"
                      ? q.options
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((option) => ({
                            value: option,
                            label: option,
                          }))
                      : q.options === "Word labels"
                        ? ["Low", "Okay", "Good", "Excellent"].map(
                            (option) => ({
                              value: option,
                              label: option,
                            }),
                          )
                        : Array.from(
                            { length: q.options === "1–5" ? 5 : 10 },
                            (_, i) => String(i + 1),
                          ).map((option) => ({
                            value: option,
                            label: option,
                          }))),
                  ]}
                />
              ) : (
                <Vari8Input
                  label={`${q.label}${q.required ? " *" : " · optional"}`}
                  id={`preview-${q.id}`}
                  type={
                    q.type === "Numeric"
                      ? "number"
                      : q.type === "Visual upload"
                        ? "file"
                        : "text"
                  }
                  accept={q.type === "Visual upload" ? "image/*" : undefined}
                  required={q.required}
                />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
