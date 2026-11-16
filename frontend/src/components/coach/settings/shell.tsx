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
import { Input } from "../../vari8/components";
import { coachThemeStyle } from "../coach-theme";
import { processImageFile } from "../image-upload";
import type { CoachState } from "../model";
import { useCoach } from "../store";
import { Button, Surface } from "../ui";
import { acknowledgeValue, decideCommit } from "./committed";

export type Preferences = CoachState["preferences"];

export {
  isSettingsTab,
  resolveSettingsTab,
  SETTINGS_TABS,
  type SettingsTab,
  settingsTabLabel,
} from "./tabs";

/** Narrow layout flag for the Settings drill-in. Starts false so the
 * server and first client render agree; the real width applies after
 * hydration and stays live on resize. */
export function useNarrowSettings() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

/** Merge a patch into preferences; the profile, brand, notify, region and
 * rules groups merge one level deep so a single field never wipes its
 * siblings. */
export function patchPreferences(
  state: CoachState,
  patch: Partial<Preferences>,
): Preferences {
  const next = { ...state.preferences, ...patch };
  for (const key of ["profile", "brand", "notify", "region", "rules"] as const)
    if (patch[key])
      next[key] = { ...state.preferences[key], ...patch[key] } as never;
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

/** Shared text field with commit-on-blur/Enter/debounce semantics: blur,
 * Enter or 600 ms without typing commits the draft through `normalize`
 * (default identity) so the stored echo is recognised as our own write.
 * Enter-then-blur never saves twice, and a draft can never overwrite a
 * value that changed under it — a stale draft is resynced instead. The
 * reconciliation rules live in committed.ts and are unit-tested. */
export function CommittedInput({
  label,
  hint,
  value,
  onCommit,
  normalize,
  maxLength,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onCommit: (value: string) => void;
  normalize?: (value: string) => string;
  maxLength?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const external = useRef(false);
  const lastSent = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalizeRef = useRef(normalize);
  normalizeRef.current = normalize;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // Sync the field from the stored value. Our own commit echo is dropped;
  // a different value while editing marks the draft stale so a later blur
  // cannot clobber the newer write.
  useEffect(() => {
    const ack = acknowledgeValue({
      value,
      lastSent: lastSent.current,
      focused: focused.current,
    });
    if (ack.kind === "own") lastSent.current = null;
    else if (ack.kind === "external") external.current = true;
    else setDraft(value);
  }, [value]);
  const commit = (next: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const outcome = decideCommit({
      draft: next,
      value,
      lastSent: lastSent.current,
      external: external.current,
      normalize: normalizeRef.current,
    });
    if (outcome.action === "discard") {
      external.current = false;
      setDraft(value);
    } else if (outcome.action === "save") {
      lastSent.current = outcome.submitted;
      onCommit(outcome.submitted);
    }
  };
  return (
    <Input
      label={label}
      hint={hint}
      type="text"
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(next), 600);
      }}
      onBlur={() => {
        focused.current = false;
        commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(draft);
        }
      }}
    />
  );
}

/** Shared image slot: preview, upload/remove and the pipeline's inline
 * errors, used by both logo slots and the profile photo. Logo slots can
 * pin the preview to a literal light or dark theme frame so the mark is
 * inspected against the background it is meant for. */
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
  const { state } = useCoach();
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
        className="cd-settings-imagepreview v8-theme"
        data-mode={background}
        data-square={square || undefined}
        style={
          background
            ? coachThemeStyle({ ...state.preferences, mode: background })
            : undefined
        }
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
