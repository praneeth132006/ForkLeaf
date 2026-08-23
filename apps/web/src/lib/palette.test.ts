import { describe, expect, it } from "vitest";
import {
  DEFAULT_PALETTE,
  PALETTES,
  accentFor,
  accentVarsFrom,
  customAccentFrom,
  normalizeHex,
  paletteById,
} from "./palette";

describe("PALETTES", () => {
  it("gives every palette both modes and four variables", () => {
    for (const palette of PALETTES) {
      for (const mode of ["light", "dark"] as const) {
        const vars = palette[mode];
        expect(vars.accent, `${palette.id} ${mode}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(vars.hover, `${palette.id} ${mode}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(vars.contrast, `${palette.id} ${mode}`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(vars.soft, `${palette.id} ${mode}`).toMatch(/^rgba\(/);
      }
    }
  });

  it("has unique ids and names", () => {
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
    expect(new Set(PALETTES.map((p) => p.name)).size).toBe(PALETTES.length);
  });
});

describe("paletteById", () => {
  it("falls back to the default rather than to nothing", () => {
    expect(paletteById("nonsense").id).toBe(DEFAULT_PALETTE);
    expect(paletteById(null).id).toBe(DEFAULT_PALETTE);
    expect(paletteById("sage").id).toBe("sage");
  });
});

describe("normalizeHex", () => {
  it("accepts every spelling people actually type", () => {
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
    expect(normalizeHex("aabbcc")).toBe("#aabbcc");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("  #abc  ")).toBe("#aabbcc");
  });

  it("rejects what is not a colour", () => {
    for (const bad of ["", "#", "#ab", "#abcd", "red", "#gggggg", "rgb(1,2,3)"]) {
      expect(normalizeHex(bad), bad).toBeNull();
    }
  });
});

describe("accentVarsFrom", () => {
  it("moves hover away from the background in each mode", () => {
    // Lighter on dark, darker on light — so hover reads as raised in both.
    const dark = accentVarsFrom("#808080", "dark");
    const light = accentVarsFrom("#808080", "light");

    expect(Number.parseInt(dark.hover.slice(1, 3), 16)).toBeGreaterThan(0x80);
    expect(Number.parseInt(light.hover.slice(1, 3), 16)).toBeLessThan(0x80);
  });

  it("picks legible text for the accent, by luminance", () => {
    // A pale accent needs dark text; white-on-yellow is the failure this
    // exists to prevent.
    expect(accentVarsFrom("#ffe066", "dark").contrast).not.toBe("#ffffff");
    expect(accentVarsFrom("#1a2b3c", "dark").contrast).toBe("#ffffff");
  });

  it("builds a soft tint from the same colour", () => {
    expect(accentVarsFrom("#8a9bb8", "dark").soft).toBe("rgba(138, 155, 184, 0.14)");
    expect(accentVarsFrom("#8a9bb8", "light").soft).toBe("rgba(138, 155, 184, 0.1)");
  });

  it("falls back rather than emitting an invalid colour", () => {
    expect(accentVarsFrom("not a colour", "dark").accent).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("customAccentFrom", () => {
  it("resolves both modes at once, so switching mode needs no arithmetic later", () => {
    const custom = customAccentFrom("#c0ffee")!;
    expect(custom.hex).toBe("#c0ffee");
    expect(custom.light.accent).toBe("#c0ffee");
    expect(custom.dark.accent).toBe("#c0ffee");
    expect(custom.light.soft).not.toBe(custom.dark.soft);
  });

  it("returns null for a colour that will not parse", () => {
    expect(customAccentFrom("nope")).toBeNull();
  });
});

describe("accentFor", () => {
  it("resolves a named palette per mode", () => {
    expect(accentFor("sage", "dark", null).accent).toBe("#97b0a8");
    expect(accentFor("sage", "light", null).accent).toBe("#476b5c");
  });

  it("uses the stored custom accent when one is set", () => {
    const custom = customAccentFrom("#123456");
    expect(accentFor("custom", "dark", custom).accent).toBe("#123456");
  });

  it("falls back to the default when custom is selected but unset", () => {
    // Storage cleared, or a half-written value: the app must still have an
    // accent rather than rendering with the variables unset.
    expect(accentFor("custom", "dark", null).accent).toBe(paletteById("slate").dark.accent);
  });
});
