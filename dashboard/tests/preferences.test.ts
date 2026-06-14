import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizePreferences, userSettingsFromPreferences } from "../src/api/preferences.ts";

describe("dashboard preferences", () => {
  it("defaults message max columns for the messages page", () => {
    assert.equal(normalizePreferences({}).messageMaxColumns, 3);
  });

  it("clamps message max columns to the supported range", () => {
    assert.equal(normalizePreferences({ messageMaxColumns: 0 }).messageMaxColumns, 1);
    assert.equal(normalizePreferences({ messageMaxColumns: 9 }).messageMaxColumns, 6);
    assert.equal(normalizePreferences({ messageMaxColumns: 4.7 }).messageMaxColumns, 4);
  });

  it("normalizes account-backed theme and language settings", () => {
    assert.deepEqual(
      userSettingsFromPreferences({
        theme: "light",
        language: "zh-CN",
        hideStaleAfterHours: 2,
        hideFinishedAfterHours: 3,
        messageMaxColumns: 4,
      }),
      { theme: "light", language: "zh-CN" },
    );
    assert.deepEqual(
      normalizePreferences({
        theme: "blue" as "dark",
        language: "pirate" as "en",
      }),
      {
        theme: "dark",
        language: "system",
        hideStaleAfterHours: 5,
        hideFinishedAfterHours: 5,
        messageMaxColumns: 3,
      },
    );
  });
});
