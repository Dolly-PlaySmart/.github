#!/usr/bin/env python3
"""Export a Unity game's BrandKit/ from its repo, ready for the brand-kit workflow (Creative Library).
Python 3.8+, standard library only.

    python3 export_brandkit.py <path to the game repo>            # writes <repo>/BrandKit
    python3 export_brandkit.py <path to the game repo> --dry-run  # shows what would be copied

What it exports
- Art: the files listed in <repo>/brandkit.json, one list of globs per BrandKit folder (see below).
  A glob that matches nothing is an error, so a moved or renamed file is caught.
- Sound: every audio file under Assets/ except the third-party packs (Feel, NiceVibrations, MaxSdk...).
  A file whose name or folder says music / bgm / loop / theme goes to Music/, the rest to SFX/.

brandkit.json (at the root of the game repo):
    {
      "game": "Tower Smash",
      "art": {
        "App icon":    ["Store/GooglePlay/Icon_512.png"],
        "Game logos":  ["Store/PlaySmartApp/SPRITE_TitleBanner_*.png"],
        "Backgrounds": ["Assets/Sprites/SPRITE_Background.png"]
      },
      "audio": {"exclude": ["Assets/SomeVendorPack"], "music": ["jingle"]}
    }
- "game" must match the name in the Creative Library.
- The "art" keys are BrandKit folder names: Logo, App icon, Game logos, Game icons, Event icons, Characters, Backgrounds,
  UI, Game items, Currency, Screens (gameplay screenshots), Screenshots (Play Store), Fonts, Colours.
- "audio" is optional: "exclude" adds paths to skip, "music" adds words that mark a music file.

Only the folders this script manages (the "art" keys, SFX, Music) are rewritten on each run, so files added by hand in
other folders (for example Screens/) are kept. Nothing is uploaded here: the brand-kit workflow does that on push.
"""
import argparse, glob, json, os, re, shutil, sys

AUDIO = {".wav", ".mp3", ".ogg", ".m4a"}
THIRD = {"feel", "nicevibrations", "feeldemos", "feeldemosurp", "feeldemoshdrp", "mmfeedbacks", "plugins", "packages",
         "samples", "maxsdk", "externaldependencymanager", "firebase", "textmesh pro", "spine examples"}
MUSIC = re.compile(r"music|bgm|bkg|loop|theme|ambient|beats|jingle", re.I)


def is_third_party(rel, extra):
    parts = [p.lower() for p in rel.replace("\\", "/").split("/")]
    if any(p in THIRD for p in parts[:-1]):
        return True
    return any(rel.replace("\\", "/").lower().startswith(e.lower().rstrip("/") + "/") for e in extra)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("repo", help="path to the game repo (Unity project root)")
    ap.add_argument("--out", help="output folder (default: <repo>/BrandKit)")
    ap.add_argument("--config", help="config file (default: <repo>/brandkit.json)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    repo = os.path.abspath(a.repo)
    cfg_path = a.config or os.path.join(repo, "brandkit.json")
    if not os.path.isdir(os.path.join(repo, "Assets")):
        sys.exit(f"{repo}: no Assets/ folder, is it a Unity project?")
    if not os.path.isfile(cfg_path):
        sys.exit(f"{cfg_path}: not found (see --help for the format)")
    cfg = json.load(open(cfg_path, encoding="utf-8-sig"))  # utf-8-sig: Windows editors add a BOM
    out = os.path.abspath(a.out or os.path.join(repo, "BrandKit"))
    art = cfg.get("art", {})
    audio_cfg = cfg.get("audio", {})
    extra_exclude = audio_cfg.get("exclude", [])
    music_words = audio_cfg.get("music", [])
    music_re = re.compile(MUSIC.pattern + ("|" + "|".join(map(re.escape, music_words)) if music_words else ""), re.I)

    plan = []  # (source, destination relative to out)
    errors = []

    for folder, patterns in art.items():
        found = 0
        for pat in patterns:
            for src in sorted(glob.glob(os.path.join(repo, pat), recursive=True)):
                if os.path.isfile(src) and not src.endswith(".meta"):
                    plan.append((src, os.path.join(folder, os.path.basename(src))))
                    found += 1
        if not found:
            errors.append(f'art "{folder}": nothing matches {patterns}')

    seen = {}
    assets = os.path.join(repo, "Assets")
    for root, dirs, files in os.walk(assets):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for f in sorted(files):
            ext = os.path.splitext(f)[1].lower()
            if ext not in AUDIO:
                continue
            src = os.path.join(root, f)
            rel = os.path.relpath(src, repo)
            if is_third_party(rel, extra_exclude):
                continue
            kind = "Music" if (music_re.search(f) or music_re.search(os.path.dirname(rel))) else "SFX"
            name = f
            if (kind, name) in seen:  # same file name in two folders: keep both
                name = os.path.basename(root) + "_" + f
            seen[(kind, name)] = src
            plan.append((src, os.path.join(kind, name)))

    counts = {}
    for _, dst in plan:
        counts[dst.split(os.sep)[0]] = counts.get(dst.split(os.sep)[0], 0) + 1
    for k in sorted(counts):
        print(f"  {k:14} {counts[k]:4} files")
    if errors:
        for e in errors:
            print("  ! " + e)
        sys.exit(1)
    if not any(k in counts for k in ("SFX", "Music")):
        print("  ! no audio found under Assets/ (check brandkit.json, 'audio.exclude')")
    missing = [c for c in ("App icon", "Game logos", "Characters", "Backgrounds", "UI", "Screens") if c not in counts]
    if missing:
        print("  not in the kit yet: " + ", ".join(missing))

    if a.dry_run:
        print(f"{cfg.get('game', '?')}: {len(plan)} files would be written to {out}")
        return

    managed = set(art) | {"SFX", "Music"}
    for m in managed:
        shutil.rmtree(os.path.join(out, m), ignore_errors=True)
    for src, dst in plan:
        d = os.path.join(out, dst)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copyfile(src, d)
    print(f"{cfg.get('game', '?')}: {len(plan)} files written to {out}")


if __name__ == "__main__":
    main()
