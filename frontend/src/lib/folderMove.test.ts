// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { moveNoteFolder, useStore } from "../store";
import { template } from "./template";

beforeEach(() => {
  const ws = template();
  ws.notes = {
    a: { id: "a", title: "A", body: "", folder: "Origem/Filha", created: 0, updated: 0 },
  };
  ws.settings.noteFolders = ["Origem/Filha/Vazia", "Destino"];
  useStore.setState({ ws });
});

it("moves a folder and its descendants into another folder and back to root", () => {
  expect(moveNoteFolder("Origem", "Destino")).toBe(true);
  expect(useStore.getState().ws.notes.a.folder).toBe("Destino/Origem/Filha");
  expect(useStore.getState().ws.settings.noteFolders).toContain("Destino/Origem/Filha/Vazia");
  expect(moveNoteFolder("Destino/Origem", "")).toBe(true);
  expect(useStore.getState().ws.notes.a.folder).toBe("Origem/Filha");
  expect(useStore.getState().ws.settings.noteFolders).toContain("Destino");
});

it("rejects self, descendants, no-op and colliding destinations", () => {
  const before = useStore.getState().ws;
  expect(moveNoteFolder("Origem", "Origem")).toBe(false);
  expect(moveNoteFolder("Origem", "Origem/Filha")).toBe(false);
  expect(moveNoteFolder("Origem", "")).toBe(false);
  useStore.getState().mut((w) => { w.settings.noteFolders!.push("Destino/Origem"); });
  expect(moveNoteFolder("Origem", "Destino")).toBe(false);
  expect(useStore.getState().ws.notes.a.folder).toBe(before.notes.a.folder);
});
