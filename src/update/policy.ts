/**
 * What a version difference means, and whether an agent may act on it alone.
 *
 * Pure functions on purpose: no git, no network, no clock. The decision an
 * agent takes is the most consequential thing this repo does to someone else's
 * working copy, so it has to be reproducible and testable in isolation. All
 * the IO lives in scripts/update.mts.
 *
 * The rule, decided 2026-08-16: patch and minor apply themselves, a major
 * asks. Since 0.x semver allows a minor to break, a release can also carry an
 * explicit breaking flag that forces the ask whatever the numbers say.
 */

export type Version = { major: number; minor: number; patch: number };

/** How far apart two versions are. "none" also covers a remote that is older. */
export type ReleaseKind = "none" | "patch" | "minor" | "major";

export type UpdateAction =
  /** Nothing to do. */
  | "up-to-date"
  /** Safe to pull without asking. */
  | "apply"
  /** An update exists but a human decides: major, or flagged breaking. */
  | "ask"
  /** An update exists but touching this checkout would risk the user's work. */
  | "blocked"
  /** No answer from the release feed: offline, rate limited, private repo. */
  | "unavailable";

/**
 * Whether an update can be applied at all: the tool has to exist and the
 * directory has to be a checkout. Both fail the same way through git's exit
 * status, and telling them apart is the whole point of having three values.
 * Someone who unpacked an archive needs different advice from someone whose
 * machine has no git.
 */
export type GitState = "ok" | "missing" | "not-a-checkout";

/**
 * What the local checkout looks like right now. Any of these being true means
 * a pull could destroy or entangle work that is not ours.
 */
export type TreeState = {
  /** git as a prerequisite: installed, and pointed at a real checkout. */
  git: GitState;
  /** Uncommitted changes, staged or not. */
  dirty: boolean;
  /** Local commits the upstream does not have, so no fast-forward exists. */
  ahead: boolean;
  /** Not on a branch, so there is nothing to fast-forward. */
  detached: boolean;
};

export type Decision = {
  action: UpdateAction;
  kind: ReleaseKind;
  /** One sentence, written to be printed straight at a human or an agent. */
  reason: string;
};

/** Accepts release tags too, so "v0.2.1" and "0.2.1" are the same version. */
export const parseVersion = (raw: string | null | undefined): Version | null => {
  if (!raw) return null;
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(raw).trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
};

/** -1, 0 or 1. Unparsable input compares equal, so a bad tag never triggers a pull. */
export const compareVersions = (a: string | null, b: string | null): number => {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (const part of ["major", "minor", "patch"] as const) {
    if (left[part] !== right[part]) return left[part] < right[part] ? -1 : 1;
  }
  return 0;
};

export const releaseKind = (local: string | null, latest: string | null): ReleaseKind => {
  const from = parseVersion(local);
  const to = parseVersion(latest);
  if (!from || !to) return "none";
  if (compareVersions(local, latest) >= 0) return "none";
  if (to.major !== from.major) return "major";
  if (to.minor !== from.minor) return "minor";
  return "patch";
};

export const decideUpdate = ({
  local,
  latest,
  breaking = false,
  tree,
}: {
  local: string | null;
  latest: string | null;
  breaking?: boolean;
  tree: TreeState;
}): Decision => {
  if (!parseVersion(latest)) {
    return {
      action: "unavailable",
      kind: "none",
      reason: "No answer from the release feed, so nothing was checked or changed.",
    };
  }

  const kind = releaseKind(local, latest);
  if (kind === "none") {
    return { action: "up-to-date", kind, reason: `Already on ${local}, the latest release.` };
  }

  // The ask comes before the tree check on purpose: a major is never applied
  // automatically, so the state of the checkout does not change the answer.
  if (kind === "major" || breaking) {
    const why = kind === "major" ? `${latest} is a new major` : `${latest} is flagged breaking`;
    return {
      action: "ask",
      kind,
      reason: `${why}. Read the release notes and ask the user before updating.`,
    };
  }

  // Before anything about the tree, whether the tree can be read at all. A
  // missing git reports as "no branch, nothing to fast-forward", which sends
  // the reader looking for a branch instead of installing the tool.
  if (tree.git === "missing") {
    return {
      action: "blocked",
      kind,
      reason: `${latest} is available, but git is not installed, so this cannot update itself. Install git, or download the new version by hand.`,
    };
  }
  if (tree.git === "not-a-checkout") {
    return {
      action: "blocked",
      kind,
      reason: `${latest} is available, but this directory is not a git checkout, so there is nothing to fast-forward. Clone the repo instead of unpacking an archive, or download the new version by hand.`,
    };
  }

  if (tree.detached) {
    return {
      action: "blocked",
      kind,
      reason: `${latest} is available, but this checkout is not on a branch, so there is nothing to fast-forward.`,
    };
  }
  if (tree.ahead) {
    return {
      action: "blocked",
      kind,
      reason: `${latest} is available, but this branch has local commits. Merge or rebase yourself; this will not touch your history.`,
    };
  }
  if (tree.dirty) {
    return {
      action: "blocked",
      kind,
      reason: `${latest} is available, but the working tree has uncommitted changes. Commit or stash, then check again.`,
    };
  }

  return { action: "apply", kind, reason: `${latest} is a ${kind} release and applies automatically.` };
};

/**
 * Whether a previous check still counts. This is what keeps the check off the
 * hot path: an agent may call it on every message and all but the first hit
 * the cache and do nothing.
 */
export const isCacheFresh = (
  checkedAt: string | null | undefined,
  now: number,
  ttlHours: number,
): boolean => {
  if (!checkedAt) return false;
  const stamp = Date.parse(checkedAt);
  if (Number.isNaN(stamp)) return false;
  const age = now - stamp;
  // A clock that moved backwards (or a stamp from the future) is not evidence
  // of a recent check.
  if (age < 0) return false;
  return age < ttlHours * 60 * 60 * 1000;
};
