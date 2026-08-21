/**
 * `npm run om:check` — the update check an agent runs once per session.
 *
 * Design notes worth keeping:
 *
 * - It is cached. An agent that calls this on every message pays for it once
 *   per TTL window; every other call reads a file and exits. Never depend on
 *   an agent remembering to do something only once, make repeating it free.
 * - It exits 0 for every normal outcome, including "blocked" and "offline",
 *   so it can never break a chain of commands an agent is running.
 * - The last line is machine readable, so an agent can act without parsing
 *   prose: `om:check result=<action> kind=<kind> local=<v> latest=<v>`.
 * - It refuses to touch a checkout with uncommitted or unpushed work. The
 *   decision itself lives in src/update/policy.ts.
 *
 * Flags: --force (ignore the cache), --json (machine output only).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideUpdate,
  isCacheFresh,
  type Decision,
  type GitState,
  type TreeState,
} from "../src/update/policy";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, ".overlay-motion");
const cacheFile = join(cacheDir, "last-check.json");

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const asJson = args.has("--json");

const TTL_HOURS = Number(process.env.OM_CHECK_TTL_HOURS ?? 12);
/** A failed lookup is retried sooner than a successful one. */
const OFFLINE_TTL_HOURS = 1;
/**
 * Static file at the site root, written at deploy time from the same release
 * feed. It is a cache of the truth rather than a second source: the site asks
 * GitHub once while deploying, and clients that GitHub rate limits ask the
 * site. It sits at the root and not under /api because /api is php-fpm routes
 * on the box, and a mirror that needs an nginx edit to exist is a mirror that
 * quietly stops existing.
 */
const MIRROR = "https://overlaymotion.com/version.json";
const FALLBACK_REPO = "ricardo/overlay-motion";

const git = (...cmd: string[]): string => {
  try {
    return execFileSync("git", cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const localVersion = (): string | null => {
  try {
    return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
};

/**
 * Reads the repo slug from the origin remote so a fork checks its own
 * releases. OM_CHECK_REPO overrides it, which is how this gets exercised
 * against a real release feed before our own repo is public.
 */
const repoSlug = (): string => {
  if (process.env.OM_CHECK_REPO) return process.env.OM_CHECK_REPO;
  const url = git("remote", "get-url", "origin");
  const match = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
  return match ? `${match[1]}/${match[2]}` : FALLBACK_REPO;
};

/**
 * `git()` swallows every failure into an empty string, so a machine with no
 * git and a directory that is not a checkout used to look identical to a
 * detached HEAD. Ask git about itself first, then about the directory.
 */
const gitState = (): GitState => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
  } catch {
    return "missing";
  }
  return git("rev-parse", "--git-dir") === "" ? "not-a-checkout" : "ok";
};

const treeState = (): TreeState => ({
  git: gitState(),
  dirty: git("status", "--porcelain") !== "",
  ahead: Number(git("rev-list", "--count", "@{upstream}..HEAD") || 0) > 0,
  detached: git("symbolic-ref", "--quiet", "HEAD") === "",
});

type Release = { latest: string; breaking: boolean; notes: string } | null;

const fetchJson = async (url: string, headers: Record<string, string> = {}): Promise<any> => {
  const response = await fetch(url, {
    headers: { "user-agent": "overlay-motion-update-check", ...headers },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
};

/**
 * GitHub releases are the source of truth: the repo is the distribution, so
 * the release feed needs no server of ours to exist. The site is only a mirror
 * for the rate-limited case.
 *
 * A release marks itself breaking by putting `om:breaking` in its body, which
 * is what lets a 0.x minor still stop and ask.
 */
const fetchRelease = async (): Promise<Release> => {
  try {
    const data = await fetchJson(`https://api.github.com/repos/${repoSlug()}/releases/latest`, {
      accept: "application/vnd.github+json",
    });
    if (data?.tag_name) {
      return {
        latest: String(data.tag_name),
        breaking: /om:breaking/i.test(String(data.body ?? "")),
        notes: String(data.html_url ?? ""),
      };
    }
  } catch {
    // fall through to the mirror
  }
  try {
    const data = await fetchJson(MIRROR);
    if (data?.latest) {
      return {
        latest: String(data.latest),
        breaking: Boolean(data.breaking),
        notes: String(data.notes ?? ""),
      };
    }
  } catch {
    // offline, private repo, or rate limited
  }
  return null;
};

type CacheEntry = {
  checkedAt: string;
  local: string | null;
  latest: string | null;
  notes: string;
  decision: Decision;
};

const readCache = (): CacheEntry | null => {
  try {
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  } catch {
    return null;
  }
};

const writeCache = (entry: CacheEntry) => {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFile, `${JSON.stringify(entry, null, 2)}\n`);
};

const report = (entry: CacheEntry, extra: string[] = [], cached = false) => {
  const { decision, local, latest, notes } = entry;
  if (!asJson) {
    const age = cached ? " (cached)" : "";
    console.log(`OverlayMotion ${local ?? "unknown"} — ${decision.action}${age}`);
    console.log(`  ${decision.reason}`);
    for (const line of extra) console.log(`  ${line}`);
    if (notes && (decision.action === "ask" || decision.action === "apply")) {
      console.log(`  Release notes: ${notes}`);
    }
  }
  console.log(
    `om:check result=${decision.action} kind=${decision.kind} local=${local ?? "unknown"} latest=${latest ?? "unknown"}`,
  );
};

const run = async () => {
  const local = localVersion();
  const cached = readCache();

  if (!force && cached && isCacheFresh(cached.checkedAt, Date.now(), ttlFor(cached))) {
    report(cached, [], true);
    return;
  }

  const release = await fetchRelease();
  const decision = decideUpdate({
    local,
    latest: release?.latest ?? null,
    breaking: release?.breaking ?? false,
    tree: treeState(),
  });

  const entry: CacheEntry = {
    checkedAt: new Date().toISOString(),
    local,
    latest: release?.latest ?? null,
    notes: release?.notes ?? "",
    decision,
  };

  const extra: string[] = [];
  if (decision.action === "apply") {
    const before = git("rev-parse", "HEAD");
    git("pull", "--ff-only");
    const after = git("rev-parse", "HEAD");
    if (after && after !== before) {
      const changed = git("diff", "--name-only", `${before}..${after}`).split("\n");
      extra.push(`Updated ${before.slice(0, 7)} to ${after.slice(0, 7)}, ${changed.length} files.`);
      if (changed.includes("package-lock.json") || changed.includes("package.json")) {
        extra.push("Dependencies changed, running npm install.");
        try {
          execFileSync("npm", ["install"], { cwd: root, stdio: asJson ? "ignore" : "inherit" });
        } catch {
          extra.push("npm install failed, run it yourself before rendering.");
        }
      }
      // The version on disk moved, so record what we are actually on now.
      entry.local = localVersion();
    } else {
      extra.push("Pull did not move HEAD, nothing changed.");
    }
  }

  writeCache(entry);
  report(entry, extra);
};

/** A lookup that failed should be retried sooner than a successful one. */
const ttlFor = (entry: CacheEntry): number =>
  entry.decision.action === "unavailable" ? OFFLINE_TTL_HOURS : TTL_HOURS;

run().catch((error) => {
  console.error(`om:check failed: ${error instanceof Error ? error.message : String(error)}`);
  console.log("om:check result=unavailable kind=none local=unknown latest=unknown");
});
