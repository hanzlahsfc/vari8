"use client";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { normalizeHex } from "@/lib/ethereal-appearance";
import {
  SegmentedControl,
  Tooltip,
  Input as Vari8Input,
} from "../../vari8/components";
import { coachThemeStyle, DEFAULT_ACCENT } from "../coach-theme";
import { useCoach } from "../store";
import { Button } from "../ui";
import {
  CommittedInput,
  ImageSlot,
  SettingRow,
  SettingsCard,
  usePatchPreferences,
  useSaved,
} from "./shell";

export const DEFAULT_BRAND_NAME = "infinity.";
export const ACCENT_PRESETS = [
  { name: "Platinum", hex: "#C9CCD3" },
  { name: "Signal red", hex: "#E5484D" },
  { name: "Ember orange", hex: "#F76B15" },
  { name: "Stage gold", hex: "#D4AF37" },
  { name: "Volt", hex: "#BDEE63" },
  { name: "Teal", hex: "#12A594" },
  { name: "Electric blue", hex: "#3E63DD" },
  { name: "Violet", hex: "#8E4EC6" },
] as const;

/** The brand color control: picker, custom hex field, named presets and a
 * reset to the Platinum default. Moved from the old preferences dialog. */
function AccentControl({ onChanged }: { onChanged: () => void }) {
  const { state, setState } = useCoach();
  const accent = state.preferences.accent;
  const [draft, setDraft] = useState(accent.slice(1));
  const [error, setError] = useState("");
  const draftFocused = useRef(false);
  useEffect(() => {
    if (!draftFocused.current) setDraft(accent.slice(1));
  }, [accent]);
  const applyAccent = (normalized: string) => {
    setDraft(normalized.slice(1).toUpperCase());
    setError("");
    setState((s) => ({
      ...s,
      preferences: {
        ...s.preferences,
        accent: normalized.toUpperCase(),
      },
    }));
    onChanged();
  };
  const commitDraft = () => {
    const normalized = normalizeHex(draft.trim());
    if (normalized) applyAccent(normalized);
    else setError("Enter 3 or 6 hexadecimal digits.");
  };
  const current = ACCENT_PRESETS.find((preset) => preset.hex === accent);
  return (
    <>
      <div className="cd-accent-row">
        <input
          className="cd-accent-picker"
          type="color"
          aria-label="Choose brand color"
          value={normalizeHex(accent) ?? DEFAULT_ACCENT}
          onChange={(e) => applyAccent(e.target.value)}
        />
        <span className="cd-accent-group">
          <span className="cd-accent-hash" aria-hidden="true">
            #
          </span>
          <div className="cd-accent-hex-field">
            <Vari8Input
              label="Brand color hex value"
              aria-invalid={!!error}
              aria-describedby={error ? "cd-accent-error" : undefined}
              className="cd-accent-hex"
              spellCheck={false}
              maxLength={7}
              value={draft}
              onFocus={() => {
                draftFocused.current = true;
              }}
              onChange={(e) => {
                const raw = e.target.value.replace(/^#/, "");
                setDraft(raw);
                setError("");
                if (raw.trim().length === 6) {
                  const normalized = normalizeHex(raw.trim());
                  if (normalized) applyAccent(normalized);
                }
              }}
              onBlur={() => {
                draftFocused.current = false;
                commitDraft();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraft();
                }
              }}
            />
          </div>
        </span>
        <Button onClick={() => applyAccent(DEFAULT_ACCENT)}>Reset color</Button>
      </div>
      {error && (
        <p id="cd-accent-error" className="cd-field-error" role="alert">
          {error}
        </p>
      )}
      <div className="cd-accents">
        {ACCENT_PRESETS.map((preset) => (
          <Tooltip key={preset.hex} label={`${preset.name}, ${preset.hex}`}>
            <button
              type="button"
              aria-label={`Brand color ${preset.name}`}
              aria-pressed={accent === preset.hex}
              style={{ background: preset.hex }}
              onClick={() => applyAccent(preset.hex)}
            >
              {accent === preset.hex && <Check size={17} />}
            </button>
          </Tooltip>
        ))}
        {!current && (
          <Tooltip label={`Custom, ${accent}`}>
            <button
              type="button"
              aria-label={`Brand color custom ${accent}`}
              aria-pressed="true"
              style={{ background: accent }}
            >
              <Check size={17} />
            </button>
          </Tooltip>
        )}
      </div>
    </>
  );
}

/** Small render of what the accent looks like in either app and mode:
 * brand block, primary action, selected chip and progress bar. */
function BrandPreview() {
  const { state } = useCoach();
  const [app, setApp] = useState<"coach" | "athlete">("coach");
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const prefs = { ...state.preferences, mode };
  const logo =
    mode === "light"
      ? (state.preferences.brand?.logoLight ?? state.preferences.logo)
      : state.preferences.logo;
  const brand = state.preferences.brand?.name || DEFAULT_BRAND_NAME;
  return (
    <div className="cd-brandpreview">
      <div className="cd-brandpreview-controls">
        <SegmentedControl
          label="Preview app"
          value={app}
          onValueChange={(value) => setApp(value as "coach" | "athlete")}
          options={[
            { value: "coach", label: "Coach workspace" },
            { value: "athlete", label: "Athlete app" },
          ]}
        />
        <SegmentedControl
          label="Preview mode"
          value={mode}
          onValueChange={(value) => setMode(value as "light" | "dark")}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </div>
      <div
        className="cd-brandpreview-frame v8-theme"
        data-mode={mode}
        data-app={app}
        style={coachThemeStyle(prefs)}
      >
        <div className="cd-brandpreview-brand">
          {logo ? (
            // biome-ignore lint/performance/noImgElement: demo image previews are dynamic data srcs
            <img
              src={logo.dataUrl}
              alt={`${brand} logo`}
              className="cd-brandpreview-logo"
            />
          ) : (
            <span className="cd-brandpreview-wordmark">{brand}</span>
          )}
        </div>
        {app === "coach" ? (
          <div className="cd-brandpreview-nav">
            <span className="cd-brandpreview-navitem" data-active>
              Dashboard
            </span>
            <span className="cd-brandpreview-navitem">Clients</span>
            <span className="cd-brandpreview-navitem">Check-ins</span>
          </div>
        ) : (
          <div className="cd-brandpreview-nav">
            <span className="cd-brandpreview-navitem" data-active>
              Home
            </span>
            <span className="cd-brandpreview-navitem">Plan</span>
            <span className="cd-brandpreview-navitem">Messages</span>
          </div>
        )}
        <div className="cd-brandpreview-body">
          <span className="cd-brandpreview-chip" data-selected>
            Training day
          </span>
          <span className="cd-brandpreview-chip">Rest day</span>
          <button type="button" className="cd-brandpreview-action">
            {app === "coach" ? "Save" : "Log session"}
          </button>
          <span
            className="cd-brandpreview-progress"
            role="progressbar"
            aria-label="Example progress"
            aria-valuenow={62}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: "62%" }} />
          </span>
        </div>
      </div>
    </div>
  );
}

export function BrandingSettings() {
  const { state } = useCoach();
  const patch = usePatchPreferences();
  const { saved, mark } = useSaved();
  const brand = state.preferences.brand;
  return (
    <>
      <SettingsCard
        id="settings-branding"
        title="Branding"
        description="What athletes see in their app. Your workspace uses the same color. Athletes can switch between light and dark, but always see your logo and color."
        saved={saved}
      >
        <CommittedInput
          label="Business name"
          value={brand?.name ?? DEFAULT_BRAND_NAME}
          maxLength={80}
          onCommit={(name) => {
            patch({ brand: { name: name.trim() || DEFAULT_BRAND_NAME } });
            mark();
          }}
        />
        <SettingRow
          label="Logo for dark backgrounds"
          hint="PNG, JPG or WebP, up to 2 MB. Saved in this browser only."
        >
          <ImageSlot
            label="Logo for dark backgrounds"
            background="dark"
            image={state.preferences.logo}
            onChange={(logo) => {
              patch({ logo });
              mark();
            }}
          />
        </SettingRow>
        <SettingRow
          label="Logo for light backgrounds"
          hint={
            brand?.logoLight
              ? "Shown on light backgrounds in both apps."
              : "Without a light version, the dark-background logo is used on light backgrounds too."
          }
        >
          <ImageSlot
            label="Logo for light backgrounds"
            background="light"
            image={brand?.logoLight}
            onChange={(logoLight) => {
              patch({ brand: { logoLight } });
              mark();
            }}
          />
        </SettingRow>
        <SettingRow label="Brand color" hint="Used in both apps.">
          <AccentControl onChanged={mark} />
        </SettingRow>
      </SettingsCard>
      <SettingsCard
        id="settings-brand-preview"
        title="Preview"
        description="Check the color and logos before athletes see them."
      >
        <BrandPreview />
      </SettingsCard>
    </>
  );
}
