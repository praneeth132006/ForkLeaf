/**
 * Accent palettes.
 *
 * Light and dark are the *mode*; a palette is the accent worn on top of it.
 * The two are independent on purpose — someone who likes the sage accent likes
 * it at their desk and on a train, and making them re-pick it every time they
 * flip the mode would be busywork.
 *
 * Only four variables change between palettes. Every neutral — the background,
 * the surfaces, the borders, the text, the warning and danger colours — is
 * identical across all five, because those are what make the app legible and
 * they were chosen once. A palette is a mood, not a redesign.
 *
 * Applied as inline custom properties on `<html>` rather than as five near
 * identical CSS blocks. That is not a shortcut: the "custom" option has to work
 * the same way as the built-in ones, and a stylesheet cannot contain a colour
 * the user has not chosen yet. One code path serves both.
 */

export type PaletteId = "slate" | "lavender" | "sage" | "fog" | "taupe" | "custom";
export type ThemeMode = "light" | "dark";

/** The four variables a palette owns. */
export interface AccentVars {
  accent: string;
  hover: string;
  contrast: string;
  soft: string;
}

export interface Palette {
  id: Exclude<PaletteId, "custom">;
  name: string;
  /** One line on what it feels like, for the picker. */
  note: string;
  light: AccentVars;
  dark: AccentVars;
}

export const PALETTES: Palette[] = [
  {
    id: "slate",
    name: "Slate",
    note: "Cool blue-grey. The default.",
    light: {
      accent: "#3d5a78",
      hover: "#324a63",
      contrast: "#ffffff",
      soft: "rgba(61, 90, 120, 0.1)",
    },
    dark: {
      accent: "#8a9bb8",
      hover: "#9db0cc",
      contrast: "#0c1018",
      soft: "rgba(138, 155, 184, 0.14)",
    },
  },
  {
    id: "lavender",
    name: "Dusk Lavender",
    note: "Pulled toward violet, a little more character.",
    light: {
      accent: "#5d5490",
      hover: "#4c4478",
      contrast: "#ffffff",
      soft: "rgba(93, 84, 144, 0.1)",
    },
    dark: {
      accent: "#9b93c2",
      hover: "#ada6cf",
      contrast: "#100e1a",
      soft: "rgba(155, 147, 194, 0.14)",
    },
  },
  {
    id: "sage",
    name: "Sage Slate",
    note: "Green-grey. Quiet and organic.",
    light: {
      accent: "#476b5c",
      hover: "#38574a",
      contrast: "#ffffff",
      soft: "rgba(71, 107, 92, 0.1)",
    },
    dark: {
      accent: "#97b0a8",
      hover: "#a9c0b9",
      contrast: "#0d1310",
      soft: "rgba(151, 176, 168, 0.14)",
    },
  },
  {
    id: "fog",
    name: "Fog Blue",
    note: "Cooler and more restrained than Slate.",
    light: {
      accent: "#35577a",
      hover: "#2a4763",
      contrast: "#ffffff",
      soft: "rgba(53, 87, 122, 0.1)",
    },
    dark: {
      accent: "#7d93ad",
      hover: "#90a6c0",
      contrast: "#0a0f16",
      soft: "rgba(125, 147, 173, 0.13)",
    },
  },
  {
    id: "taupe",
    name: "Warm Taupe",
    note: "Pulled slightly warm. The softest of the set.",
    light: {
      accent: "#7a5f42",
      hover: "#644d35",
      contrast: "#ffffff",
      soft: "rgba(122, 95, 66, 0.1)",
    },
    dark: {
      accent: "#a89b8f",
      hover: "#bcaea1",
      contrast: "#14100c",
      soft: "rgba(168, 155, 143, 0.14)",
    },
  },
];

export const DEFAULT_PALETTE: PaletteId = "slate";

/** A palette by id, falling back to the default rather than to nothing. */
export function paletteById(id: string | null | undefined): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0]!;
}

// ─── Custom accents ─────────────────────────────────────────────────────────

/** What a custom accent is stored as: the chosen colour, and both modes of it. */
export interface CustomAccent {
  hex: string;
  light: AccentVars;
  dark: AccentVars;
}

/** `#abc` and `#aabbcc`, with or without the hash. */
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHex(value: string): boolean {
  return HEX.test(value.trim());
}

/** Normalises any accepted spelling to `#rrggbb`. */
export function normalizeHex(value: string): string | null {
  const match = HEX.exec(value.trim());
  if (!match) return null;

  const digits = match[1]!.toLowerCase();
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits;

  return `#${full}`;
}

function toRgb(hex: string): [number, number, number] {
  const full = normalizeHex(hex) ?? "#000000";
  return [
    parseInt(full.slice(1, 3), 16),
    parseInt(full.slice(3, 5), 16),
    parseInt(full.slice(5, 7), 16),
  ];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Mixes toward white (`amount` > 0) or black (`amount` < 0). */
function shift(hex: string, amount: number): string {
  const [r, g, b] = toRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return toHex([r + (target - r) * t, g + (target - g) * t, b + (target - b) * t]);
}

/** Relative luminance, for deciding what text sits legibly on a colour. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const channel = v / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Builds a full accent set from one colour the user picked.
 *
 * The hover and the contrast are derived rather than asked for. Nobody wants
 * to choose four colours, and the two that matter for legibility — the text on
 * an accent-filled button, and the hover state — are exactly the two people
 * get wrong. Contrast is picked by luminance, so a pale accent gets dark text
 * and a deep one gets light text, instead of white-on-yellow.
 */
export function accentVarsFrom(hex: string, mode: ThemeMode): AccentVars {
  const accent = normalizeHex(hex) ?? "#8a9bb8";
  const [r, g, b] = toRgb(accent);

  return {
    accent,
    // Hover moves away from the background: lighter on dark, darker on light,
    // so it reads as "raised" in both.
    hover: shift(accent, mode === "dark" ? 0.14 : -0.14),
    contrast: luminance(accent) > 0.45 ? shift(accent, -0.88) : "#ffffff",
    soft: `rgba(${r}, ${g}, ${b}, ${mode === "dark" ? 0.14 : 0.1})`,
  };
}

export function customAccentFrom(hex: string): CustomAccent | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  return {
    hex: normalized,
    light: accentVarsFrom(normalized, "light"),
    dark: accentVarsFrom(normalized, "dark"),
  };
}

// ─── Applying ───────────────────────────────────────────────────────────────

/** The CSS custom property each field maps to. */
export const ACCENT_PROPERTIES: Record<keyof AccentVars, string> = {
  accent: "--fl-accent",
  hover: "--fl-accent-hover",
  contrast: "--fl-accent-contrast",
  soft: "--fl-accent-soft",
};

/** Writes an accent set onto an element's inline style. */
export function applyAccent(element: HTMLElement, vars: AccentVars): void {
  for (const [field, property] of Object.entries(ACCENT_PROPERTIES)) {
    element.style.setProperty(property, vars[field as keyof AccentVars]);
  }
}

/** The accent set a palette id resolves to, for a mode. */
export function accentFor(id: PaletteId, mode: ThemeMode, custom: CustomAccent | null): AccentVars {
  if (id === "custom") return custom?.[mode] ?? paletteById(DEFAULT_PALETTE)[mode];
  return paletteById(id)[mode];
}
