import { describe, expect, it, vi } from "vitest";
import { ACCENTS, accentVars, contrast, applyAccent } from "./appearance";

const LIGHT_BG = ["#ffffff", "#ffffff"],
  DARK_BG = ["#1a1b1e", "#222327"];
const tricky = ["#ffeb3b", "#f9a8d4", "#a3e635", "#fefefe", "#000000", "#7f7f7f", "#00ffff"];

describe("cor de destaque", () => {
  for (const hex of [...ACCENTS.map((a) => a.hex), ...tricky])
    it(`mantém contraste AA com ${hex}`, () => {
      const { light, dark } = accentVars(hex);
      // Button label on the button.
      expect(contrast(light["--primary-foreground"], light["--primary"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark["--primary-foreground"], dark["--primary"])).toBeGreaterThanOrEqual(4.5);
      // Accent-colored text on the page, cards and the highlighted menu item.
      for (const bg of [...LIGHT_BG, light["--sidebar-accent"]])
        expect(contrast(light["--primary-strong"], bg)).toBeGreaterThanOrEqual(4.5);
      for (const bg of [...DARK_BG, dark["--sidebar-accent"]])
        expect(contrast(dark["--primary-strong"], bg)).toBeGreaterThanOrEqual(4.5);
      // Focus ring / borders visible on the page (3:1 for non-text).
      for (const bg of LIGHT_BG) expect(contrast(light["--ring"], bg)).toBeGreaterThanOrEqual(3);
      for (const bg of DARK_BG) expect(contrast(dark["--ring"], bg)).toBeGreaterThanOrEqual(3);
    });
});


describe("accent overrides", () => {
  it("overrides the light sidebar and exposes the selected surface text color", () => {
    const tag = { textContent: "" };
    vi.stubGlobal("document", { getElementById: () => tag });
    try {
      applyAccent("#15803d");
      expect(tag.textContent).toContain(":root:not(.dark) .ink{");
      expect(tag.textContent).toContain(`--selected-primary-strong:${accentVars("#15803d").light["--primary-strong"]}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
