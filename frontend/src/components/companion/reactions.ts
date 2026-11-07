import { create } from "zustand";

/** What the corner mascot should react to: a little hop (a task done) or a cheer (the day cleared). */
export type CompanionReaction = "hop" | "cheer";

export const useCompanion = create<{ reaction: CompanionReaction | null; beat: number }>(() => ({ reaction: null, beat: 0 }));

/** Makes the corner mascot react (each call plays once, even the same reaction twice in a row). */
export const reactCompanion = (reaction: CompanionReaction) => useCompanion.setState((s) => ({ reaction, beat: s.beat + 1 }));

/** He assembles from his cubes only the first time in a session; after that he is just there. */
const SEEN_KEY = "organizer:companion-seen";
export function firstAppearance() {
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return false;
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode: always assemble */
  }
  return true;
}
