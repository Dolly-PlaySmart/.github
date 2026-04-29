#!/usr/bin/env node
// Weekly health check for Dolly-PlaySmart org repos.
// Reports drift from org standards (description, topics, README, CLAUDE.md,
// CODEOWNERS, branch protection, activity) to a GitHub issue and Slack.
//
// Env:
//   GH_TOKEN              fine-grained PAT with org-wide read + issues write on .github
//   SLACK_WEBHOOK_URL     incoming webhook for #play-smart (optional in dry-run)
//   ORG                   defaults to Dolly-PlaySmart
//   REPORT_REPO           defaults to ${ORG}/.github (where the issue is opened)
//   DRY_RUN               "1" to print report without creating issue or posting Slack
//   FORCE                 "1" to bypass the Paris-hour gate (workflow_dispatch sets this)

const ORG = process.env.ORG || "Dolly-PlaySmart";
const REPORT_REPO = process.env.REPORT_REPO || `${ORG}/.github`;
const DRY_RUN = process.env.DRY_RUN === "1";
const FORCE = process.env.FORCE === "1";
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

if (!GH_TOKEN) {
  console.error("GH_TOKEN (or GITHUB_TOKEN) is required");
  process.exit(1);
}

const SKIP_REPOS = new Set([".github"]);

const ROLE_TOPICS = ["mobile-app", "unity-project", "sdk", "api", "template"];
const STATE_TOPICS = ["active", "maintenance", "shipped", "dormant", "legacy"];

const ACTIVITY_THRESHOLD_DAYS = {
  active: 90,
  maintenance: 365,
};
const BRANCH_PROTECTION_STATES = new Set(["active", "maintenance", "shipped"]);

const gh = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "playsmart-health-bot",
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

const parisHour = () =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Paris",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );

// ISO week number, used in the issue title for idempotency.
const isoWeek = (d = new Date()) => {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { year: date.getUTCFullYear(), week };
};

const listOrgRepos = async () => {
  const repos = [];
  let page = 1;
  while (true) {
    const batch = await gh(`/orgs/${ORG}/repos?per_page=100&page=${page}&type=all`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return repos.filter((r) => !r.archived && !SKIP_REPOS.has(r.name));
};

const fileExists = async (owner, repo, path) => {
  const r = await gh(`/repos/${owner}/${repo}/contents/${path}`);
  return !r.__notFound;
};

const branchProtected = async (owner, repo, branch) => {
  const r = await gh(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`);
  return !r.__notFound;
};

const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const checkRepo = async (repo) => {
  const owner = repo.owner.login;
  const name = repo.name;
  const topics = repo.topics || [];
  const stateTopic = topics.find((t) => STATE_TOPICS.includes(t));
  const roleTopic = topics.find((t) => ROLE_TOPICS.includes(t));
  const hasProductTopic = topics.includes("playsmart");

  const [hasReadme, hasClaudeMd, hasCodeowners, isProtected] = await Promise.all([
    fileExists(owner, name, "README.md"),
    fileExists(owner, name, "CLAUDE.md"),
    fileExists(owner, name, ".github/CODEOWNERS"),
    BRANCH_PROTECTION_STATES.has(stateTopic || "active")
      ? branchProtected(owner, name, repo.default_branch).catch(() => false)
      : Promise.resolve(null),
  ]);

  const checks = [];
  const push = (id, ok, detail) => checks.push({ id, ok, detail });

  push("description", Boolean(repo.description && repo.description.trim()), repo.description || "(empty)");
  push("topic:product", hasProductTopic, hasProductTopic ? "playsmart" : "missing 'playsmart'");
  push("topic:role", Boolean(roleTopic), roleTopic || `missing one of ${ROLE_TOPICS.join("|")}`);
  push("topic:state", Boolean(stateTopic), stateTopic || `missing one of ${STATE_TOPICS.join("|")}`);
  push("readme", hasReadme, hasReadme ? "README.md" : "missing");
  push("claude_md", hasClaudeMd, hasClaudeMd ? "CLAUDE.md" : "missing");
  push("codeowners", hasCodeowners, hasCodeowners ? ".github/CODEOWNERS" : "missing");

  if (isProtected === null) {
    push("branch_protection", true, `skipped (state=${stateTopic || "n/a"})`);
  } else {
    push("branch_protection", isProtected, isProtected ? `protected on ${repo.default_branch}` : `unprotected ${repo.default_branch}`);
  }

  const activityThreshold = ACTIVITY_THRESHOLD_DAYS[stateTopic || "active"];
  const days = daysSince(repo.pushed_at);
  if (activityThreshold === undefined) {
    push("activity", true, `skipped (state=${stateTopic})`);
  } else {
    push("activity", days <= activityThreshold, `${days}d since last push (limit ${activityThreshold}d)`);
  }

  return {
    name,
    url: repo.html_url,
    state: stateTopic || "(unset)",
    role: roleTopic || "(unset)",
    checks,
    drift: checks.filter((c) => !c.ok),
  };
};

const buildMarkdown = (results, weekTag) => {
  const driftCount = results.reduce((sum, r) => sum + r.drift.length, 0);
  const cleanCount = results.filter((r) => r.drift.length === 0).length;

  const head = [
    `# Weekly health report — ${weekTag}`,
    "",
    `Generated at ${new Date().toISOString()} for \`${ORG}\`.`,
    "",
    `- Repos scanned: **${results.length}**`,
    `- Clean: **${cleanCount}**`,
    `- Drift items: **${driftCount}**`,
    "",
  ];

  const summaryHeader = [
    "## Summary",
    "",
    "| Repo | State | Role | Drift |",
    "| --- | --- | --- | --- |",
  ];
  const summaryRows = results.map(
    (r) => `| [${r.name}](${r.url}) | ${r.state} | ${r.role} | ${r.drift.length === 0 ? "OK" : `${r.drift.length}`} |`,
  );

  const detail = ["", "## Drift detail", ""];
  const reposWithDrift = results.filter((r) => r.drift.length > 0);
  if (reposWithDrift.length === 0) {
    detail.push("_No drift detected. All repos pass org standards._");
  } else {
    for (const r of reposWithDrift) {
      detail.push(`### [${r.name}](${r.url})`);
      detail.push("");
      for (const c of r.drift) {
        detail.push(`- **${c.id}** — ${c.detail}`);
      }
      detail.push("");
    }
  }

  return [...head, ...summaryHeader, ...summaryRows, ...detail].join("\n");
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
      body: JSON.stringify({ body }),
    });
    return { number: existing.number, url: existing.html_url, action: "updated" };
  }
  const created = await gh(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels: ["health-bot"] }),
  });
  return { number: created.number, url: created.html_url, action: "created" };
};

const postSlack = async (results, issueUrl, weekTag) => {
  if (!SLACK_WEBHOOK_URL) {
    console.log("SLACK_WEBHOOK_URL not set — skipping Slack post");
    return;
  }
  const driftCount = results.reduce((sum, r) => sum + r.drift.length, 0);
  const reposWithDrift = results.filter((r) => r.drift.length > 0).map((r) => r.name);
  const lines = [
    `*Weekly repo health — ${weekTag}*`,
    `Repos: ${results.length} • Clean: ${results.length - reposWithDrift.length} • Drift: ${driftCount}`,
  ];
  if (reposWithDrift.length > 0) {
    lines.push(`Repos with drift: ${reposWithDrift.map((n) => `\`${n}\``).join(", ")}`);
  }
  lines.push(`Details: ${issueUrl}`);
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

  const repos = await listOrgRepos();
  console.log(`Scanning ${repos.length} repos in ${ORG}`);
  const results = [];
  for (const r of repos) {
    process.stdout.write(`  - ${r.name} ... `);
    const out = await checkRepo(r);
    console.log(out.drift.length === 0 ? "OK" : `drift x${out.drift.length}`);
    results.push(out);
  }

  const { year, week } = isoWeek();
  const weekTag = `${year}-W${String(week).padStart(2, "0")}`;
  const title = `Weekly health report — ${weekTag}`;
  const body = buildMarkdown(results, weekTag);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: report below ---\n");
    console.log(body);
    return;
  }

  const issue = await upsertIssue(title, body);
  console.log(`Issue ${issue.action}: ${issue.url}`);
  await postSlack(results, issue.url, weekTag);
  console.log("Done.");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
