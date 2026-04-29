# Reusable workflows

Org-wide CI workflows. Any repo in `Dolly-PlaySmart` can call them with a few lines of YAML.

## ci-node.yml

Runs `bun typecheck` and `bun test`. Optionally starts a MongoDB 7 container on `localhost:27017` for integration tests.

```yaml
# .github/workflows/ci.yml in your repo
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
      test-env: |
        MONGO_URI_TEST=mongodb://admin:admin@localhost:27017/playsmart_test?authSource=admin
        JWT_SECRET=ci-test-secret-0123456789abcdef
```

| Input | Default | Notes |
| --- | --- | --- |
| `bun-version` | `1.3.11` | Pin per repo. |
| `working-directory` | `.` | Use the repo root for monorepos; bun workspaces handle the rest. |
| `run-typecheck` | `true` | Skips silently if `package.json` has no `typecheck` script. |
| `run-tests` | `true` | Calls `bun run test`. |
| `mongodb` | `false` | Spins up a MongoDB 7 container before tests. |
| `mongoms-version` | `7.0.5` | Cache key for `mongodb-memory-server` binaries. |
| `test-env` | `""` | Multi-line `KEY=value` pairs exported into `$GITHUB_ENV`. Non-secret only. |

For secrets (e.g. real DB credentials), pass them via `secrets: inherit` from the caller; the reusable workflow will see them on `$GITHUB_ENV` automatically when the caller defines them.

## ci-unity.yml

Runs `unity-test-runner` and `unity-builder` against a Unity project. Pro license via `UNITY_EMAIL` / `UNITY_PASSWORD` / `UNITY_SERIAL` org secrets.

```yaml
# .github/workflows/ci.yml in your repo
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
jobs:
  ci:
    uses: Dolly-PlaySmart/.github/.github/workflows/ci-unity.yml@main
    with:
      target-platform: Android
    secrets: inherit
```

| Input | Default | Notes |
| --- | --- | --- |
| `unity-version` | auto-detected | Reads `ProjectSettings/ProjectVersion.txt` if empty. |
| `project-path` | `.` | Path to the Unity project root. |
| `run-tests` | `true` | Runs `unity-test-runner`. |
| `test-mode` | `editmode` | `editmode`, `playmode`, or `all`. |
| `run-build` | `true` | Runs `unity-builder` to validate compilation. |
| `target-platform` | `StandaloneLinux64` | Fastest for compile-only validation. Use `Android` for shipping builds. |
| `lfs` | `true` | Pulls Git LFS objects on checkout. |

### Required secrets (org-level, already set on `Dolly-PlaySmart`)

- `UNITY_EMAIL`, `UNITY_PASSWORD`, `UNITY_SERIAL` — Pro license activation.
- `GH_TOKEN` — optional; PAT used by Unity to fetch private UPM packages from other org repos.

The caller MUST pass these with `secrets: inherit` (or an explicit mapping) — public reusable workflows do not see private secrets unless the private caller forwards them.
