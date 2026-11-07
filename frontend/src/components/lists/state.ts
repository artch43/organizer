import { create } from "zustand";
import { go, openModal, useStore } from "@/store";

/** The list opened last, so "Listas" goes back to it. */
const LAST_LIST_KEY = "organizer:last-list";
/** Whether the lists panel is shown beside a list (computer and tablet). */
const PANEL_KEY = "organizer:lists-panel";

export function rememberList(id: string) {
  try {
    localStorage.setItem(LAST_LIST_KEY, id);
  } catch {
    /* private mode: "Listas" opens the first list */
  }
}

/** The list opened last (if it still exists). */
export function lastList() {
  try {
    return localStorage.getItem(LAST_LIST_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** "Listas": back to the last list opened (or the first one); with no lists yet, the form to make one. */
export function openLists() {
  const { ws } = useStore.getState();
  const lists = ws.pages.filter((p) => p.type === "db" && !p.archived);
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_LIST_KEY);
  } catch {
    /* private mode */
  }
  const target = ws.pages.find((p) => p.id === last && p.type === "db") ?? lists[0];
  if (target) go(target.id);
  else openModal("newBoard");
}

function readPanel() {
  try {
    const v = localStorage.getItem(PANEL_KEY);
    if (v !== null) return v === "1";
  } catch {
    /* private mode */
  }
  // Tablets start with it closed so the board gets the room.
  return typeof matchMedia === "undefined" || matchMedia("(min-width: 1024px)").matches;
}

/** The lists panel (computer) and the lists sheet (phone). */
export const useListsUi = create<{ panel: boolean; sheet: boolean }>(() => ({ panel: readPanel(), sheet: false }));

export function setListsPanel(open: boolean) {
  useListsUi.setState({ panel: open });
  try {
    localStorage.setItem(PANEL_KEY, open ? "1" : "0");
  } catch {
    /* private mode */
  }
}
export const setListsSheet = (open: boolean) => useListsUi.setState({ sheet: open });
