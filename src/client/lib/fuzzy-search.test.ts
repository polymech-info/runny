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
    assert.deepEqual(splitSearchWords("deploy:store:anne"), [
      "deploy",
      "store",
      "anne",
    ]);
    assert.deepEqual(splitSearchWords("pipe:zip:test:xblox-language"), [
      "pipe",
      "zip",
      "test",
      "xblox",
      "language",
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

  it("ranks a whole word above the same letters inside another word", () => {
    const word = fuzzyScoreScript(
      "anne",
      "deploy:store:anne",
      "node releases/build-release.mjs --install-anne"
    );
    const inside = fuzzyScoreScript(
      "anne",
      "test:agent:planner-context",
      "node packages/llm.cpp/tests/orchestrator/test-agent.mjs --case=case-planner-context"
    );
    const scattered = fuzzyScoreScript(
      "anne",
      "android:install:resize",
      "node android/tanit/scripts/install-resize.mjs"
    );
    assert.ok(word > inside);
    assert.ok(inside > scattered);
  });

  it("ranks a name word above the same word used only in a command", () => {
    const named = fuzzyScoreScript(
      "seed",
      "test:store-tanit:seed",
      "node scripts/test-store-seed.mjs"
    );
    const flag = fuzzyScoreScript(
      "seed",
      "test:android:agent:live",
      "node android/tanit/scripts/run-android-tests.cjs agent:live --seed-oauth"
    );
    assert.ok(named > flag);
  });

  it("ranks editor as its own word above codeeditor", () => {
    const word = fuzzyScoreScript("editor", "pipe:zip:test:editor", "node tests/scripts/editor.mjs");
    const glued = fuzzyScoreScript("editor", "build:codeeditor", "npm run build:pixlwiz");
    assert.ok(word > glued);
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
