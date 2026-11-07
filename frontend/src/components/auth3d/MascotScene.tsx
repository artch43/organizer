import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { buildMascot, type VoxelGroup } from "./voxels";
import { useAuthMood } from "./mood";

/*
 * The sign-in screen's 3D mascot: the approved pixel-art mascot rebuilt as cubes (voxels).
 * On arrival his cubes fly in from every side and click into place, he lands with a little squash,
 * waves, blinks and fans his index cards; then he breathes, blinks now and then, follows the pointer
 * and reacts to the form (curious on the e-mail, eyes shut on the password, shakes his head on an
 * error, jumps and cheers on success or when clicked).
 */

const CUBE = new THREE.BoxGeometry(0.94, 0.94, 0.94);
const ASSEMBLE_MS = 1500;
const LAND_MS = 260;
const HELLO_MS = 2300;
const WAVE_FRAME_MS = 170;

const easeOutBack = (t: number) => {
  const c1 = 1.5,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Frame-rate independent smoothing toward a target. */
const damp = (from: number, to: number, speed: number, dt: number) => from + (to - from) * (1 - Math.exp(-speed * dt));

/** The page's accent color (lime in dark mode, pink in light), followed when the theme changes. */
function useAccent() {
  const read = () => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#c6ff3d";
  const [accent, setAccent] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setAccent(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => mo.disconnect();
  }, []);
  return accent;
}

/** Shared timing: when the scene started, and whether the arrival is skipped (reduced motion). */
interface Clock {
  start: number;
  reduced: boolean;
}

/**
 * A set of cubes drawn as one instanced mesh. During the arrival every cube flies in from a random
 * point on a sphere (bottom rows first) and lands with a slight overshoot; after that the matrices
 * never change again (the parts move as whole groups).
 */
function VoxelMesh({ group, clock, spread = 1 }: { group: VoxelGroup; clock: Clock; spread?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = group.voxels.length;
  const flight = useMemo(() => {
    const ys = group.voxels.map((v) => v.y + group.pivot[1]);
    const lo = Math.min(...ys),
      hi = Math.max(...ys);
    return group.voxels.map((v, i) => {
      const dir = new THREE.Vector3().randomDirection();
      const r = (26 + Math.random() * 14) * spread;
      return {
        from: new THREE.Vector3(v.x + dir.x * r, v.y + Math.abs(dir.y) * r * 0.8 + 6, v.z + dir.z * r),
        spin: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        // Bottom rows first, so he builds up from his feet.
        delay: ((ys[i] - lo) / Math.max(1, hi - lo)) * 520 + Math.random() * 180,
      };
    });
  }, [group, spread]);
  const done = useRef(false);
  const tmp = useMemo(() => ({ o: new THREE.Object3D() }), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const c = new THREE.Color();
    group.voxels.forEach((v, i) => mesh.setColorAt(i, c.set(v.color)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (clock.reduced) place(1);
  }, [group]);

  /** Puts every cube at `progress` of its flight (1 = in place). */
  const place = (at: number | ((i: number) => number)) => {
    const mesh = ref.current!;
    const o = tmp.o;
    group.voxels.forEach((v, i) => {
      const p = typeof at === "number" ? at : at(i);
      const e = easeOutBack(p);
      const f = flight[i].from;
      o.position.set(f.x + (v.x - f.x) * e, f.y + (v.y - f.y) * e, f.z + (v.z - f.z) * e);
      const s = 1 - easeOutCubic(p);
      o.rotation.set(flight[i].spin.x * s, flight[i].spin.y * s, flight[i].spin.z * s);
      o.scale.setScalar(0.35 + 0.65 * easeOutCubic(Math.min(1, p * 1.6)));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  useFrame(() => {
    if (done.current || !ref.current) return;
    const t = performance.now() - clock.start;
    if (clock.reduced || t >= ASSEMBLE_MS) {
      place(1);
      done.current = true;
      return;
    }
    place((i) => clamp01((t - flight[i].delay) / (ASSEMBLE_MS - 700)));
  });

  return (
    <instancedMesh ref={ref} args={[CUBE, undefined, n]} position={group.pivot} frustumCulled={false}>
      <meshLambertMaterial />
    </instancedMesh>
  );
}

/** A tiny pixel icon (✓, envelope, calendar…) drawn in cubes, floating around the mascot. */
const ICONS: Record<string, string[]> = {
  check: ["......#", ".....##", "#...##.", "##.##..", ".###...", "..#...."],
  mail: ["#######", "##...##", "#.#.#.#", "#..#..#", "#.....#", "#######"],
  cal: [".#...#.", "#######", "#######", "#.#.#.#", "#.....#", "#######"],
  heart: [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."],
};
function IconVoxels({ shape, color }: { shape: string[]; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => {
    const out: [number, number][] = [];
    shape.forEach((row, y) =>
      [...row].forEach((ch, x) => ch === "#" && out.push([x - row.length / 2 + 0.5, shape.length / 2 - y - 0.5])),
    );
    return out;
  }, [shape]);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const o = new THREE.Object3D();
    cells.forEach(([x, y], i) => {
      o.position.set(x, y, 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [cells]);
  return (
    <instancedMesh ref={ref} args={[CUBE, undefined, cells.length]}>
      <meshLambertMaterial color={color} emissive={color} emissiveIntensity={0.25} />
    </instancedMesh>
  );
}

/** Icons orbiting slowly behind and around him, bobbing; they fade in after he lands. */
function Orbiters({ accent, clock }: { accent: string; clock: Clock }) {
  const ref = useRef<THREE.Group>(null);
  const items = useMemo(
    () => [
      { shape: ICONS.check, color: accent, angle: 0.4, r: 25, y: 10, s: 0.75 },
      { shape: ICONS.mail, color: "#ffffff", angle: 2.2, r: 27, y: 5, s: 0.7 },
      { shape: ICONS.cal, color: "#8fa9ff", angle: 3.8, r: 24, y: 14, s: 0.65 },
      { shape: ICONS.heart, color: "#ff5fa2", angle: 5.2, r: 26, y: 2, s: 0.6 },
    ],
    [accent],
  );
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = (performance.now() - clock.start) / 1000;
    const appear = clock.reduced ? 1 : easeOutCubic(clamp01((t * 1000 - ASSEMBLE_MS) / 900));
    g.children.forEach((c, i) => {
      const it = items[i];
      const a = it.angle + (clock.reduced ? 0 : t * 0.18);
      // An ellipse behind him (never in front of his face or the platform).
      c.position.set(
        Math.cos(a) * it.r,
        it.y + (clock.reduced ? 0 : Math.sin(t * 1.3 + i) * 1.2),
        Math.sin(a) * it.r * 0.35 - 14,
      );
      c.rotation.y = clock.reduced ? 0 : Math.sin(t * 0.9 + i) * 0.5;
      c.scale.setScalar(it.s * appear);
    });
  });
  return (
    <group ref={ref}>
      {items.map((it, i) => (
        <group key={i}>
          <IconVoxels shape={it.shape} color={it.color} />
        </group>
      ))}
    </group>
  );
}

/** The voxel platform he stands on: a disc of cubes with a glow in the accent color, and a soft shadow. */
function Platform({ accent }: { accent: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = -13; x <= 13; x++) for (let z = -6; z <= 6; z++) if ((x / 13.5) ** 2 + (z / 6.5) ** 2 <= 1) out.push([x, z]);
    return out;
  }, []);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    cells.forEach(([x, z], i) => {
      o.position.set(x, -0.5, z);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      // A ring in the accent color around a darker center.
      const edge = (x / 13.5) ** 2 + (z / 6.5) ** 2 > 0.62;
      mesh.setColorAt(i, c.set(edge ? accent : (x + z) % 2 ? "#2a2b30" : "#313238"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cells, accent]);
  const shadow = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, "rgba(0,0,0,0.55)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  }, []);
  return (
    <group position={[0, 0, 0]}>
      <instancedMesh ref={ref} args={[CUBE, undefined, cells.length]}>
        <meshLambertMaterial />
      </instancedMesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <planeGeometry args={[22, 10]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Little cubes bursting out of him when he cheers. */
const CONFETTI = 70;
function Confetti({ beat, accent }: { beat: number; accent: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const parts = useRef<{ p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; born: number }[]>([]);
  const o = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const palette = [accent, "#ff5fa2", "#8fa9ff", "#ffffff", "#ffd166"];
    const c = new THREE.Color();
    for (let i = 0; i < CONFETTI; i++) mesh.setColorAt(i, c.set(palette[i % palette.length]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [accent]);
  useEffect(() => {
    if (!beat) return;
    const now = performance.now();
    parts.current = Array.from({ length: CONFETTI }, () => ({
      p: new THREE.Vector3((Math.random() - 0.5) * 8, 26 + Math.random() * 4, (Math.random() - 0.5) * 4),
      v: new THREE.Vector3((Math.random() - 0.5) * 34, 18 + Math.random() * 22, (Math.random() - 0.5) * 18),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
      born: now,
    }));
  }, [beat]);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    const now = performance.now();
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < CONFETTI; i++) {
      const q = parts.current[i];
      const life = q ? (now - q.born) / 1600 : 1;
      if (!q || life >= 1) {
        o.scale.setScalar(0);
      } else {
        q.v.y -= 60 * step;
        q.p.addScaledVector(q.v, step);
        q.r.x += step * 6;
        q.r.y += step * 4;
        o.position.copy(q.p);
        o.rotation.copy(q.r);
        o.scale.setScalar(0.7 * (1 - life));
      }
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[CUBE, undefined, CONFETTI]} frustumCulled={false}>
      <meshLambertMaterial />
    </instancedMesh>
  );
}

/** The mascot and everything that moves him. */
function Mascot({ clock, accent, onReady, onPoke }: { clock: Clock; accent: string; onReady?: () => void; onPoke?: () => void }) {
  const parts = useMemo(() => buildMascot(), []);
  const mood = useAuthMood((s) => s.mood);
  const beat = useAuthMood((s) => s.beat);
  const root = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const face = useRef<THREE.Group>(null);
  const cardRefs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const vis = {
    armsRest: useRef<THREE.Group>(null),
    armR: useRef<THREE.Group>(null),
    waveA: useRef<THREE.Group>(null),
    waveB: useRef<THREE.Group>(null),
    cheerA: useRef<THREE.Group>(null),
    cheerB: useRef<THREE.Group>(null),
    eyes: useRef<THREE.Group>(null),
    blink: useRef<THREE.Group>(null),
    eyesClosed: useRef<THREE.Group>(null),
  };
  // Where the pointer is, from -1 to 1 across the window.
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / innerHeight) * 2 - 1;
    };
    addEventListener("pointermove", move, { passive: true });
    addEventListener("pointerdown", move, { passive: true });
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerdown", move);
    };
  }, []);

  // Reactions: when one started, and which. A click on him is a cheer too (once per 1.2 s).
  const reaction = useRef<{ kind: "cheer" | "shake"; at: number } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const cheer = () => {
    const now = performance.now();
    if (reaction.current?.kind === "cheer" && now - reaction.current.at < 1200) return;
    reaction.current = { kind: "cheer", at: now };
    if (!clock.reduced) setConfetti((c) => c + 1);
  };
  useEffect(() => {
    if (mood === "success") cheer();
    if (mood === "error") reaction.current = { kind: "shake", at: performance.now() };
  }, [mood, beat]);

  const state = useRef({ ry: 0, rx: 0, tilt: 0, eyeX: 0, eyeY: 0, ready: false, nextBlink: 0, blinkUntil: 0, nextWave: 0 });

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const now = performance.now();
    const t = now - clock.start;
    const s = state.current;
    const show = (key: keyof typeof vis, on: boolean) => {
      const g = vis[key].current;
      if (g) g.visible = on;
    };
    const arrived = clock.reduced || t >= ASSEMBLE_MS;
    if (arrived && !s.ready) {
      s.ready = true;
      s.nextBlink = now + 900;
      s.nextWave = now + 14000;
      onReady?.();
    }

    // Landing: a quick squash and stretch right after the cubes click into place.
    let sx = 1,
      sy = 1,
      jump = 0;
    if (!clock.reduced && t >= ASSEMBLE_MS - 80 && t < ASSEMBLE_MS + LAND_MS) {
      const p = clamp01((t - ASSEMBLE_MS + 80) / (LAND_MS + 80));
      const k = Math.sin(p * Math.PI) * (1 - p * 0.4);
      sy = 1 - 0.12 * k;
      sx = 1 + 0.08 * k;
    }
    // Breathing.
    if (arrived && !clock.reduced) sy *= 1 + Math.sin(now / 520) * 0.012;

    // Waving: right after landing, and again every so often while idle.
    const helloT = t - ASSEMBLE_MS - LAND_MS;
    const waving =
      !clock.reduced && ((helloT > 0 && helloT < HELLO_MS) || (s.ready && now > s.nextWave && now < s.nextWave + 1400));
    if (s.ready && now > s.nextWave + 1400) s.nextWave = now + 12000 + Math.random() * 6000;
    const waveFrame = Math.floor(now / WAVE_FRAME_MS) % 2 === 0;

    // Cheering (success or a click) and head shaking (error).
    const r = reaction.current;
    const rt = r ? now - r.at : Infinity;
    const cheering = r?.kind === "cheer" && rt < 1300;
    const shaking = r?.kind === "shake" && rt < 900;
    if (cheering && !clock.reduced) jump = Math.max(0, Math.sin(Math.min(1, rt / 650) * Math.PI)) * 7;

    // Arms: resting, waving or cheering.
    show("cheerA", cheering && Math.floor(rt / 150) % 2 === 0);
    show("cheerB", cheering && Math.floor(rt / 150) % 2 === 1);
    show("waveA", !cheering && waving && waveFrame);
    show("waveB", !cheering && waving && !waveFrame);
    show("armR", !cheering && waving);
    show("armsRest", !cheering && !waving);

    // Eyes: shut on the password, a blink every few seconds, open otherwise.
    const shut = mood === "password";
    if (s.ready && now > s.nextBlink) {
      s.blinkUntil = now + 140;
      s.nextBlink = now + 2600 + Math.random() * 3400;
    }
    const blinking = now < s.blinkUntil || (!clock.reduced && helloT > 900 && helloT < 1040);
    show("eyesClosed", shut);
    show("blink", !shut && blinking);
    show("eyes", !shut && !blinking);

    // Where he looks: the pointer, biased toward the form on the e-mail and away on the password.
    const px = clock.reduced ? 0 : pointer.current.x,
      py = clock.reduced ? 0 : pointer.current.y;
    let ry = px * 0.45,
      tilt = 0;
    const rx = py * 0.14;
    if (mood === "email") {
      ry += 0.35;
      tilt = -0.1;
    }
    if (shut) ry = -0.62;
    if (shaking && !clock.reduced) ry += Math.sin(rt / 55) * 0.28 * (1 - rt / 900);
    s.ry = damp(s.ry, ry, shaking ? 30 : 6, dt);
    s.rx = damp(s.rx, rx, 6, dt);
    s.tilt = damp(s.tilt, tilt, 5, dt);
    s.eyeX = damp(s.eyeX, shut ? 0 : px * 0.7, 8, dt);
    s.eyeY = damp(s.eyeY, shut ? 0 : -py * 0.45, 8, dt);

    if (root.current) {
      root.current.scale.set(sx, sy, sx);
      root.current.position.y = jump;
    }
    if (turn.current) turn.current.rotation.set(s.rx, s.ry, s.tilt);
    if (face.current) face.current.position.set(s.eyeX, s.eyeY, 0);

    // Index cards: fan out while he says hello and when cheering; sway gently otherwise.
    const fan = clock.reduced
      ? 0
      : cheering
        ? Math.sin(Math.min(1, rt / 500) * Math.PI)
        : helloT > 200 && helloT < 1700
          ? Math.sin(((helloT - 200) / 1500) * Math.PI)
          : 0;
    cardRefs.forEach((c, i) => {
      const g = c.current;
      if (!g) return;
      const side = i - 1;
      const sway = clock.reduced || !s.ready ? 0 : Math.sin(now / 900 + i * 1.3) * 0.04;
      g.position.y = parts.cards[i].pivot[1] + fan * (2 + (i === 1 ? 0.8 : 0));
      g.rotation.z = -side * 0.22 * fan + sway;
    });
  });

  const offset: [number, number, number] = [-parts.body.pivot[0], -parts.body.pivot[1], -parts.body.pivot[2]];
  const part = (key: keyof typeof vis, g: VoxelGroup, visible: boolean) => (
    <group ref={vis[key]} visible={visible}>
      <VoxelMesh group={g} clock={clock} />
    </group>
  );
  const poke = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    cheer();
    onPoke?.();
  };

  return (
    <group ref={root}>
      <group
        ref={turn}
        onClick={poke}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <group position={offset}>
          <VoxelMesh group={parts.body} clock={clock} />
          {parts.cards.map((c, i) => (
            // Each card turns around its own bottom-center, like a card rising out of the folder.
            <group key={i} ref={cardRefs[i]} position={c.pivot}>
              <VoxelMesh group={{ voxels: c.voxels, pivot: [0, 0, 0] }} clock={clock} />
            </group>
          ))}
          {part("armsRest", parts.armsRest, true)}
          {part("armR", parts.armR, false)}
          {part("waveA", parts.waveA, false)}
          {part("waveB", parts.waveB, false)}
          {part("cheerA", parts.cheerA, false)}
          {part("cheerB", parts.cheerB, false)}
          <group ref={face}>
            {part("eyes", parts.eyes, true)}
            {part("blink", parts.blink, false)}
            {part("eyesClosed", parts.eyesClosed, false)}
            <VoxelMesh group={parts.mouth} clock={clock} />
          </group>
        </group>
      </group>
      <Confetti beat={confetti} accent={accent} />
    </group>
  );
}

/** Renders only while the tab is visible. */
function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

export default function MascotScene({
  reduced,
  compact,
  onReady,
}: {
  /** Reduced motion: he is already standing there; only blinks and reactions to the form. */
  reduced: boolean;
  /** Phones: a smaller stage and a lower pixel ratio. */
  compact?: boolean;
  onReady?: () => void;
}) {
  const accent = useAccent();
  const visible = usePageVisible();
  const clock = useMemo<Clock>(() => ({ start: performance.now(), reduced }), [reduced]);
  return (
    <Canvas
      flat
      dpr={compact ? [1, 1.5] : [1, 1.75]}
      frameloop={visible ? "always" : "never"}
      camera={{ position: [0, 17, compact ? 80 : 104], fov: 30, near: 1, far: 400 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ camera }) => camera.lookAt(0, 14, 0)}
      aria-hidden="true"
    >
      <ambientLight intensity={1.15} />
      <hemisphereLight args={["#ffffff", "#1a1b1e", 0.6]} />
      <directionalLight position={[-30, 40, 50]} intensity={1.9} color="#fff6e8" />
      <directionalLight position={[35, 20, -30]} intensity={1.6} color={accent} />
      <group position={[0, 0, 0]}>
        <Platform accent={accent} />
        <Mascot clock={clock} accent={accent} onReady={onReady} />
        <Orbiters accent={accent} clock={clock} />
      </group>
    </Canvas>
  );
}
