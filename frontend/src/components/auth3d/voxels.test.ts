import { describe, expect, it } from "vitest";
import { MASCOT, MASCOT_SIZE } from "../brand/pixels";
import { DEPTH, buildMascot, toSpace, voxelsOf } from "./voxels";

const pixels = (pose: keyof typeof MASCOT, layer: string) =>
  (MASCOT[pose].find(([n]) => n === layer)?.[1] ?? []).reduce((n, [, , w]) => n + w, 0);

describe("mascote em voxels", () => {
  it("transforma cada pixel em uma coluna de cubos da profundidade pedida", () => {
    const v = voxelsOf("pasta", "body", 4);
    expect(v.length).toBe(pixels("pasta", "body") * 4);
    expect(voxelsOf("acena", "nao-existe", 2)).toEqual([]);
  });

  it("mantém as cores do pixel art", () => {
    const colors = new Set(voxelsOf("pasta", "body", 1).map((v) => v.color));
    const original = new Set((MASCOT.pasta.find(([n]) => n === "body")?.[1] ?? []).map((r) => r[3]));
    expect(colors).toEqual(original);
  });

  it("centraliza o desenho com y para cima", () => {
    expect(toSpace(0, 0)).toEqual([-MASCOT_SIZE.w / 2 + 0.5, MASCOT_SIZE.h / 2 - 0.5]);
    expect(toSpace(MASCOT_SIZE.w - 1, MASCOT_SIZE.h - 1)).toEqual([MASCOT_SIZE.w / 2 - 0.5, -MASCOT_SIZE.h / 2 + 0.5]);
  });

  it("monta as partes animáveis, cada uma em volta do seu pivô", () => {
    const m = buildMascot();
    expect(m.body.voxels.length).toBe(pixels("pasta", "body") * DEPTH.body);
    expect(m.cards).toHaveLength(3);
    for (const part of [m.armsRest, m.waveA, m.waveB, m.armR, m.cheerA, m.eyes, m.blink, m.eyesClosed, m.mouth])
      expect(part.voxels.length).toBeGreaterThan(0);
    // The body's pivot is at its feet: every cube sits above it.
    expect(Math.min(...m.body.voxels.map((v) => v.y))).toBeCloseTo(0.5);
    // The face is in front of the body.
    const bodyFront = Math.max(...m.body.voxels.map((v) => v.z + m.body.pivot[2]));
    expect(m.eyes.pivot[2]).toBeGreaterThan(bodyFront);
  });
});
