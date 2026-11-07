import { describe, expect, it } from "vitest";
import { PIXEL_CATEGORIES, PIXEL_GRID, PIXEL_ICONS, PIXEL_PALETTE, UI_ICONS, centered, toRuns } from "./pixelIcons";
import { makePixelIcon, parseIcon } from "../icons";

describe("ícones em pixel art", () => {
  const entries = Object.entries(PIXEL_ICONS);

  it("tem vários desenhos em cada categoria", () => {
    for (const c of PIXEL_CATEGORIES) expect(entries.filter(([, d]) => d.category === c.id).length).toBeGreaterThanOrEqual(8);
  });

  it("cada desenho cabe na grade 12×12 e só usa cores da paleta", () => {
    for (const [key, d] of entries) {
      expect(d.rows.length, key).toBeLessThanOrEqual(PIXEL_GRID);
      for (const row of d.rows) {
        expect(row.length, `${key}: "${row}"`).toBe(PIXEL_GRID);
        for (const ch of row) expect(ch === "." || ch in PIXEL_PALETTE, `${key}: letra "${ch}"`).toBe(true);
      }
      expect(centered(d.rows)).toHaveLength(PIXEL_GRID);
    }
  });

  it("os botões de criar são 16×16", () => {
    for (const rows of Object.values(UI_ICONS)) {
      expect(rows).toHaveLength(16);
      for (const row of rows) expect(row).toHaveLength(16);
    }
  });

  it("junta pixels vizinhos da mesma cor numa faixa", () => {
    expect(toRuns(["kkw."], { k: "#000", w: "#fff" })).toEqual([
      [0, 0, 2, "#000"],
      [2, 0, 1, "#fff"],
    ]);
  });

  it("guarda e reconhece o ícone de uma lista", () => {
    expect(parseIcon(makePixelIcon("casa"))).toEqual({ kind: "pixel", key: "casa" });
    // An unknown drawing falls back to the old reading (not a pixel icon).
    expect(parseIcon("pixel:nao-existe").kind).not.toBe("pixel");
  });
});
