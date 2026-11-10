import { expect, it } from "vitest";
import { alertPresets } from "./events";

it("defaults legacy accounts but preserves an explicitly empty list", () => {
  expect(alertPresets(undefined).map((p) => p.minutes)).toEqual([0, 10, 30, 60, 1440, 10080]);
  expect(alertPresets([])).toEqual([]);
});

it("shares custom options, sorts and deduplicates valid minutes", () => {
  expect(alertPresets([90, 10, 90, -1, NaN, Infinity, 1.5])).toEqual([
    { minutes: 10, label: "10 min antes" },
    { minutes: 90, label: "90 min antes" },
  ]);
});
