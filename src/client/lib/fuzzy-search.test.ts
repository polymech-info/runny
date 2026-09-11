import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fuzzyMatch,
  fuzzyScore,
  fuzzyScoreScript,
  splitSearchWords,
} from "./fuzzy-search.js";

describe("splitSearchWords", () => {
  it("splits camelCase and separators", () => {
    assert.deepEqual(splitSearchWords("test:mediaApi"), [
      "test",
      "media",
      "api",
    ]);
  });
});

describe("fuzzyMatch", () => {
  it("matches exact and substring", () => {
    assert.equal(fuzzyMatch("build", "build:cpp"), true);
    assert.equal(fuzzyMatch("cpp", "build:cpp"), true);
  });

  it("matches camelCase / acronym style queries", () => {
    assert.equal(fuzzyMatch("tma", "test:mediaApi"), true);
    assert.equal(fuzzyMatch("media api", "test:mediaApi"), true);
  });

  it("rejects unrelated needles", () => {
    assert.equal(fuzzyMatch("zzz", "build:cpp"), false);
  });

  it("empty query matches everything", () => {
    assert.ok(fuzzyScore("", "anything") > 0);
  });
});

describe("fuzzyScoreScript", () => {
  it("matches changelog:next on the real script name", () => {
    assert.ok(
      fuzzyScoreScript(
        "changelog:next",
        "build:post:changelog:next",
        "node scripts/build-post-changelog.mjs"
      ) > 0
    );
  });

  it("does not match changelog:next via long unrelated command", () => {
    const longCmd =
      "npm run features:release-debug && node scripts/ninja.mjs --preset release-debug --target tanit-whisper-plugin tanit-browser-plugin -- -j 8";
    assert.equal(
      fuzzyScoreScript("changelog:next", "build:cpp:plugins", longCmd),
      0
    );
  });

  it("still finds contiguous command substrings", () => {
    assert.ok(
      fuzzyScoreScript(
        "ninja.mjs",
        "build:cpp",
        "node scripts/ninja.mjs --preset release"
      ) > 0
    );
  });
});
