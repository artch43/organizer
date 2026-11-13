import { describe, expect, it } from "vitest";
import { place, type Placement, type Rect } from "./placement";

const view = { w: 1280, h: 800 };
const home: Rect = { x: 24, y: 800 - 24 - 132, w: 120, h: 132 };
const bubble = { w: 320, h: 150 };

const boxes = (p: Placement) => {
  const m = { x: p.x, y: p.y, w: home.w, h: home.h };
  const b = { x: p.x + p.bubble.x, y: p.y + p.bubble.y, ...bubble };
  return { m, b };
};
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, v = view) => r.x >= 0 && r.y >= 0 && r.x + r.w <= v.w && r.y + r.h <= v.h;

describe("onde o Clebinho fica no tour", () => {
  it("sem nada para apontar, fica no canto de baixo à esquerda, com o balão acima", () => {
    const p = place({ home, avoid: null, bubble, view });
    expect([p.x, p.y]).toEqual([home.x, home.y]);
    expect(p.bubble.side).toBe("above");
    expect(inside(boxes(p).b)).toBe(true);
  });

  const targets: Record<string, Rect> = {
    "aba no alto à esquerda": { x: 16, y: 12, w: 90, h: 40 },
    "botão no alto à direita": { x: 1180, y: 16, w: 80, h: 36 },
    "botão no meio": { x: 600, y: 380, w: 100, h: 40 },
    "botão embaixo à esquerda (onde ele mora)": { x: 30, y: 700, w: 120, h: 44 },
    "item no painel à direita": { x: 900, y: 300, w: 340, h: 70 },
  };
  for (const [name, t] of Object.entries(targets)) {
    it(`vai para perto de: ${name}, sem cobrir o alvo`, () => {
      const p = place({ home, avoid: t, bubble, view });
      const { m, b } = boxes(p);
      expect(hits(m, t)).toBe(false);
      expect(hits(b, t)).toBe(false);
      expect(hits(m, b)).toBe(false);
      expect(inside(m)).toBe(true);
      expect(inside(b)).toBe(true);
      // Next to it, not across the screen.
      const dx = Math.max(t.x - (m.x + m.w), 0, m.x - (t.x + t.w));
      const dy = Math.max(t.y - (m.y + m.h), 0, m.y - (t.y + t.h));
      expect(Math.hypot(dx, dy)).toBeLessThan(60);
    });
  }

  it("no celular, perto de uma aba da barra de baixo, com o balão acima dela", () => {
    const phone = { w: 390, h: 844 };
    const small: Rect = { x: 4, y: 700, w: 52, h: 58 };
    const wide = { w: 366, h: 170 };
    const tab: Rect = { x: 160, y: 776, w: 70, h: 56 };
    const p = place({ home: small, avoid: tab, bubble: wide, view: phone });
    const m = { x: p.x, y: p.y, w: small.w, h: small.h };
    const b = { x: p.x + p.bubble.x, y: p.y + p.bubble.y, ...wide };
    expect(hits(m, tab)).toBe(false);
    expect(hits(b, tab)).toBe(false);
    expect(inside(b, phone)).toBe(true);
  });
});
