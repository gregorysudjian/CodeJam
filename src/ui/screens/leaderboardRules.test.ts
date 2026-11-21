import { expect, it } from "vitest";
import { leaderboardFilter } from "@/ui/screens/leaderboardRules";
it("switches legs to full body before requesting a treadmill leaderboard", () => {
  expect(leaderboardFilter("legs", "treadmill")).toEqual({
    workout: "fullBody",
    mode: "treadmill",
  });
});
it("preserves supported workout and mode pairs", () => {
  expect(leaderboardFilter("arms", "treadmill")).toEqual({ workout: "arms", mode: "treadmill" });
  expect(leaderboardFilter("legs", "floor")).toEqual({ workout: "legs", mode: "floor" });
});
