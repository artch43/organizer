import { useEffect, useState } from "react";
import { ShaderChunk } from "three";
import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

// ShaderGradient was built for three r169; newer three (r187 here) folded the cube-map helpers into the
// environment chunks and dropped `cube_uv_reflection_fragment`. The library blanks other removed chunks
// itself (uv2_*, encodings_fragment); this one is blanked the same way so its shader compiles.
const chunks = ShaderChunk as unknown as Record<string, string>;
if (!("cube_uv_reflection_fragment" in chunks)) chunks.cube_uv_reflection_fragment = "";

/*
 * The animated background (ShaderGradient, https://github.com/ruucm/shadergradient): a slow liquid
 * gradient in the Organizer palette. Dark mode: graphite with lime and a little deep blue. Light mode:
 * cream with bubblegum pink and soft blue. Lit with the built-in "3d" lights (no environment files to
 * download). Loaded on its own, only on the app's pages.
 */

/**
 * The gradient, exactly as configured (shadergradient.co settings): a "plane" with these camera,
 * position, rotation and noise values. Dark mode uses the given colors (black, white and lime: the
 * dark palette). Light mode keeps the same motion with the light palette (deep blue, cream, pink).
 */
const BASE = {
  animate: "on",
  axesHelper: "off",
  brightness: 1.1,
  cAzimuthAngle: 180,
  cDistance: 3.6,
  cPolarAngle: 90,
  cameraZoom: 1,
  destination: "onCanvas",
  embedMode: "off",
  envPreset: "city",
  format: "gif",
  fov: 45,
  frameRate: 10,
  gizmoHelper: "hide",
  // The library's grain is a post-processing pass on every frame; a light, static grain is drawn in CSS instead (.shader-backdrop::before).
  grain: "off",
  lightType: "3d",
  pixelDensity: 1,
  positionX: -1.4,
  positionY: 0,
  positionZ: 0,
  range: "disabled",
  rangeEnd: 40,
  rangeStart: 0,
  reflection: 0.1,
  rotationX: 0,
  rotationY: 10,
  rotationZ: 50,
  shader: "defaults",
  type: "plane",
  uAmplitude: 1,
  uDensity: 1.3,
  uFrequency: 5.5,
  uSpeed: 0.3,
  uStrength: 4,
  uTime: 0,
  wireframe: false,
} as const;
const COLORS = {
  dark: { color1: "#000000", color2: "#ffffff", color3: "#a9e100" },
  light: { color1: "#FAF7F2", color2: "#FFFFFF", color3: "#FF5FA2" },
} as const;

function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export default function ShaderBackdrop({ animate }: { animate: boolean }) {
  const dark = useDark();
  // Fades in once the first frame is drawn, over the plain gradient underneath.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 120);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="shader-backdrop" data-shown={shown || undefined}>
      <ShaderGradientCanvas
        pointerEvents="none"
        pixelDensity={BASE.pixelDensity}
        fov={BASE.fov}
        lazyLoad={false}
        powerPreference="low-power"
        style={{ position: "absolute", inset: 0 }}
      >
        <ShaderGradient
          // Remount on theme change so the colors switch at once (no long blend).
          key={dark ? "dark" : "light"}
          control="props"
          {...(BASE as unknown as Record<string, never>)}
          {...(dark ? COLORS.dark : COLORS.light)}
          animate={animate ? "on" : "off"}
          enableTransition={false}
        />
      </ShaderGradientCanvas>
    </div>
  );
}
