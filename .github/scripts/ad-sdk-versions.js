#!/usr/bin/env node
// Weekly ad / SDK version table for Dolly-PlaySmart Unity repos (PLAA-867).
// Reads Packages/manifest.json of every repo that depends on gg.dolly.playsmart.sdk
// (the games, the template and the Play Smart app) and reports AppLovin MAX, each
// mediation adapter, the extension SDK, the core/tracking SDK and AppsFlyer, with
// every cell that differs from playsmart-game-template (main) flagged as drift.
//
// Env:
//   GH_TOKEN              fine-grained PAT with org-wide contents read + issues write on .github
//   SLACK_WEBHOOK_URL     incoming webhook for #play-smart (optional; skipped when unset)
//   ORG                   defaults to Dolly-PlaySmart
//   REPORT_REPO           defaults to ${ORG}/.github (where the issue lives)
//   REFERENCE_REPO        defaults to playsmart-game-template
//   REFERENCE_REF         defaults to main
//   DRY_RUN               "1" to print the report without touching the issue or Slack
//   FORCE                 "1" to bypass the Paris-hour gate (workflow_dispatch sets this)
//   GITHUB_STEP_SUMMARY   set by Actions; the table is also written to the job summary

const fs = require("fs");

const ORG = process.env.ORG || "Dolly-PlaySmart";
const REPORT_REPO = process.env.REPORT_REPO || `${ORG}/.github`;
const REFERENCE_REPO = process.env.REFERENCE_REPO || "playsmart-game-template";
const REFERENCE_REF = process.env.REFERENCE_REF || "main";
const DRY_RUN = process.env.DRY_RUN === "1";
const FORCE = process.env.FORCE === "1";
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

if (!GH_TOKEN) {
  console.error("GH_TOKEN (or GITHUB_TOKEN) is required");
  process.exit(1);
}

// One issue, updated in place every run, so the table always lives at the same link.
const ISSUE_TITLE = "Ad SDK versions";
const ISSUE_LABEL = "ad-sdk-versions";

const MARKER_PACKAGE = "gg.dolly.playsmart.sdk";
const MAX_PACKAGE = "com.applovin.mediation.ads";
const EXTENSION_PACKAGE = "gg.dolly.playsmart.extension.sdk";
const APPSFLYER_PACKAGE = "appsflyer-unity-plugin";
const APPSFLYER_REPO = "AppsFlyerSDK/appsflyer-unity-plugin";
const ADAPTER_RE = /^com\.applovin\.mediation\.adapters\.([^.]+)\.(android|ios)$/;

const SKIP_REPOS = new Set([".github"]);

const gh = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "playsmart-ad-sdk-versions",
      ...(init.headers || {}),
    },
  });
  if (res.status === 404) return { __notFound: true };
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${init.method || "GET"} ${path} -> ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
};

// Returns the parsed JSON file, or null when it doesn't exist or isn't valid JSON.
const readJsonFile = async (repo, path, ref) => {
  const file = await gh(`/repos/${ORG}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
  if (file.__notFound || !file.content) return null;
  try {
    return JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  } catch {
    return null;
  }
};

const parisHour = () =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );

const listOrgRepos = async () => {
  const repos = [];
  let page = 1;
  while (true) {
    const batch = await gh(`/orgs/${ORG}/repos?per_page=100&page=${page}&type=all`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return repos.filter((r) => !r.archived && !SKIP_REPOS.has(r.name));
};

// AppsFlyer publishes tags on the branch it serves through UPM; map commit sha -> tag so a
// floating "#upm" pin can be reported as the version its packages-lock.json actually resolves.
const loadAppsFlyerTags = async () => {
  const bySha = new Map();
  let page = 1;
  while (true) {
    const batch = await gh(`/repos/${APPSFLYER_REPO}/tags?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const t of batch) {
      // Prefer the release tag over its -rc twin when both point at the same commit.
      const prev = bySha.get(t.commit.sha);
      if (!prev || (/-rc/i.test(prev) && !/-rc/i.test(t.name))) bySha.set(t.commit.sha, t.name);
    }
    if (batch.length < 100) break;
    page++;
  }
  return bySha;
};

// AppLovin adapter versions pack the network SDK version two digits per component, read from the
// right (25050000.0.0 = 25.5.0, 903000000.0.0 = 9.3.0, 22090301.0.0 = 22.9.3.1). Decoded so the
// table reads like the networks' own release notes; trailing zero components are trimmed down to x.y.z.
const decodeAdapterVersion = (raw) => {
  const m = /^(\d+)\.0\.0$/.exec(raw || "");
  if (!m || m[1].length < 7) return raw;
  const digits = m[1];
  const parts = [];
  let end = digits.length;
  while (end > 2) {
    parts.unshift(Number(digits.slice(end - 2, end)));
    end -= 2;
  }
  parts.unshift(Number(digits.slice(0, end)));
  while (parts.length > 3 && parts[parts.length - 1] === 0) parts.pop();
  return parts.join(".");
};

// Git URL pins are reported by their ref (#v1.0.97 -> v1.0.97); a local file: path can never
// build anywhere but its author's machine, so it is called out instead of shown.
const describeGitPin = (raw) => {
  if (!raw) return null;
  if (raw.startsWith("file:")) return "local file: path";
  const hash = raw.lastIndexOf("#");
  if (hash >= 0) return raw.slice(hash + 1);
  return raw;
};

const readRepo = async (repo, ref, appsFlyerTags) => {
  const manifest = await readJsonFile(repo.name, "Packages/manifest.json", ref);
  const deps = manifest && manifest.dependencies;
  if (!deps || !deps[MARKER_PACKAGE]) return null;

  const cells = {
    max: deps[MAX_PACKAGE] || null,
    extension: describeGitPin(deps[EXTENSION_PACKAGE]),
    tracking: describeGitPin(deps[MARKER_PACKAGE]),
    appsflyer: describeGitPin(deps[APPSFLYER_PACKAGE]),
  };

  // A branch pin (no "v<semver>" ref) floats, so report what the lock file actually resolved.
  const afRaw = deps[APPSFLYER_PACKAGE];
  if (afRaw && cells.appsflyer && !/^v?\d+(\.\d+)*/.test(cells.appsflyer)) {
    const lock = await readJsonFile(repo.name, "Packages/packages-lock.json", ref);
    const sha = lock && lock.dependencies && lock.dependencies[APPSFLYER_PACKAGE]?.hash;
    const tag = sha && appsFlyerTags.get(sha);
    cells.appsflyer = `${cells.appsflyer} → ${tag || (sha ? sha.slice(0, 7) : "?")}`;
  }

  const adapters = {};
  for (const [pkg, version] of Object.entries(deps)) {
    const m = ADAPTER_RE.exec(pkg);
    if (!m) continue;
    adapters[m[1]] = adapters[m[1]] || {};
    adapters[m[1]][m[2]] = decodeAdapterVersion(version);
  }

  return { name: repo.name, url: repo.html_url, ref, cells, adapters };
};

const adapterCell = (a) => {
  if (!a) return null;
  const android = a.android || "—";
  const ios = a.ios || "—";
  return android === ios ? android : `${android} / ${ios}`;
};

// Template first (reference), then the rest alphabetically. Adapter columns follow the
// template's order, then any network only some games use.
const buildTable = (reference, others) => {
  const rows = [reference, ...others];
  const networks = [...Object.keys(reference.adapters).sort()];
  for (const r of others) for (const n of Object.keys(r.adapters).sort()) if (!networks.includes(n)) networks.push(n);

  const columns = [
    { title: "MAX", get: (r) => r.cells.max },
    { title: "Extension SDK", get: (r) => r.cells.extension },
    { title: "Tracking SDK", get: (r) => r.cells.tracking },
    { title: "AppsFlyer", get: (r) => r.cells.appsflyer },
    ...networks.map((n) => ({ title: n, get: (r) => adapterCell(r.adapters[n]) })),
  ];

  const lines = [
    `| Repo | Drift | ${columns.map((c) => c.title).join(" | ")} |`,
    `| --- | --- | ${columns.map(() => "---").join(" | ")} |`,
  ];

  for (const r of rows) {
    const isReference = r === reference;
    let drift = 0;
    const cells = columns.map((c) => {
      const value = c.get(r);
      const expected = c.get(reference);
      if (isReference) return value || "—";
      if (value === expected) return value || "—";
      drift++;
      return value ? `⚠️ ${value}` : "❌ missing";
    });
    r.drift = drift;
    const name = isReference ? `**[${r.name}](${r.url})** (reference)` : `[${r.name}](${r.url})`;
    lines.push(`| ${name} | ${isReference ? "—" : drift === 0 ? "OK" : drift} | ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
};

const buildMarkdown = (reference, others) => {
  const table = buildTable(reference, others);
  const aligned = others.filter((r) => r.drift === 0).length;
  return [
    `# ${ISSUE_TITLE}`,
    "",
    `Generated at ${new Date().toISOString()} for \`${ORG}\`. Updated every Monday; run the **Ad SDK versions** workflow to refresh it on demand.`,
    "",
    `Reference: \`${reference.name}\` on \`${reference.ref}\`. Every other repo is read from its default branch and compared cell by cell: ⚠️ differs from the reference, ❌ the reference has it and this repo doesn't.`,
    "",
    `- Repos: **${others.length + 1}** (every repo whose \`Packages/manifest.json\` depends on \`${MARKER_PACKAGE}\`)`,
    `- Aligned with the reference: **${aligned}** / ${others.length}`,
    "",
    "Adapter versions are the network SDK versions (AppLovin's `25050000.0.0` = `25.5.0`), shown as `android / ios` when they differ. AppsFlyer pinned to a branch shows the version its `packages-lock.json` resolves (`upm → v6.18.1`).",
    "",
    table,
    "",
  ].join("\n");
};

const upsertIssue = async (title, body) => {
  const [owner, repo] = REPORT_REPO.split("/");
  const search = await gh(
    `/search/issues?q=${encodeURIComponent(`repo:${REPORT_REPO} is:issue in:title "${title}"`)}`,
  );
  const existing = (search.items || []).find((i) => i.title === title);
  if (existing) {
    await gh(`/repos/${owner}/${repo}/issues/${existing.number}`, {
      method: "PATCH",
      body: JSON.stringify({ body, state: "open" }),
    });
    return { number: existing.number, url: existing.html_url, action: "updated" };
  }
  const created = await gh(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels: [ISSUE_LABEL] }),
  });
  return { number: created.number, url: created.html_url, action: "created" };
};

const postSlack = async (reference, others, issueUrl) => {
  if (!SLACK_WEBHOOK_URL) {
    console.log("SLACK_WEBHOOK_URL not set — skipping Slack post");
    return;
  }
  const drifting = others.filter((r) => r.drift > 0).map((r) => r.name);
  const lines = [
    `*Ad SDK versions* (reference: \`${reference.name}\` — MAX ${reference.cells.max || "—"})`,
    `Repos: ${others.length + 1} • Aligned: ${others.length - drifting.length} • Drifting: ${drifting.length}`,
  ];
  if (drifting.length > 0) lines.push(`Drifting: ${drifting.map((n) => `\`${n}\``).join(", ")}`);
  lines.push(`Table: ${issueUrl}`);
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: lines.join("\n") }),
  });
  if (!res.ok) throw new Error(`Slack webhook -> ${res.status}: ${await res.text()}`);
};

const main = async () => {
  if (process.env.GITHUB_EVENT_NAME === "schedule" && !FORCE) {
    const h = parisHour();
    if (h !== 8) {
      console.log(`Skipping — Paris hour is ${h}, gate fires only at 08`);
      return;
    }
  }

  const appsFlyerTags = await loadAppsFlyerTags();
  const repos = await listOrgRepos();
  console.log(`Scanning ${repos.length} repos in ${ORG}`);

  let reference = null;
  const others = [];
  for (const r of repos) {
    const isReference = r.name === REFERENCE_REPO;
    const ref = isReference ? REFERENCE_REF : r.default_branch;
    process.stdout.write(`  - ${r.name}@${ref} ... `);
    const out = await readRepo(r, ref, appsFlyerTags);
    if (!out) {
      console.log(`skipped (no ${MARKER_PACKAGE} in Packages/manifest.json)`);
      continue;
    }
    console.log(`MAX ${out.cells.max || "—"}`);
    if (isReference) reference = out;
    else others.push(out);
  }

  if (!reference) throw new Error(`Reference repo ${REFERENCE_REPO}@${REFERENCE_REF} has no ${MARKER_PACKAGE} dependency`);
  others.sort((a, b) => a.name.localeCompare(b.name));

  const body = buildMarkdown(reference, others);

  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, body);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: report below ---\n");
    console.log(body);
    return;
  }

  const issue = await upsertIssue(ISSUE_TITLE, body);
  console.log(`Issue ${issue.action}: ${issue.url}`);
  await postSlack(reference, others, issue.url);
  console.log("Done.");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
