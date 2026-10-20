const DEFAULT_ACCENT = "#EB91B8";
const MIN_TEXT_CONTRAST = 4.5;
const MAX_WHITE_DARKENING = 0.06;
const WHITE = "#FFFFFF";
const BLACK = "#000000";

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

export function accentControlColors(value: string) {
  const accent = normalizeColor(value);
  let background = accent;
  let foreground = BLACK;
  if (contrastRatio(accent, WHITE) >= MIN_TEXT_CONTRAST) {
    foreground = WHITE;
  } else if (
    contrastRatio(mix(accent, BLACK, MAX_WHITE_DARKENING), WHITE) >=
    MIN_TEXT_CONTRAST
  ) {
    foreground = WHITE;
    let low = 0;
    let high = MAX_WHITE_DARKENING;
    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2;
      if (contrastRatio(mix(accent, BLACK, middle), WHITE) >= MIN_TEXT_CONTRAST)
        high = middle;
      else low = middle;
    }
    background = mix(accent, BLACK, high);
  }
  const hoverBackground = mix(
    background,
    foreground === WHITE ? BLACK : WHITE,
    foreground === WHITE ? 0.06 : 0.08,
  );
  return { background, hoverBackground, foreground };
}
