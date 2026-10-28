const DEFAULT_ACCENT = "#EB91B8";
const MIN_TEXT_CONTRAST = 4.5;
const WHITE = "#FFFFFF";
const BLACK = "#000000";
const MIN_SURFACE_CONTRAST = 3;

function normalizeColor(value: string) {
  const raw = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw))
    return `#${[...raw].map((digit) => digit.repeat(2)).join("")}`.toUpperCase();
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw}`.toUpperCase() : DEFAULT_ACCENT;
}

function channels(color: string) {
  return [1, 3, 5].map((index) =>
    Number.parseInt(color.slice(index, index + 2), 16),
  );
}

function luminance(color: string) {
  const [red, green, blue] = channels(normalizeColor(color)).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function contrastRatio(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mix(color: string, destination: string, amount: number) {
  const target = channels(destination);
  return `#${channels(color)
    .map((channel, index) =>
      Math.round(channel + (target[index] - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

export function accentControlColors(value: string, surfaces: string[] = []) {
  const accent = normalizeColor(value);
  const candidates: { background: string; amount: number }[] = [
    { background: accent, amount: 0 },
  ];
  for (const destination of [BLACK, WHITE]) {
    for (let step = 1; step <= 200; step += 1) {
      const amount = step / 200;
      candidates.push({ background: mix(accent, destination, amount), amount });
    }
  }
  const isReadable = (background: string) => {
    const foregroundContrast = Math.max(
      contrastRatio(background, WHITE),
      contrastRatio(background, BLACK),
    );
    return (
      foregroundContrast >= MIN_TEXT_CONTRAST &&
      surfaces.every(
        (surface) => contrastRatio(background, surface) >= MIN_SURFACE_CONTRAST,
      )
    );
  };
  const background =
    candidates
      .filter((candidate) => isReadable(candidate.background))
      .sort((first, second) => first.amount - second.amount)[0]?.background ??
    (contrastRatio(accent, WHITE) >= contrastRatio(accent, BLACK)
      ? WHITE
      : BLACK);
  const foreground =
    contrastRatio(background, WHITE) >= contrastRatio(background, BLACK)
      ? WHITE
      : BLACK;
  const hoverCandidates = [
    mix(background, foreground === WHITE ? BLACK : WHITE, 0.04),
    mix(background, foreground === WHITE ? BLACK : WHITE, 0.08),
    mix(background, foreground, 0.04),
  ];
  const hoverBackground = hoverCandidates.find(isReadable) ?? background;
  return { background, hoverBackground, foreground };
}
