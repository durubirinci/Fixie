import { describe, expect, it } from "vitest";
import { planSignIn } from "@/lib/profile/merge";
import { EMPTY_PREFERENCES, type Preferences } from "@/lib/scan/schema";

const DEVICE: Preferences = { space: "balcony", interests: ["plants"], tools: ["scissors_tape"] };
const ACCOUNT: Preferences = { space: "yard", interests: ["kids"], tools: ["basic_tools"] };

describe("planSignIn", () => {
  it("lets an existing account profile win over this device's answers", () => {
    expect(planSignIn(DEVICE, ACCOUNT)).toEqual({ preferences: ACCOUNT, shouldSaveToAccount: false });
  });

  it("uses the account profile on a device that hasn't answered yet", () => {
    expect(planSignIn(null, ACCOUNT)).toEqual({ preferences: ACCOUNT, shouldSaveToAccount: false });
  });

  it("uses the account profile on a device that skipped the questions", () => {
    expect(planSignIn(EMPTY_PREFERENCES, ACCOUNT)).toEqual({ preferences: ACCOUNT, shouldSaveToAccount: false });
  });

  it("copies this device's answers up to an account that has none", () => {
    expect(planSignIn(DEVICE, null)).toEqual({ preferences: DEVICE, shouldSaveToAccount: true });
  });

  it("doesn't save a skipped profile to an account that has none", () => {
    expect(planSignIn(EMPTY_PREFERENCES, null)).toEqual({ preferences: EMPTY_PREFERENCES, shouldSaveToAccount: false });
  });

  it("does nothing when neither side has answers", () => {
    expect(planSignIn(null, null)).toEqual({ preferences: null, shouldSaveToAccount: false });
  });

  it("counts a profile with only one answer as real answers", () => {
    const spaceOnly: Preferences = { space: "indoors", interests: [], tools: [] };
    expect(planSignIn(spaceOnly, null)).toEqual({ preferences: spaceOnly, shouldSaveToAccount: true });
  });
});
