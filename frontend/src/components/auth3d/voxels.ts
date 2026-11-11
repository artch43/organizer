import { MASCOT, MASCOT_SIZE, type MascotPose } from "../brand/pixels";

/** One cube: its center (grid units, y up, centered on the drawing) and color. */
export interface Voxel {
  x: number;
  y: number;
  z: number;
  color: string;
}

/** A group of cubes that moves together, with the point it turns around (its pivot). */
export interface VoxelGroup {
  voxels: Voxel[];
  /** Pivot in the mascot's space; `voxels` are relative to it. */
  pivot: [number, number, number];
}

const W = MASCOT_SIZE.w,
  H = MASCOT_SIZE.h;

/** Pixel (column, row from the top) → cube center, with the drawing centered and y pointing up. */
export const toSpace = (px: number, py: number): [number, number] => [px - W / 2 + 0.5, H / 2 - py - 0.5];

/**
 * The cubes of one layer of a pose: every pixel of every run, repeated `depth` times toward the
 * viewer starting at `z0` (z grows toward the camera).
 */
export function voxelsOf(pose: MascotPose, layer: string, depth: number, z0 = 0): Voxel[] {
  const runs = MASCOT[pose].find(([name]) => name === layer)?.[1];
  if (!runs) return [];
  const out: Voxel[] = [];
  for (const [x, y, w, color] of runs)
    for (let i = 0; i < w; i++) {
      const [sx, sy] = toSpace(x + i, y);
      for (let k = 0; k < depth; k++) out.push({ x: sx, y: sy, z: z0 + k, color });
    }
  return out;
}

/** Bottom-center (or a chosen anchor) of a set of cubes, and the cubes made relative to it. */
function grouped(voxels: Voxel[], anchor: "bottom" | "center" | "shoulder" = "bottom"): VoxelGroup {
  if (!voxels.length) return { voxels, pivot: [0, 0, 0] };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const v of voxels) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
  }
  const cx = (minX + maxX) / 2,
    cz = (minZ + maxZ) / 2;
  const py = anchor === "bottom" ? minY - 0.5 : anchor === "shoulder" ? maxY : (minY + maxY) / 2;
  const pivot: [number, number, number] = [cx, py, cz];
  return { voxels: voxels.map((v) => ({ ...v, x: v.x - cx, y: v.y - py, z: v.z - cz })), pivot };
}

/** How thick each part is, in cubes. The body is the deepest; the face sits one cube in front of it. */
export const DEPTH = { body: 4, card: 2, arm: 2, face: 1 } as const;
/** z of the body's front face row of cubes; the face details sit just in front of it. */
const BODY_Z = -DEPTH.body / 2 + 0.5;
const FACE_Z = BODY_Z + DEPTH.body;

/**
 * The mascot as animatable parts, taken straight from the approved pixel art (mascot v3):
 * the body and the three index cards (his "hair") from the folder pose, the waving arm frames from
 * the waving pose, the cheering arms from the cheering pose, and the face (eyes, blink, closed eyes,
 * mouth).
 */
export function buildMascot() {
  const arm = (pose: MascotPose, layer: string) => grouped(voxelsOf(pose, layer, DEPTH.arm, -0.5), "shoulder");
  const face = (pose: MascotPose, layer: string) => grouped(voxelsOf(pose, layer, DEPTH.face, FACE_Z), "center");
  return {
    body: grouped(voxelsOf("pasta", "body", DEPTH.body, BODY_Z)),
    cards: (["card-1", "card-2", "card-3"] as const).map((c) => grouped(voxelsOf("pasta", c, DEPTH.card, -0.5))),
    /** Both arms resting at his sides (the folder pose). */
    armsRest: arm("pasta", "arms"),
    armR: arm("acena", "arm-r"),
    waveA: arm("acena", "wave-a"),
    waveB: arm("acena", "wave-b"),
    cheerA: arm("comemora", "cheer-a"),
    cheerB: arm("comemora", "cheer-b"),
    sparkle: grouped(voxelsOf("comemora", "sparkle", 1, 0), "center"),
    eyes: face("acena", "eyes"),
    blink: face("acena", "blink"),
    eyesClosed: face("dorme", "eyes-closed"),
    mouth: face("acena", "mouth"),
  };
}
