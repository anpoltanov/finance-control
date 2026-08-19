export function parseHex(color: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!color) return null;
  let value = color.trim();
  if (!value.startsWith("#")) value = `#${value}`;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  const match = /^#([0-9a-fA-F]{6})$/.exec(value);
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function tintedSurface(color: string, alpha = 0.16): string {
  const rgb = parseHex(color);
  if (!rgb) return "var(--surface)";
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function tintedFill(color: string, alpha = 0.28): string {
  const rgb = parseHex(color);
  if (!rgb) return "var(--surface2)";
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}
