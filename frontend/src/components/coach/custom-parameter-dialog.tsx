"use client";

import { Archive, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  SegmentedControl,
  Input as Vari8Input,
  Select as Vari8Select,
} from "../vari8/components";
import { TextArea } from "../vari8/inputs";
import {
  type CustomParameterDraft,
  type CustomParameterType,
  customParameter,
  customParameterDraftError,
  type Parameter,
} from "./model";
import { Button, Dialog } from "./ui";

const TYPE_OPTIONS: { value: CustomParameterType; label: string }[] = [
  { value: "number", label: "Number" },
  { value: "rating", label: "Rating" },
  { value: "yes-no", label: "Yes / No" },
  { value: "choice", label: "Choice" },
  { value: "text", label: "Text" },
  { value: "time", label: "Time" },
];

function inferType(parameter?: Parameter): CustomParameterType {
  if (!parameter?.custom) return "number";
  if (parameter.kind) return parameter.kind;
  if (parameter.inputType === "choice") return "choice";
  if (parameter.inputType === "context") return "yes-no";
  if (parameter.inputType === "text") return "text";
  if (parameter.inputType === "time") return "time";
  if (parameter.units.some((unit) => unit.startsWith("1–"))) return "rating";
  return "number";
}

export function CustomParameterDialog({
  group,
  parameter,
  usage,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: {
  group: string;
  parameter?: Parameter;
  usage: { templates: number; clients: number; total: number };
  onClose: () => void;
  onSave: (parameter: Parameter) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const editing = Boolean(parameter);
  const [name, setName] = useState(parameter?.name ?? "");
  const [type, setType] = useState<CustomParameterType>(inferType(parameter));
  const [unit, setUnit] = useState(parameter?.units[0] ?? "");
  const [scale, setScale] = useState<5 | 10>(
    parameter?.units.includes("1–5") ? 5 : 10,
  );
  const [options, setOptions] = useState(parameter?.options?.join(", ") ?? "");
  const [decimals, setDecimals] = useState<0 | 1 | 2>(parameter?.decimals ?? 1);
  const [summary, setSummary] = useState<"avg" | "sum" | "none">(
    parameter?.summary ?? "avg",
  );
  const [error, setError] = useState<string | undefined>();
  const draft: CustomParameterDraft = {
    name,
    type,
    group,
    unit,
    scale,
    options: options.split(","),
    decimals,
    summary,
  };
  const submit = () => {
    const message = customParameterDraftError(draft);
    if (message) {
      setError(message);
      return;
    }
    const next = customParameter(draft, parameter?.id);
    if (parameter?.archived) next.archived = true;
    onSave(next);
  };
  return (
    <Dialog
      title={editing ? `Edit ${parameter?.name}` : "Create parameter"}
      onClose={onClose}
      wide
    >
      <p className="cd-muted">
        {editing
          ? "Applies to every client using it. Saved values keep their history."
          : `A workspace parameter for ${group}. It becomes available in every template and client.`}
      </p>
      <div className="cd-custom-param-form">
        <Vari8Input
          label="Name"
          value={name}
          maxLength={60}
          onChange={(event) => {
            setName(event.target.value);
            setError(undefined);
          }}
        />
        <Vari8Select
          label="Type"
          value={type}
          options={TYPE_OPTIONS}
          onValueChange={(value) => {
            setType(value as CustomParameterType);
            setError(undefined);
          }}
        />
        {type === "number" && (
          <>
            <Vari8Input
              label="Unit (optional)"
              value={unit}
              maxLength={12}
              placeholder="kg, min, reps…"
              onChange={(event) => setUnit(event.target.value)}
            />
            <div className="v8-field">
              <span className="v8-field__label">Decimals</span>
              <SegmentedControl
                label="Decimals"
                value={String(decimals)}
                onValueChange={(value) =>
                  setDecimals(Number(value) as 0 | 1 | 2)
                }
                options={[
                  { value: "0", label: "0" },
                  { value: "1", label: "1" },
                  { value: "2", label: "2" },
                ]}
              />
            </div>
            <Vari8Select
              label="Weekly summary"
              value={summary}
              options={[
                { value: "avg", label: "Average" },
                { value: "sum", label: "Total" },
                { value: "none", label: "None" },
              ]}
              onValueChange={(value) =>
                setSummary(value as "avg" | "sum" | "none")
              }
            />
          </>
        )}
        {type === "rating" && (
          <div className="v8-field">
            <span className="v8-field__label">Scale</span>
            <SegmentedControl
              label="Scale"
              value={String(scale)}
              onValueChange={(value) => setScale(value === "5" ? 5 : 10)}
              options={[
                { value: "5", label: "1–5" },
                { value: "10", label: "1–10" },
              ]}
            />
          </div>
        )}
        {type === "choice" && (
          <TextArea
            label="Options"
            rows={3}
            value={options}
            placeholder="Good, Okay, Difficult"
            onChange={(event) => {
              setOptions(event.target.value);
              setError(undefined);
            }}
          />
        )}
        {error && (
          <p className="cd-custom-param-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="cd-dialog-actions">
        {editing && (
          <span className="cd-custom-param-usage">
            {usage.total
              ? `Used by ${usage.templates} template${usage.templates === 1 ? "" : "s"} and ${usage.clients} client${usage.clients === 1 ? "" : "s"}`
              : "Not used by any template or client yet"}
          </span>
        )}
        {editing && usage.total > 0 && (
          <Button
            variant="secondary"
            onClick={() => {
              onArchive();
              onClose();
            }}
          >
            <Archive size={14} />
            Archive
          </Button>
        )}
        {editing && usage.total === 0 && (
          <Button
            variant="secondary"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            <Trash2 size={14} />
            Delete
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button primary onClick={submit}>
          {editing ? "Save parameter" : "Create parameter"}
        </Button>
      </div>
    </Dialog>
  );
}
