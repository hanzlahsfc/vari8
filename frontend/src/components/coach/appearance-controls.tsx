"use client";
import { Check, Moon, Sun } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { normalizeHex } from "@/lib/ethereal-appearance";
import { Input as Vari8Input } from "../vari8/components";
import type { CoachState } from "./model";
import { Button } from "./ui";

type Preferences = CoachState["preferences"];

const ACCENT_SUGGESTIONS = ["#EB91B8", "#B5A1EA", "#96C9B7", "#E5BC88"];
const DEFAULT_ACCENT = "#EB91B8";
const MAX_FILE = 2 * 1024 * 1024;
const MAX_DIMENSION = 512;
const MAX_DATA_URL = 700000;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export function AppearanceControls({
  preferences,
  onChange,
}: {
  preferences: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
}) {
  const reduced = useReducedMotion();
  const [instant, setInstant] = useState(false);
  const [draft, setDraft] = useState(preferences.accent.slice(1));
  const [error, setError] = useState("");
  const [logoError, setLogoError] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const draftFocused = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadToken = useRef(0);

  useEffect(() => {
    if (!draftFocused.current) setDraft(preferences.accent.slice(1));
  }, [preferences.accent]);
  useEffect(
    () => () => {
      uploadToken.current += 1;
    },
    [],
  );

  const applyAccent = (normalized: string) => {
    setDraft(normalized.slice(1).toUpperCase());
    setError("");
    onChange({ accent: normalized.toUpperCase() });
  };

  const commitDraft = () => {
    const normalized = normalizeHex(draft.trim());
    if (normalized) {
      applyAccent(normalized);
    } else {
      setError("Enter 3 or 6 hexadecimal digits.");
    }
  };

  const onLogoFile = async (file: File | undefined) => {
    setLogoError("");
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setLogoError("Use a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > MAX_FILE) {
      setLogoError("Choose an image up to 2 MB.");
      return;
    }
    const token = ++uploadToken.current;
    setLogoBusy(true);
    try {
      const url = URL.createObjectURL(file);
      let image: HTMLImageElement;
      try {
        image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new window.Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("decode"));
          el.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
      const scale = Math.min(
        1,
        MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight, 1),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length > MAX_DATA_URL) throw new Error("size");
      if (token !== uploadToken.current) return;
      onChange({
        logo: {
          name: file.name.slice(0, 200) || "workspace-logo.png",
          dataUrl,
        },
      });
    } catch {
      if (token === uploadToken.current)
        setLogoError("That image could not be read. Try a different file.");
    } finally {
      if (token === uploadToken.current) setLogoBusy(false);
    }
  };

  return (
    <>
      <h3>Appearance</h3>
      <div className="cd-field">
        <span>Color mode</span>
        <button
          type="button"
          role="switch"
          className="cd-mode-switch"
          aria-label="Dark mode"
          aria-checked={preferences.mode === "dark"}
          onClick={(e) => {
            setInstant(e.detail === 0);
            onChange({ mode: preferences.mode === "dark" ? "light" : "dark" });
          }}
        >
          <motion.span
            className="cd-mode-thumb"
            aria-hidden="true"
            initial={false}
            animate={{
              transform:
                preferences.mode === "dark"
                  ? "translateX(100%)"
                  : "translateX(0%)",
            }}
            transition={
              reduced || instant
                ? { duration: 0 }
                : { type: "spring", duration: 0.22, bounce: 0 }
            }
          />
          <span
            className="cd-mode-opt"
            data-active={preferences.mode === "light" || undefined}
          >
            <Sun size={18} />
            Light
          </span>
          <span
            className="cd-mode-opt"
            data-active={preferences.mode === "dark" || undefined}
          >
            <Moon size={18} />
            Dark
          </span>
        </button>
      </div>
      <div className="cd-field">
        <span>Accent color</span>
        <div className="cd-accent-row">
          <input
            className="cd-accent-picker"
            type="color"
            aria-label="Choose accent color"
            value={normalizeHex(preferences.accent) ?? DEFAULT_ACCENT}
            onChange={(e) => applyAccent(e.target.value)}
          />
          <span className="cd-accent-group">
            <span className="cd-accent-hash" aria-hidden="true">
              #
            </span>
            <div className="cd-accent-hex-field">
              <Vari8Input
                label="Accent hex value"
                labelHidden
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
          <Button onClick={() => applyAccent(DEFAULT_ACCENT)}>
            Reset accent
          </Button>
        </div>
        {error && (
          <p id="cd-accent-error" className="cd-field-error" role="alert">
            {error}
          </p>
        )}
        <div className="cd-accents">
          {ACCENT_SUGGESTIONS.map((color) => (
            <button
              type="button"
              key={color}
              aria-label={`Accent ${color}`}
              aria-pressed={preferences.accent === color}
              style={{ background: color }}
              onClick={() => applyAccent(color)}
            >
              {preferences.accent === color && <Check size={17} />}
            </button>
          ))}
        </div>
      </div>

      <h3>Branding</h3>
      <div className="cd-field">
        <span>Workspace logo</span>
        <div className="cd-logo-preview">
          {preferences.logo ? (
            <span className="cd-logo-preview-img">
              <Image
                src={preferences.logo.dataUrl}
                alt="Workspace logo preview"
                fill
                unoptimized
                sizes="400px"
                style={{ objectFit: "contain" }}
              />
            </span>
          ) : (
            <span className="cd-logo-placeholder">No custom logo</span>
          )}
        </div>
        <span className="cd-field-hint">
          PNG, JPG or WebP, up to 2 MB. Saved in this browser only.
        </span>
        <div className="cd-accent-row">
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp"
            aria-label="Choose workspace logo file"
            disabled={logoBusy}
            onChange={(e) => {
              void onLogoFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button disabled={logoBusy} onClick={() => fileRef.current?.click()}>
            {logoBusy
              ? "Processing logo…"
              : preferences.logo
                ? "Replace logo"
                : "Upload logo"}
          </Button>
          {preferences.logo && (
            <Button
              disabled={logoBusy}
              onClick={() => {
                uploadToken.current += 1;
                setLogoError("");
                onChange({ logo: undefined });
              }}
            >
              Remove logo
            </Button>
          )}
        </div>
        {logoError && (
          <p className="cd-field-error" role="alert">
            {logoError}
          </p>
        )}
      </div>
    </>
  );
}
