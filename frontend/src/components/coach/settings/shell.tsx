"use client";
import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { processImageFile } from "../image-upload";
import type { CoachState } from "../model";
import { useCoach } from "../store";
import { Button, Surface } from "../ui";

export type Preferences = CoachState["preferences"];

export const SETTINGS_TABS = [
  { id: "profile", label: "Profile" },
  { id: "branding", label: "Branding" },
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "data", label: "Data" },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];
export const isSettingsTab = (value: string): value is SettingsTab =>
  SETTINGS_TABS.some((tab) => tab.id === value);
export const settingsTabLabel = (id: string) =>
  SETTINGS_TABS.find((tab) => tab.id === id)?.label;

/** Merge a patch into preferences; the profile, brand and notify groups
 * merge one level deep so a single field never wipes its siblings. */
export function patchPreferences(
  state: CoachState,
  patch: Partial<Preferences>,
): Preferences {
  const next = { ...state.preferences, ...patch };
  if (patch.profile)
    next.profile = { ...state.preferences.profile, ...patch.profile };
  if (patch.brand) next.brand = { ...state.preferences.brand, ...patch.brand };
  if (patch.notify)
    next.notify = { ...state.preferences.notify, ...patch.notify };
  return next;
}

export function usePatchPreferences() {
  const { setState } = useCoach();
  return useCallback(
    (patch: Partial<Preferences>) =>
      setState((s) => ({ ...s, preferences: patchPreferences(s, patch) })),
    [setState],
  );
}

/** Quiet per-card "Saved" marker, visible for about two seconds after a
 * committed change and announced politely. */
export function useSaved() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const mark = useCallback(() => {
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2000);
  }, []);
  return { saved, mark };
}

/** One settings card: title, quiet saved marker, one-line description and
 * its setting rows. */
export function SettingsCard({
  id,
  title,
  description,
  saved,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  saved?: boolean;
  children: ReactNode;
}) {
  return (
    <Surface className="cd-settings-card">
      <section aria-labelledby={`${id}-title`}>
        <header className="cd-settings-card-head">
          <h2 id={`${id}-title`}>{title}</h2>
          <span className="cd-settings-saved" aria-live="polite">
            {saved ? "Saved" : ""}
          </span>
        </header>
        {description && <p className="cd-settings-desc">{description}</p>}
        {children}
      </section>
    </Surface>
  );
}

/** Label and helper on the left, control on the right (stacked under 640 px
 * content width via CSS). */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="cd-settings-row">
      <div className="cd-settings-row-copy">
        <span className="cd-settings-row-label">{label}</span>
        {hint && <span className="cd-settings-row-hint">{hint}</span>}
      </div>
      <div className="cd-settings-row-control">{children}</div>
    </div>
  );
}

/** Text commit model: blur, Enter or 600 ms without typing commits the
 * draft; an external change refreshes an unfocused field. */
export function CommittedInput({
  label,
  value,
  onCommit,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const commit = () => {
    if (timer.current) clearTimeout(timer.current);
    if (draft !== value) onCommit(draft);
  };
  return (
    <div className="cd-field">
      <label className="cd-settings-input">
        <span>{label}</span>
        <input
          type="text"
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              if (e.target.value !== value) onCommit(e.target.value);
            }, 600);
          }}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
      </label>
    </div>
  );
}

/** Shared image slot: preview, upload/remove and the pipeline's inline
 * errors, used by both logo slots and the profile photo. */
export function ImageSlot({
  label,
  hint,
  image,
  square,
  background,
  onChange,
}: {
  label: string;
  hint?: string;
  image?: { name: string; dataUrl: string };
  square?: boolean;
  background?: "light" | "dark";
  onChange: (image?: { name: string; dataUrl: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const token = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      token.current += 1;
    },
    [],
  );
  const onFile = async (file: File | undefined) => {
    setError("");
    if (!file) return;
    const req = ++token.current;
    setBusy(true);
    const result = await processImageFile(file, {
      maxDimension: square ? 256 : 512,
      square,
    });
    if (req !== token.current) return;
    setBusy(false);
    if (result.error) setError(result.error);
    else if (result.image) onChange(result.image);
  };
  return (
    <div className="cd-settings-imageslot">
      <span
        className="cd-settings-imagepreview"
        data-background={background}
        data-square={square || undefined}
      >
        {image ? (
          <Image
            src={image.dataUrl}
            alt={`${label} preview`}
            fill
            unoptimized
            sizes="96px"
            style={{ objectFit: "contain" }}
          />
        ) : (
          <span className="cd-settings-imageempty">No image</span>
        )}
      </span>
      <div className="cd-settings-imageactions">
        {hint && <span className="cd-settings-row-hint">{hint}</span>}
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp"
          aria-label={`Choose ${label.toLowerCase()} file`}
          disabled={busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="cd-settings-imagebuttons">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "Processing…" : image ? "Replace" : "Upload"}
          </Button>
          {image && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                token.current += 1;
                setError("");
                onChange(undefined);
              }}
            >
              Remove
            </Button>
          )}
        </div>
        {error && (
          <span className="cd-field-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

/** Back button used by the phone drill-in. */
export function SettingsBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="cd-settings-back" onClick={onBack}>
      <ChevronLeft size={17} aria-hidden="true" />
      Settings
    </button>
  );
}
