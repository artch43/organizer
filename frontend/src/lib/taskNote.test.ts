import { beforeAll, describe, expect, it } from "vitest";

const kept: Record<string, string> = {};
beforeAll(() => {
  globalThis.localStorage = {
    getItem: (k: string) => kept[k] ?? null,
    setItem: (k: string, v: string) => void (kept[k] = v),
    removeItem: (k: string) => void delete kept[k],
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;
  // Opening a note writes its address; a tiny stand-in for the browser's.
  const loc = { hash: "" };
  globalThis.location = loc as Location;
  globalThis.history = {
    state: null,
    pushState: (_s: unknown, _t: string, url?: string) => void (loc.hash = url ?? loc.hash),
    replaceState: (_s: unknown, _t: string, url?: string) => void (loc.hash = url ?? loc.hash),
  } as unknown as History;
});

describe("anotação da tarefa", () => {
  it("cria uma vez, leva o texto antigo e depois só reabre a mesma", async () => {
    const { useStore, openTaskNote, taskNoteOf, patchItem } = await import("../store");
    const ws = () => useStore.getState().ws;
    const task = Object.values(ws().items)[0];
    patchItem(task.id, (x) => void (x.notes = "Texto antigo da tarefa"));

    const id = openTaskNote(task.id);
    const note = taskNoteOf(ws().notes, task.id)!;
    expect(note.id).toBe(id);
    expect(note.title).toBe(task.title.trim());
    expect(note.folder).toBe("Tarefas");
    expect(note.body).toBe("Texto antigo da tarefa");
    expect(ws().items[task.id].notes).toBe("");
    expect(useStore.getState().ui.route).toBe("notes");

    const before = Object.keys(ws().notes).length;
    openTaskNote(task.id);
    expect(Object.keys(ws().notes).length).toBe(before);
    expect(useStore.getState().ui.noteId).toBe(note.id);
  });

  it("sai junto quando a tarefa ou a lista dela é excluída", async () => {
    const { useStore, openTaskNote, taskNoteOf, deleteItem, deletePage } = await import("../store");
    const ws = () => useStore.getState().ws;
    const [a, b] = Object.values(ws().items).filter((x) => x.db === Object.values(ws().items)[0].db);
    const others = Object.values(ws().notes).filter((n) => !n.task).length;

    openTaskNote(a.id);
    expect(taskNoteOf(ws().notes, a.id)).toBeTruthy();
    deleteItem(a.id);
    expect(ws().items[a.id]).toBeUndefined();
    expect(taskNoteOf(ws().notes, a.id)).toBeUndefined();
    expect(useStore.getState().ui.noteId).toBeNull();

    openTaskNote(b.id);
    deletePage(b.db);
    expect(taskNoteOf(ws().notes, b.id)).toBeUndefined();
    // Notes not tied to a task stay.
    expect(Object.values(ws().notes).filter((n) => !n.task).length).toBe(others);
  });
});
