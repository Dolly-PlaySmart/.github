# Dolly-PlaySmart `.github`

Org-wide configuration for the [Dolly-PlaySmart](https://github.com/Dolly-PlaySmart) GitHub organization. Anything that should apply to every repo lives here: contribution guidelines, issue and PR templates, the public organization profile, reusable CI workflows, and automations.

## Layout

| Path | Purpose |
| --- | --- |
| `CONTRIBUTING.md` | Default contribution guidelines inherited by every repo. |
| `pull_request_template.md` | Default PR template inherited by every repo. |
| `ISSUE_TEMPLATE/` | Default issue templates (bug, feature). |
| `profile/README.md` | Public landing page shown at `github.com/Dolly-PlaySmart`. |
| `.github/CODEOWNERS` | Org-wide CODEOWNERS for this repo. |
| `.github/workflows/ci-node.yml` | Reusable CI workflow for Bun + TypeScript repos. |
| `.github/workflows/ci-unity.yml` | Reusable CI workflow for Unity projects. |
| `.github/workflows/health-bot.yml` | Weekly drift report for org repos. |
| `.github/scripts/health-check.js` | Health bot logic. |
| `.github/workflows/README.md` | Caller snippets and inputs for the reusable workflows. |
| `.github/scripts/README.md` | Health bot configuration and required secrets. |
| `docs/` | Source of truth for cross-repo GitBook pages (e.g. `api-reference.md`). |

## Reusable CI workflows

Any repo in the org can use these with a few lines of YAML. Full inputs and examples in [`.github/workflows/README.md`](.github/workflows/README.md).

```yaml
# in any repo: .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
jobs:
  ci:
    uses: Dolly-PlaySmart/.github/.github/workflows/ci-node.yml@main
    with:
      bun-version: "1.3.11"
      mongodb: true
    secrets: inherit
```

## Health bot

A scheduled GitHub Actions workflow runs every Monday 08:00 Paris and posts a drift report (description, topics, README, CLAUDE.md, CODEOWNERS, branch protection, activity) as a GitHub issue here and a summary in `#play-smart`. Configuration in [`.github/scripts/README.md`](.github/scripts/README.md).

## Org standards (enforced by the health bot)

Every repo in `Dolly-PlaySmart` follows:

- Name `playsmart-{role}` in kebab-case.
- One-line description.
- Topics: `playsmart` plus a role (`mobile-app`, `unity-project`, `sdk`, `api`, `template`) and a state (`active`, `maintenance`, `shipped`, `dormant`, `legacy`).
- `README.md` and `CLAUDE.md` at the root.
- `.github/CODEOWNERS`.
- Branch protection on the default branch (org-level ruleset `playsmart-default-protection`).

## GitBook source-of-truth docs

Cross-repo documentation lives under `docs/` and is published to the [Play Smart GitBook space](https://app.gitbook.com/o/0UAIVIFxd9k5njYkK5ZJ/s/auNETYTf2fr8zT53VQgb/) via Git Sync. Edit the markdown here, the page updates on merge.
