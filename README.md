# Dolly-PlaySmart — `.github`

Organization-level GitHub configuration for the [Dolly-PlaySmart](https://github.com/Dolly-PlaySmart) org.

## What's in here

| Path | Purpose |
|------|---------|
| `profile/README.md` | Org profile page shown on the GitHub org landing page |
| `CONTRIBUTING.md` | Repo naming conventions and contribution standards |
| `CODEOWNERS` | Default code owners for all repos in the org |
| `pull_request_template.md` | PR description template applied org-wide |
| `ISSUE_TEMPLATE/bug_report.md` | Bug report issue template |
| `ISSUE_TEMPLATE/feature_request.md` | Feature request issue template |
| `.github/workflows/health-bot.yml` | Weekly repo health check workflow |
| `.github/scripts/health-check.js` | Script that powers the health bot |
| `.github/scripts/README.md` | Health bot documentation |

## Health bot

A weekly drift report runs every Monday at 08:00 Paris time. It checks every non-archived repo in the org for:

- Repo description, product/role/state topics
- Presence of `README.md`, `CLAUDE.md`, and `.github/CODEOWNERS`
- Branch protection (required for `active`, `maintenance`, `shipped` repos)
- Recent activity relative to the repo's state tag

Results are posted as a GitHub issue in this repo (`Weekly health report — YYYY-Www`) and summarised in `#play-smart` on Slack.

See [`.github/scripts/README.md`](.github/scripts/README.md) for setup, required secrets, and local dry-run instructions.

## Standards

Full conventions are in [`CONTRIBUTING.md`](CONTRIBUTING.md). Short version:

- All repo names are **lowercase kebab-case** with a product prefix (`playsmart-`, `thrillz-ios-`, `yardz-`, etc.) and a role suffix (`-api`, `-app`, `-sdk`, …).
- Every repo must have a `README.md`, a `CLAUDE.md`, and a `.github/CODEOWNERS`.
- `main` is protected; PRs require one review from CODEOWNERS.
