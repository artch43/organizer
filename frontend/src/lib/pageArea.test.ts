// @vitest-environment jsdom
import { expect, it } from "vitest";
import { deleteArea, useStore } from "../store";

it("keeps area filters independent across routes, including back navigation", () => {
  const set = useStore.getState().setUi;
  set((u) => { u.route = "home"; u.area = "all"; });
  set((u) => { u.area = "pessoal"; });
  set((u) => { u.route = "calendar"; });
  expect(useStore.getState().ui.area).toBe("all");
  set((u) => { u.area = "estudo"; });
  set((u) => { u.route = "home"; });
  expect(useStore.getState().ui.area).toBe("pessoal");
  set((u) => { u.route = "calendar"; });
  expect(useStore.getState().ui.area).toBe("estudo");
});

it("clears a deleted area's filter from inactive pages too", () => {
  const set = useStore.getState().setUi;
  set((u) => { u.area = "removida"; });
  const previous = useStore.getState().ui.route;
  set((u) => { u.route = "other"; });
  deleteArea("removida");
  set((u) => { u.route = previous; });
  expect(useStore.getState().ui.area).toBe("all");
});
