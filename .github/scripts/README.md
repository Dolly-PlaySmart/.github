# Health bot

Weekly drift report for `Dolly-PlaySmart` repos. Triggered by `.github/workflows/health-bot.yml`.

## What it checks

For every non-archived repo in the org (excluding `.github`):

| Check | Rule |
| --- | --- |
| description | non-empty |
| topic:product | `playsmart` present |
| topic:role | one of `mobile-app`, `unity-project`, `sdk`, `api`, `template` |
| topic:state | one of `active`, `maintenance`, `shipped`, `dormant`, `legacy` |
| readme | `README.md` at root |
| claude_md | `CLAUDE.md` at root |
| codeowners | `.github/CODEOWNERS` |
| branch_protection | required for `active`, `maintenance`, `shipped` |
| activity | `active` 90d, `maintenance` 365d, others skipped |

## Outputs

- A GitHub issue in `Dolly-PlaySmart/.github` titled `Weekly health report — YYYY-Www`. Re-running on the same ISO week updates the existing issue.
- A Slack message in `#play-smart` with summary + link to the issue.

## Schedule

Two cron firings in UTC cover Paris 08:00 year-round:

- `0 6 * * 1` (Mon 06:00 UTC) hits 08:00 in CEST (summer).
- `0 7 * * 1` (Mon 07:00 UTC) hits 08:00 in CET (winter).

The script gates on the Paris hour and exits early when it is not 08, so only one run posts per week. Manual `workflow_dispatch` runs bypass the gate (`FORCE=1`).

## Required secrets

Set on `Dolly-PlaySmart/.github` repo:

- `GH_TOKEN` — fine-grained PAT, owner `Dolly-PlaySmart`, all repositories, with:
  - Repository: Metadata (read), Contents (read), Issues (write).
- `SLACK_WEBHOOK_URL` — incoming webhook for `#play-smart`.

The branch-protection check uses `/rules/branches/{branch}`, which sees both legacy branch protection rules and modern rulesets and only requires `metadata:read`.

## Local dry run

```bash
GH_TOKEN=$(gh auth token) DRY_RUN=1 node .github/scripts/health-check.js
```

Prints the markdown report to stdout, opens no issue, posts to no webhook.

# Ad SDK versions

Weekly table of ad and SDK versions per Unity repo (PLAA-867). Triggered by `.github/workflows/ad-sdk-versions.yml`.

## What it reads

Every non-archived repo in the org (excluding `.github`) whose `Packages/manifest.json` on the default branch depends on `gg.dolly.playsmart.sdk` (the games, the template and the Play Smart app). For each one:

| Column | Source |
| --- | --- |
| MAX | `com.applovin.mediation.ads` |
| Extension SDK | ref of `gg.dolly.playsmart.extension.sdk` (`#v1.0.97` → `v1.0.97`; a `file:` path is flagged) |
| Tracking SDK | ref of `gg.dolly.playsmart.sdk` |
| AppsFlyer | ref of `appsflyer-unity-plugin`; a branch pin (`#upm`) also shows the tag its `packages-lock.json` resolves |
| Mintegral, Liftoff, InMobi, DT Exchange, AdMob | `com.applovin.mediation.adapters.<key>.android` / `.ios` (keys `mintegral`, `vungle`, `inmobi`, `fyber`, `google`), decoded to the network SDK version (`25050000.0.0` → `25.5.0`). Other adapters are ignored; the list is `NETWORKS` in the script |

`playsmart-game-template` on `main` is the reference row. Every other cell that differs from it is marked ⚠️, and ❌ when the template has the package and the repo doesn't.

## Outputs

- A GitHub issue in `Dolly-PlaySmart/.github` titled `Ad SDK versions`, updated in place on every run (one stable link).
- The same table in the workflow run's job summary.
- A Slack message in `#play-smart` with the drifting repos + link to the issue (skipped when `SLACK_WEBHOOK_URL` is unset).

## Schedule and secrets

Same as the health bot: Monday 08:00 Paris (two UTC crons + Paris-hour gate), manual `workflow_dispatch` bypasses the gate. Uses the same `GH_TOKEN` (Contents read on all repos, Issues write on `.github`) and `SLACK_WEBHOOK_URL`.

## Local dry run

```bash
GH_TOKEN=$(gh auth token) DRY_RUN=1 node .github/scripts/ad-sdk-versions.js
```
