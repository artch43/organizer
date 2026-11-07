import { create } from "zustand";

/** What the sign-in form is doing, so the mascot can react to it. */
export type Mood = "idle" | "email" | "password" | "error" | "success";

interface MoodState {
  mood: Mood;
  /** Bumped on every error/celebration, so the same reaction can play twice in a row. */
  beat: number;
}

export const useAuthMood = create<MoodState>(() => ({ mood: "idle", beat: 0 }));

export const setMood = (mood: Mood) => useAuthMood.setState((s) => ({ mood, beat: s.beat + 1 }));

/** A field gained focus: email-like fields make him curious, password fields make him look away. */
export const focusMood = (kind: "email" | "password") => setMood(kind);
/** A field lost focus: back to idle, unless an error or a celebration is showing. */
export const blurMood = () => {
  const m = useAuthMood.getState().mood;
  if (m === "email" || m === "password") setMood("idle");
};

/** How long the mascot celebrates a successful sign-in before the app opens. */
export const CELEBRATE_MS = 900;
let celebration: Promise<void> | null = null;

/** Signed in: the mascot cheers, and the app waits for it (see `afterCelebration`). */
export function celebrate() {
  setMood("success");
  celebration = new Promise((r) => setTimeout(r, CELEBRATE_MS));
}

/** Resolves once a celebration that just started is over (at once when there is none). */
export async function afterCelebration() {
  // The sign-in event can fire just before the sign-in call returns (where `celebrate` runs): look one tick later.
  await new Promise((r) => setTimeout(r, 0));
  const c = celebration;
  celebration = null;
  if (c) await c;
}
