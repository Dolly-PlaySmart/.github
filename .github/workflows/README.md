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

## brand-kit.yml

Pushes a game's `BrandKit/` folder to the Creative Library (Brand assets), so creatives are built from the real game files. Safe on every push: a file already in the library (same SHA-256) is skipped, and a game the library does not know yet is created by its first upload. Uses the uploader `.github/scripts/brand_upload.py` (copy of `scripts/brand_upload.py` of the creative-library repo).

```yaml
# .github/workflows/brand-kit.yml in your game repo
name: Brand kit
on:
  push:
    branches: [main]
    paths: ["BrandKit/**"]
  pull_request:
    paths: ["BrandKit/**"]
  workflow_dispatch:
jobs:
  brand-kit:
    uses: Dolly-PlaySmart/.github/.github/workflows/brand-kit.yml@main
    with:
      game-name: "Tower Smash"
      dry-run: ${{ github.event_name == 'pull_request' }}
    secrets: inherit
```

| Input | Default | Notes |
| --- | --- | --- |
| `game-name` | required | Exact name in the library (list below). An unknown name creates a new game. |
| `kit-path` | `BrandKit` | Folder of the kit, relative to the repo root. |
| `dry-run` | `false` | Lists what would be sent, sends nothing, does not use the key. Used on pull requests. |
| `lfs` | `true` | Pulls Git LFS objects on checkout. |

The run fails (red) if the folder is missing or empty, if the key is not available, or if any file fails to upload.

**Key.** `CL_BRAND_KEY` is an organisation secret, passed with `secrets: inherit`. It can only list and add brand assets. Never put it in a variable, in the repo, in a log or in chat. A pull request only does a dry run and never uses the key.

**Folder layout.** The category is the first folder under `BrandKit/` that matches one of these names. Any other folder lands in "Other", a sound file defaults to "Sound effects".

```
BrandKit/
  Logo/        App icon/    Game logos/   Game icons/   Event icons/
  Characters/  Backgrounds/ UI/           Game items/   Currency/
  Screens/       gameplay screenshots (Game screens)
  Screenshots/   Play Store screenshots (Store screenshots), optional
  SFX/         Music/       Fonts/        Colours/
```

Unity `.meta`, `.psd` and hidden files are ignored. Files up to 300 MB.

**Game names in the library.** Thrillz, Play Smart, Pengudoku, Knife King, Tower Smash, Mahjong Mania, Screw Scramble, Riddle Rails, Solitaire Stars, Black Jack, Bubble Shooter, Arrow Go!, Color Cascade, Fish Escape, Word Search Wonder, Glyph Garden, Checkmate Chess, Clue Cases, Draw Dots, Liquid Lab, Block Blitz, Color Block Escape.

**Exporting the kit from the game repo.** `.github/scripts/export_brandkit.py` builds `BrandKit/` from the repo, so it is rerun when the game changes. Clone `Dolly-PlaySmart/.github` once, then, from anywhere:

```
python3 .github/.github/scripts/export_brandkit.py <path to the game repo> --dry-run   # what would be copied
python3 .github/.github/scripts/export_brandkit.py <path to the game repo>             # writes <repo>/BrandKit
```

- Art comes from `brandkit.json` at the root of the game repo (one list of globs per BrandKit folder). A glob that matches nothing is an error, so a moved file is caught.
- Sound is automatic: every audio file under `Assets/` except the third-party packs. A name or folder that says music, bgm, loop or theme goes to `Music/`, the rest to `SFX/`.
- Only the folders it manages are rewritten (the `brandkit.json` keys, `SFX`, `Music`), so files added by hand, like `Screens/`, are kept.
- Then commit `BrandKit/` and `brandkit.json`: the push triggers the workflow above.

```json
{
  "game": "Tower Smash",
  "art": {
    "App icon":    ["Store/GooglePlay/Icon_512.png"],
    "Game logos":  ["Store/PlaySmartApp/SPRITE_TitleBanner_*.png"],
    "Backgrounds": ["Assets/Sprites/SPRITE_Background.png"]
  }
}
```
