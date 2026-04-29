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
  - Repository: Metadata (read), Contents (read), Administration (read), Issues (write).
- `SLACK_WEBHOOK_URL` — incoming webhook for `#play-smart`.

`administration: read` is what gates branch-protection lookups; the default `GITHUB_TOKEN` cannot do it.

## Local dry run

```bash
GH_TOKEN=$(gh auth token) DRY_RUN=1 node .github/scripts/health-check.js
```

Prints the markdown report to stdout, opens no issue, posts to no webhook.
