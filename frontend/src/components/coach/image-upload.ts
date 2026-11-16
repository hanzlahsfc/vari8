"use client";

export type UploadedImage = { name: string; dataUrl: string };

const MAX_FILE = 2 * 1024 * 1024;
const MAX_DATA_URL = 700000;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export type ImageUploadResult =
  | { image: UploadedImage; error?: undefined }
  | { image?: undefined; error: string };

/** Shared workspace image pipeline: PNG/JPG/WebP up to 2 MB, decoded,
 * downscaled to `maxDimension` (or a centre-cropped square) and stored as a
 * data URL. Callers keep a request token so a stale upload cannot overwrite a
 * newer choice. */
export async function processImageFile(
  file: File | undefined,
  options: { maxDimension?: number; square?: boolean } = {},
): Promise<ImageUploadResult> {
  const maxDimension = options.maxDimension ?? 512;
  if (!file) return { error: "" };
  if (!ACCEPTED.includes(file.type))
    return { error: "Use a PNG, JPG or WebP image." };
  if (file.size > MAX_FILE) return { error: "Choose an image up to 2 MB." };
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
    let sourceX = 0;
    let sourceY = 0;
    let sourceW = image.naturalWidth;
    let sourceH = image.naturalHeight;
    if (options.square) {
      const side = Math.min(sourceW, sourceH);
      sourceX = Math.round((sourceW - side) / 2);
      sourceY = Math.round((sourceH - side) / 2);
      sourceW = sourceH = side;
    }
    const scale = Math.min(1, maxDimension / Math.max(sourceW, sourceH, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceW * scale));
    canvas.height = Math.max(1, Math.round(sourceH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const dataUrl = canvas.toDataURL("image/png");
    if (dataUrl.length > MAX_DATA_URL) throw new Error("size");
    return {
      image: {
        name: file.name.slice(0, 200) || "workspace-image.png",
        dataUrl,
      },
    };
  } catch {
    return { error: "That image could not be read. Try a different file." };
  }
}
