import assert from "node:assert/strict";
import test from "node:test";
import {
  compareVersions,
  decideUpdate,
  isCacheFresh,
  parseVersion,
  releaseKind,
  type TreeState,
} from "../src/update/policy";

const clean: TreeState = { git: "ok", dirty: false, ahead: false, detached: false };

test("release tags and plain versions parse the same", () => {
  assert.deepEqual(parseVersion("v0.2.1"), { major: 0, minor: 2, patch: 1 });
  assert.deepEqual(parseVersion("0.2.1"), { major: 0, minor: 2, patch: 1 });
  assert.equal(parseVersion("nightly"), null);
  assert.equal(parseVersion(null), null);
});

test("an unreadable version never compares as newer, so a bad tag cannot trigger a pull", () => {
  assert.equal(compareVersions("0.1.0", "garbage"), 0);
  assert.equal(compareVersions("garbage", "9.9.9"), 0);
  assert.equal(releaseKind("0.1.0", "garbage"), "none");
});

test("release kind reads the first component that moved", () => {
  assert.equal(releaseKind("0.1.0", "0.1.1"), "patch");
  assert.equal(releaseKind("0.1.0", "0.2.0"), "minor");
  assert.equal(releaseKind("0.1.0", "1.0.0"), "major");
  assert.equal(releaseKind("0.1.0", "0.1.0"), "none");
  assert.equal(releaseKind("0.2.0", "0.1.0"), "none", "an older remote is not an update");
});

test("patch and minor apply themselves on a clean checkout", () => {
  assert.equal(decideUpdate({ local: "0.1.0", latest: "0.1.4", tree: clean }).action, "apply");
  assert.equal(decideUpdate({ local: "0.1.0", latest: "0.3.0", tree: clean }).action, "apply");
});

test("a major always asks, and never depends on the state of the checkout", () => {
  for (const tree of [clean, { ...clean, dirty: true }, { ...clean, ahead: true }]) {
    const decision = decideUpdate({ local: "0.9.0", latest: "1.0.0", tree });
    assert.equal(decision.action, "ask");
    assert.equal(decision.kind, "major");
  }
});

test("a 0.x minor flagged breaking asks, which is the whole point of the flag", () => {
  const plain = decideUpdate({ local: "0.1.0", latest: "0.2.0", tree: clean });
  assert.equal(plain.action, "apply");

  const flagged = decideUpdate({ local: "0.1.0", latest: "0.2.0", breaking: true, tree: clean });
  assert.equal(flagged.action, "ask");
  assert.match(flagged.reason, /flagged breaking/);
});

test("someone else's work blocks an automatic pull", () => {
  const dirty = decideUpdate({ local: "0.1.0", latest: "0.1.1", tree: { ...clean, dirty: true } });
  assert.equal(dirty.action, "blocked");
  assert.match(dirty.reason, /uncommitted/);

  const ahead = decideUpdate({ local: "0.1.0", latest: "0.1.1", tree: { ...clean, ahead: true } });
  assert.equal(ahead.action, "blocked");
  assert.match(ahead.reason, /local commits/);

  const detached = decideUpdate({
    local: "0.1.0",
    latest: "0.1.1",
    tree: { ...clean, detached: true },
  });
  assert.equal(detached.action, "blocked");
  assert.match(detached.reason, /not on a branch/);
});

/**
 * git is a prerequisite, not a detail: without it there is no way to apply an
 * update and no way to tell whether applying one would eat someone's work.
 * Both failures used to arrive as "not on a branch", which is advice for a
 * problem the reader does not have.
 */
test("a missing git and an unpacked archive say what is actually wrong", () => {
  const missing = decideUpdate({
    local: "0.1.0",
    latest: "0.1.1",
    tree: { ...clean, git: "missing", detached: true },
  });
  assert.equal(missing.action, "blocked");
  assert.match(missing.reason, /git is not installed/);
  assert.doesNotMatch(missing.reason, /not on a branch/);

  const archive = decideUpdate({
    local: "0.1.0",
    latest: "0.1.1",
    tree: { ...clean, git: "not-a-checkout", detached: true },
  });
  assert.equal(archive.action, "blocked");
  assert.match(archive.reason, /not a git checkout/);

  // A major still asks before any of this: the state of the checkout cannot
  // turn "ask a human" into something an agent decides alone.
  const major = decideUpdate({
    local: "0.9.0",
    latest: "1.0.0",
    tree: { ...clean, git: "missing" },
  });
  assert.equal(major.action, "ask");
});

test("no answer from the release feed is a silent no-op, not a failure", () => {
  const decision = decideUpdate({ local: "0.1.0", latest: null, tree: clean });
  assert.equal(decision.action, "unavailable");
  assert.equal(decision.kind, "none");
});

test("being current reports up to date", () => {
  assert.equal(decideUpdate({ local: "0.1.0", latest: "0.1.0", tree: clean }).action, "up-to-date");
});

test("the cache is what keeps the check off the hot path", () => {
  const now = Date.parse("2026-08-18T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

  assert.equal(isCacheFresh(hoursAgo(1), now, 12), true);
  assert.equal(isCacheFresh(hoursAgo(11.9), now, 12), true);
  assert.equal(isCacheFresh(hoursAgo(12.1), now, 12), false);
  assert.equal(isCacheFresh(null, now, 12), false);
  assert.equal(isCacheFresh("not a date", now, 12), false);
  assert.equal(
    isCacheFresh(new Date(now + 3600_000).toISOString(), now, 12),
    false,
    "a stamp from the future is not evidence of a recent check",
  );
});
