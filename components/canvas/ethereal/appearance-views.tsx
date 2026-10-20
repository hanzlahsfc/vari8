"use client";

import { Check, Moon, RotateCcw, Sun, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, useEffect, useState } from "react";
import {
  Avatar,
  Segmented,
  StatusLabel,
  TextInput,
} from "@/components/canvas/ethereal/ui";
import {
  defaultAppearance,
  fontOptions,
  useAppearance,
} from "@/lib/canvas/ethereal-appearance";
import { useReducedMotion } from "@/lib/canvas/reduced-motion";
import { FoundationComponents } from "./foundation-components";
import { BodyweightTrend, NutritionTargets } from "./tracker-components";

const categories = {
  sans: "Sans",
  serif: "Serif",
  condensed: "Condensed",
  mono: "Monospace",
  rounded: "Rounded",
} as const;

const accentSuggestions = [
  { name: "Rose", value: "#EB91B8" },
  { name: "Berry", value: "#C5457C" },
  { name: "Ocean", value: "#3565B7" },
  { name: "Forest", value: "#2B7157" },
  { name: "Teal", value: "#68D0C0" },
  { name: "Amber", value: "#E9B66E" },
];

type PreviewDensity = "comfortable" | "compact";

export function AppearanceScreen() {
  const { appearance, setMode, setAccent, setFont, resetAppearance } =
    useAppearance();
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState(appearance.accent);
  const [density, setDensity] = useState<PreviewDensity>("comfortable");
  const [sampleSelected, setSampleSelected] = useState(false);
  const [foundationMessage, setFoundationMessage] = useState("");

  useEffect(() => {
    if (!foundationMessage) return;
    const timer = setTimeout(() => setFoundationMessage(""), 3200);
    return () => clearTimeout(timer);
  }, [foundationMessage]);

  useEffect(() => setDraft(appearance.accent), [appearance.accent]);

  const valid = /^#[\da-fA-F]{6}$/.test(draft);
  const updateAccent = (value: string) => {
    setDraft(value);
    if (/^#[\da-fA-F]{6}$/.test(value)) setAccent(value);
  };
  const currentFont =
    fontOptions.find((option) => option.id === appearance.font) ??
    fontOptions[0];
  const calmSpring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 360, damping: 34 };

  return (
    <div className="eg-appearance ap-screen">
      <header className="eg-ap-heading">
        <div className="eg-ap-title-copy">
          <p className="eg-ap-kicker">
            Workspace settings <span> / </span> Appearance
          </p>
          <h1>
            Make it yours<span className="eg-ap-accent-point">.</span>
          </h1>
          <p className="eg-ap-intro">
            A few small choices shape the feel of every session.
          </p>
        </div>
        <button
          className="eg-ap-reset"
          type="button"
          onClick={() => {
            resetAppearance();
            setDraft(defaultAppearance.accent);
          }}
        >
          <RotateCcw size={15} strokeWidth={1.6} aria-hidden="true" />
          <span>Reset</span>
        </button>
      </header>

      <div className="eg-ap-layout">
        <section className="eg-ap-controls" aria-label="Appearance controls">
          <section className="eg-ap-control" aria-labelledby="eg-ap-mode-title">
            <div className="eg-ap-section-head">
              <span className="eg-ap-index">01</span>
              <div>
                <h2 id="eg-ap-mode-title">Light</h2>
                <p>Set the canvas tone.</p>
              </div>
            </div>
            <Segmented
              label="Appearance mode"
              value={appearance.mode}
              onChange={setMode}
              options={[
                {
                  value: "light",
                  label: "Light",
                  icon: <Sun size={15} strokeWidth={1.6} aria-hidden="true" />,
                },
                {
                  value: "dark",
                  label: "Dark",
                  icon: <Moon size={15} strokeWidth={1.6} aria-hidden="true" />,
                },
              ]}
            />
          </section>

          <section
            className="eg-ap-control"
            aria-labelledby="eg-ap-accent-title"
          >
            <div className="eg-ap-section-head">
              <span className="eg-ap-index">02</span>
              <div>
                <h2 id="eg-ap-accent-title">Accent</h2>
                <p>Choose the color that marks what matters.</p>
              </div>
            </div>
            <div className="eg-ap-accent-tools">
              <label className="eg-ap-color-well" htmlFor="eg-ap-picker">
                <span
                  className="eg-ap-color-chip"
                  style={{ backgroundColor: appearance.accent }}
                  aria-hidden="true"
                />
                <span>Choose color</span>
                <input
                  id="eg-ap-picker"
                  type="color"
                  aria-label="Choose accent color"
                  value={appearance.accent}
                  onChange={(event) => updateAccent(event.target.value)}
                />
              </label>
              <label
                className={`eg-ap-hex${valid ? "" : " is-invalid"}`}
                htmlFor="eg-ap-hex-input"
              >
                <span aria-hidden="true">#</span>
                <TextInput
                  id="eg-ap-hex-input"
                  value={draft.startsWith("#") ? draft.slice(1) : draft}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateAccent(value.startsWith("#") ? value : `#${value}`);
                  }}
                  aria-label="Accent hex value"
                  aria-invalid={!valid}
                  aria-describedby="eg-ap-accent-feedback"
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={6}
                  inputMode="text"
                />
              </label>
            </div>
            <fieldset className="eg-ap-swatches">
              <legend className="visually-hidden">
                Suggested accent colors
              </legend>
              {accentSuggestions.map((swatch) => (
                <button
                  key={swatch.name}
                  type="button"
                  className="eg-ap-swatch"
                  aria-label={`Use ${swatch.name} accent ${swatch.value}`}
                  aria-pressed={
                    appearance.accent.toUpperCase() === swatch.value
                  }
                  title={`${swatch.name} · ${swatch.value}`}
                  onClick={() => updateAccent(swatch.value)}
                >
                  <span style={{ backgroundColor: swatch.value }} />
                </button>
              ))}
            </fieldset>
            <p
              id="eg-ap-accent-feedback"
              className={valid ? "eg-ap-feedback" : "eg-ap-feedback is-invalid"}
              aria-live="polite"
            >
              {valid
                ? `Current color · ${appearance.accent}`
                : "Use six hexadecimal digits. Your last valid color is still applied."}
            </p>
          </section>

          <section
            className="eg-ap-control eg-ap-font-control"
            aria-labelledby="eg-ap-font-title"
          >
            <div className="eg-ap-section-head">
              <span className="eg-ap-index">03</span>
              <div>
                <h2 id="eg-ap-font-title">Typography</h2>
                <p>Choose the voice of the interface.</p>
              </div>
            </div>
            <div
              className="eg-ap-font-list"
              role="radiogroup"
              aria-label="Font family"
            >
              {fontOptions.map((option) => {
                const selected = appearance.font === option.id;
                return (
                  <label
                    key={option.id}
                    className={`eg-ap-font-option${selected ? " is-selected" : ""}`}
                    style={{ "--eg-ap-font": option.family } as CSSProperties}
                  >
                    <input
                      type="radio"
                      name="ethereal-appearance-font"
                      value={option.id}
                      checked={selected}
                      onChange={() => setFont(option.id)}
                    />
                    <span className="eg-ap-radio" aria-hidden="true">
                      {selected && <Check size={13} strokeWidth={2} />}
                    </span>
                    <span className="eg-ap-font-meta">
                      <strong>{categories[option.id]}</strong>
                      <span>{option.name}</span>
                    </span>
                    <span className="eg-ap-type-sample" aria-hidden="true">
                      Aa 012
                    </span>
                    {selected && (
                      <motion.span
                        className="eg-ap-font-marker"
                        layoutId="eg-ap-font-marker"
                        transition={calmSpring}
                        aria-hidden="true"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </section>

          <p className="eg-ap-saved">
            <span aria-hidden="true">
              <Check size={12} strokeWidth={2} />
            </span>{" "}
            Saved automatically on this device
          </p>
        </section>

        <section
          className={`eg-ap-preview${density === "compact" ? " is-compact" : ""}`}
          aria-labelledby="eg-ap-preview-title"
        >
          <div className="eg-ap-preview-shell">
            <div className="eg-ap-preview-core">
              <header className="eg-ap-preview-head">
                <div>
                  <p className="eg-ap-preview-kicker">In context</p>
                  <h2 id="eg-ap-preview-title">Your workspace, in tune.</h2>
                </div>
                <fieldset
                  className="eg-ap-density"
                  aria-label="Preview density"
                >
                  <button
                    type="button"
                    aria-pressed={density === "comfortable"}
                    onClick={() => setDensity("comfortable")}
                  >
                    Roomy
                  </button>
                  <button
                    type="button"
                    aria-pressed={density === "compact"}
                    onClick={() => setDensity("compact")}
                  >
                    Compact
                  </button>
                </fieldset>
              </header>

              <div className="eg-ap-preview-summary" aria-live="polite">
                <span className="eg-ap-summary-color">
                  <i style={{ backgroundColor: appearance.accent }} />
                  {appearance.accent}
                </span>
                <span>
                  {appearance.mode === "dark" ? "Dark canvas" : "Light canvas"}
                </span>
                <span>{currentFont.name}</span>
              </div>

              <div className="eg-ap-specimens">
                <div className="eg-ap-specimen-main">
                  <BodyweightTrend
                    variant={density === "compact" ? "medium-graph" : "large"}
                  />
                </div>
                <div className="eg-ap-specimen-side">
                  <NutritionTargets compact={density === "compact"} />
                </div>
              </div>

              <div className="eg-ap-preview-profile">
                <div className="eg-ap-preview-person">
                  <Avatar initials="EA" size="md" />
                  <div>
                    <strong>Emma Anders</strong>
                    <span>Sample profile</span>
                  </div>
                </div>
                <StatusLabel status="on track" />
                <button
                  className={`eg-ap-preview-action${sampleSelected ? " is-selected" : ""}`}
                  type="button"
                  aria-pressed={sampleSelected}
                  onClick={() => setSampleSelected((selected) => !selected)}
                >
                  <span>{sampleSelected ? "Selected" : "View profile"}</span>
                  <span className="eg-ap-action-icon" aria-hidden="true">
                    <Check size={14} strokeWidth={1.7} />
                  </span>
                </button>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={`${appearance.mode}-${appearance.accent}-${appearance.font}`}
                  className="eg-ap-preview-note"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -2 }}
                  transition={calmSpring}
                >
                  Preview reflects your current choices.
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        </section>
      </div>

      <section
        className="eg-ap-foundations eg-foundations-group"
        id="foundations"
        aria-labelledby="eg-ap-foundations-title"
      >
        <div className="eg-ap-section-head">
          <span className="eg-ap-index">04</span>
          <div>
            <h2 id="eg-ap-foundations-title">Foundations</h2>
            <p>Type, health inputs and choice controls.</p>
          </div>
        </div>
        <FoundationComponents onNotify={setFoundationMessage} />
      </section>
      <div
        className="tl-toast"
        role="status"
        aria-live="polite"
        data-visible={Boolean(foundationMessage)}
      >
        {foundationMessage}
        <button
          type="button"
          aria-label="Dismiss message"
          onClick={() => setFoundationMessage("")}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
