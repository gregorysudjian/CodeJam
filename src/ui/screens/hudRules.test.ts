import { describe, expect, it } from "vitest";
import { hudCueLabel, raceProgress } from "@/ui/screens/hudRules";

describe("race progress", () => {
  it("moves from start to finish with elapsed time", () => {
    expect(raceProgress(0, 90)).toBe(0);
    expect(raceProgress(54, 90)).toBe(0.6);
    expect(raceProgress(90, 90)).toBe(1);
  });
  it("clamps the marker to the track and guards zero duration", () => {
    expect(raceProgress(-1, 90)).toBe(0);
    expect(raceProgress(100, 90)).toBe(1);
    expect(raceProgress(10, 0)).toBe(0);
  });
});

it("uses a neutral REACH label for either arm", () => {
  expect(hudCueLabel("reachLeft")).toBe("REACH");
  expect(hudCueLabel("reachRight")).toBe("REACH");
  expect(hudCueLabel("jump")).toBe("JUMP");
});
