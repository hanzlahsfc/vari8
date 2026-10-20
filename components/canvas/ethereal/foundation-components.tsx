"use client";

import { Check, CheckCircle2, CircleHelp, X } from "lucide-react";
import { useState } from "react";
import {
  Avatar,
  CheckboxControl,
  StatusLabel,
  SwitchControl,
  Tabs,
  TextInput,
} from "@/components/canvas/ethereal/ui";
import { Button } from "@/components/canvas/ui/button";

function NumericField({
  id,
  label,
  value,
  onChange,
  unit,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
}) {
  return (
    <label className="foundation-numeric-field" htmlFor={id}>
      <span>{label}</span>
      <span className="foundation-numeric-entry">
        <TextInput
          id={id}
          className="foundation-number"
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) =>
            onChange(event.target.value.replace(/\D/g, "").slice(0, 3))
          }
        />
        <span className="foundation-unit">{unit}</span>
      </span>
    </label>
  );
}

function formatPressure(value: string) {
  if (value.includes("/")) {
    const [systolic = "", diastolic = ""] = value.split("/", 2);
    return `${systolic.replace(/\D/g, "").slice(0, 3)}${diastolic ? `/${diastolic.replace(/\D/g, "").slice(0, 3)}` : "/"}`;
  }
  const digits = value.replace(/\D/g, "").slice(0, 6);
  if (digits.length < 4) return digits;
  const systolicLength = Number(digits.slice(0, 3)) > 250 ? 2 : 3;
  return `${digits.slice(0, systolicLength)}/${digits.slice(systolicLength)}`;
}

export function FoundationComponents({
  onNotify,
}: {
  onNotify: (message: string) => void;
}) {
  const [heartRate, setHeartRate] = useState("58");
  const [glucose, setGlucose] = useState("91");
  const [pressure, setPressure] = useState("112/72");
  const [includeInCheckin, setIncludeInCheckin] = useState(true);
  const [clientVisible, setClientVisible] = useState(false);
  const [tab, setTab] = useState("input");
  const [text, setText] = useState("emma@");
  const [metric, setMetric] = useState("");
  const [feedbackVisible, setFeedbackVisible] = useState(true);
  const [noteEmpty, setNoteEmpty] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);

  return (
    <div className="foundation-components">
      <section className="foundation-type" aria-label="Type and numeric styles">
        <div className="foundation-sample-heading">
          <h3>Type &amp; numbers</h3>
          <p>Tabular figures keep readings aligned with their units.</p>
        </div>
        <div className="foundation-type-examples">
          <div>
            <span>Body text</span>
            <p>Daily signals, recorded with care.</p>
          </div>
          <div>
            <span>Measurement</span>
            <strong>
              71.9 <i>kg</i>
            </strong>
          </div>
          <div>
            <span>Daily target</span>
            <strong>
              1,997 <i>kcal</i>
            </strong>
          </div>
          <div className="foundation-avatar-example">
            <span>Initials avatar</span>
            <Avatar initials="EA" size="md" />
          </div>
        </div>
      </section>

      <div className="foundation-columns">
        <section className="foundation-section">
          <div className="foundation-sample-heading">
            <h3>Actions &amp; states</h3>
            <p>Three familiar button treatments.</p>
          </div>
          <div className="foundation-actions">
            <Button
              className="app-button"
              onClick={() => onNotify("Primary action selected.")}
            >
              <Check size={14} /> Primary action
            </Button>
            <Button
              variant="outline"
              className="app-button"
              onClick={() => onNotify("Secondary action selected.")}
            >
              Secondary
            </Button>
            <Button variant="outline" className="app-button" disabled>
              Disabled
            </Button>
          </div>
          <fieldset className="foundation-statuses">
            <legend className="tl-sr-only">Status examples</legend>
            <StatusLabel status="on track" />
            <StatusLabel status="awaiting feedback" />
            <StatusLabel status="overdue" />
          </fieldset>
        </section>

        <section className="foundation-section">
          <div className="foundation-sample-heading">
            <h3>Text &amp; selection</h3>
            <p>Field labels and inline recovery guidance.</p>
          </div>
          <div className="foundation-validation-grid">
            <label className="foundation-label" htmlFor="foundation-email">
              Email address
              <TextInput
                id="foundation-email"
                type="text"
                autoComplete="off"
                value={text}
                aria-invalid={!emailValid}
                aria-describedby="foundation-email-hint"
                onChange={(event) => setText(event.target.value)}
              />
              <span
                id="foundation-email-hint"
                className={emailValid ? "foundation-valid" : "foundation-error"}
              >
                {emailValid ? <CheckCircle2 size={13} /> : <X size={13} />}
                {emailValid
                  ? "Address looks valid."
                  : "Add a complete email address."}
              </span>
            </label>
            <label className="foundation-label" htmlFor="foundation-metric">
              Metric
              <select
                id="foundation-metric"
                className="form-select"
                value={metric}
                aria-invalid={!metric}
                aria-describedby="foundation-metric-hint"
                onChange={(event) => setMetric(event.target.value)}
              >
                <option value="">Choose a metric</option>
                <option value="bodyweight">Bodyweight</option>
                <option value="sleep">Sleep</option>
                <option value="steps">Steps</option>
              </select>
              <span
                id="foundation-metric-hint"
                className={!metric ? "foundation-error" : "foundation-valid"}
              >
                {!metric ? <X size={13} /> : <CheckCircle2 size={13} />}
                {metric ? "Metric selected." : "Choose one to continue."}
              </span>
            </label>
          </div>
        </section>

        <section className="foundation-section">
          <div className="foundation-sample-heading">
            <h3>Choices &amp; tabs</h3>
            <p>Native keyboard and focus behavior is retained.</p>
          </div>
          <div className="foundation-choices">
            <CheckboxControl
              checked={includeInCheckin}
              label="Include in next check-in"
              onChange={setIncludeInCheckin}
            />
            <SwitchControl
              checked={clientVisible}
              label="Visible to client"
              onChange={setClientVisible}
            />
          </div>
          <Tabs
            value={tab}
            onChange={setTab}
            label="Foundation example type"
            options={[
              { value: "input", label: "Inputs" },
              { value: "choices", label: "Choices" },
              { value: "feedback", label: "Feedback" },
            ]}
          />
          <p className="foundation-tab-state">
            {tab[0].toUpperCase() + tab.slice(1)} examples selected.
          </p>
        </section>

        <section className="foundation-section">
          <div className="foundation-sample-heading">
            <h3>Compact health fields</h3>
            <p>Short readings stay the same size and keep units close.</p>
          </div>
          <div className="foundation-numeric-fields">
            <NumericField
              id="foundation-heart-rate"
              label="Heart rate"
              value={heartRate}
              onChange={setHeartRate}
              unit="bpm"
            />
            <NumericField
              id="foundation-glucose"
              label="Glucose"
              value={glucose}
              onChange={setGlucose}
              unit="mg/dL"
            />
            <label
              className="foundation-numeric-field"
              htmlFor="foundation-pressure"
            >
              <span>Blood pressure</span>
              <span className="foundation-numeric-entry">
                <TextInput
                  id="foundation-pressure"
                  className="foundation-number"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pressure}
                  aria-describedby="foundation-pressure-hint"
                  onChange={(event) =>
                    setPressure(formatPressure(event.target.value))
                  }
                />
                <span className="foundation-unit">mmHg</span>
              </span>
              <span
                id="foundation-pressure-hint"
                className="foundation-reading-hint"
              >
                Type digits or enter a slash (e.g. 112/72).
              </span>
            </label>
          </div>
        </section>
      </div>

      <section className="foundation-section foundation-feedback">
        <div className="foundation-sample-heading">
          <h3>Feedback</h3>
          <p>Confirmation and empty states keep the next step clear.</p>
        </div>
        <div className="foundation-feedback-examples">
          {feedbackVisible ? (
            <div className="foundation-confirm" role="status">
              <CheckCircle2 size={17} />
              <div>
                <strong>Changes saved</strong>
                <span>Your example is ready to use.</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss confirmation"
                onClick={() => setFeedbackVisible(false)}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="foundation-empty">
              <CircleHelp size={17} />
              <strong>No saved note</strong>
              <span>Write a short note to add context.</span>
              <Button
                variant="outline"
                className="app-button"
                onClick={() => setFeedbackVisible(true)}
              >
                Restore confirmation
              </Button>
            </div>
          )}
          <div className="foundation-empty" hidden={!noteEmpty}>
            <CircleHelp size={17} />
            <strong>No saved note</strong>
            <span>Write a short note to add context.</span>
          </div>
          <button
            type="button"
            className="foundation-quiet-action"
            onClick={() => {
              setNoteEmpty((current) => !current);
              onNotify(
                noteEmpty ? "Empty state cleared." : "Empty state shown.",
              );
            }}
          >
            {noteEmpty ? "Hide empty example" : "Show empty example"}
          </button>
        </div>
      </section>
    </div>
  );
}
