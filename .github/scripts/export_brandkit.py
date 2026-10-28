#!/usr/bin/env python3
"""Export a Unity game's BrandKit/ from its repo, ready for the brand-kit workflow (Creative Library).
Python 3.8+, standard library only.

    python3 export_brandkit.py <path to the game repo>            # writes <repo>/BrandKit
    python3 export_brandkit.py <path to the game repo> --dry-run  # shows what would be copied

What it exports
- Art: the files listed in <repo>/brandkit.json, one list of globs per BrandKit folder (see below).
  A glob that matches nothing is an error, so a moved or renamed file is caught.
- Sound: every audio file under Assets/ except the third-party packs (Feel, NiceVibrations, MaxSdk...).
  Music or SFX: the first word of the file name decides (SFX_..., AMB_... or MUS_..., BGM_...), then the words music / bgm in
  the name or folder, then the length (a file of about 20 s or more is music). Jingles and stings are SFX.

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
  UI, Items (game objects, props, pieces), Currency, Screens (gameplay screenshots), Screenshots (Play Store), Fonts, Colours.
  Use exactly these names: the uploader reads the category from them ("Game items" would land in Other, use "Items").
- Sprites: every other image under Assets/ (png, jpg, webp, 2 KB to 15 MB, no third-party packs, no 3D texture maps, nothing
  already listed in "art") goes to <category>/Export/<path under Assets>, with the category guessed from its path and name:
  Screens (a Screenshots folder), Characters, Currency, Backgrounds (large files named bg/background), UI (ui, hud, button,
  panel, popup, icon, title...), else Items. The guess is rough: look at the result. Turn it off with "sprites": false, or skip
  folders with "sprites": {"exclude": ["Assets/Environment"]}.
- "audio" is optional: "exclude" adds paths to skip, "music" adds words that mark a music file (when the name or folder has one).

Only what this script manages is rewritten on each run (the "art" keys, SFX, Music and the Export/ subfolders), so files
added by hand in other places (for example Screens/ itself) are kept. Nothing is uploaded here: the brand-kit workflow does that on push.
"""
import argparse, glob, json, os, re, shutil, sys

AUDIO = {".wav", ".mp3", ".ogg", ".m4a"}
THIRD = {"feel", "nicevibrations", "feeldemos", "feeldemosurp", "feeldemoshdrp", "mmfeedbacks", "plugins", "packages",
         "samples", "maxsdk", "externaldependencymanager", "firebase", "textmesh pro", "spine examples"}
SFX_FIRST = {"sfx", "amb", "ambience", "fx", "ui", "vo", "voice", "sound"}  # first word of the file name
MUSIC_FIRST = {"mus", "music", "bgm", "bg", "theme", "soundtrack"}
LONG_BYTES = {".wav": 2_000_000, ".mp3": 700_000, ".ogg": 700_000, ".m4a": 700_000}  # about 20 s: longer is music


def audio_kind(path, rel, music_words):
    """Music or SFX. The first word of the file name decides (SFX_..., MUS_...), then the words music/bgm in the name or
    folder, then the length (a long file is music). Jingles and stings are short effects."""
    stem, ext = os.path.splitext(os.path.basename(path))
    words = [w for w in re.split(r"[_\W]+", stem.lower()) if w]
    first = words[0] if words else ""
    if first in SFX_FIRST:
        return "SFX"
    if first in MUSIC_FIRST:
        return "Music"
    hay = (stem + " " + os.path.dirname(rel)).lower()
    if "music" in hay or "bgm" in hay or any(m.lower() in hay for m in music_words):
        return "Music"
    if any(w in ("jingle", "sting", "stinger") for w in words):
        return "SFX"
    return "Music" if os.path.getsize(path) >= LONG_BYTES.get(ext, 2_000_000) else "SFX"


IMAGES = {".png", ".jpg", ".jpeg", ".webp"}
THIRD_IMG = THIRD | {"playsmart", "gizmos", "editor", "assetkits", "fonts", "font", "lightmaps", "lightmap", "__macosx"}
THREED_MAP = re.compile(r"[_\-](normal|n|albedo|basecolor|metallic|metal|roughness|occlusion|ao|emission|height|mask|spec|specular|lightmap)\.(png|jpe?g)$", re.I)
EXPORT_MIN, EXPORT_MAX = 2_048, 15_000_000  # bytes: tiny files are noise, huge ones are not sprites
RE_SCREEN = re.compile(r"(^|/)screenshots?(/|$)")
RE_CHAR = re.compile(r"character|mascot|avatar|hero|enemy|enemies|monster|npc|penguin")
RE_CURRENCY = re.compile(r"coin|gem|diamond|currency|cash|reward|crown|trophy|chest|gift")
RE_BG = re.compile(r"(^|[/_\W])(bg|background|backdrop|wallpaper)s?([/_\W0-9]|$)")
RE_NOT_BG = re.compile(r"panel|slider|toggle|button|popup|header|footer|score|progress|pattern|glow|details|icon")
RE_UI = re.compile(r"(^|[/_\W])(ui|gui|hud|buttons?|btn|panels?|popups?|menus?|icons?|toggles?|sliders?|settings?|pause|dialogs?|"
                   r"tutorials?|frames?|ribbons?|banners?|titles?|bars?|badges?|cursors?)([/_\W0-9]|$)")


def sprite_category(rel_assets, size):
    """BrandKit folder of an image, from its path and name. The folder names are the ones the uploader knows."""
    p = rel_assets.replace("\\", "/").lower()
    stem = os.path.splitext(os.path.basename(p))[0]
    if RE_SCREEN.search(p):
        return "Screens"
    if RE_CHAR.search(p):
        return "Characters"
    if RE_CURRENCY.search(stem):
        return "Currency"
    if RE_BG.search(stem) and not RE_NOT_BG.search(stem) and size >= 120_000:
        return "Backgrounds"
    if RE_UI.search(p):
        return "UI"
    return "Items"


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
            kind = audio_kind(src, rel, music_words)
            name = f
            # names are compared in lower case: Windows and macOS file systems do not tell Foo.wav from foo.wav
            if (kind, name.lower()) in seen:  # same file name in two folders: keep both
                name = os.path.basename(root) + "_" + f
            n = 2
            base, ext2 = os.path.splitext(name)
            while (kind, name.lower()) in seen:  # still taken (same folder name twice): number it
                name = f"{base}_{n}{ext2}"
                n += 1
            seen[(kind, name.lower())] = src
            plan.append((src, os.path.join(kind, name)))

    sprites_cfg = cfg.get("sprites", True)
    auto_dirs = set()
    if sprites_cfg:
        sprites_cfg = sprites_cfg if isinstance(sprites_cfg, dict) else {}
        sp_exclude = sprites_cfg.get("exclude", [])
        taken = {os.path.normcase(os.path.abspath(s)) for s, _ in plan}
        for root, dirs, files in os.walk(assets):
            dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d.lower() not in THIRD_IMG)
            for f in sorted(files):
                if os.path.splitext(f)[1].lower() not in IMAGES or THREED_MAP.search(f):
                    continue
                src = os.path.join(root, f)
                size = os.path.getsize(src)
                rel_repo = os.path.relpath(src, repo)
                if not (EXPORT_MIN <= size <= EXPORT_MAX) or is_third_party(rel_repo, sp_exclude):
                    continue
                if os.path.normcase(os.path.abspath(src)) in taken:
                    continue  # already exported through "art"
                rel_assets = os.path.relpath(src, assets)
                cat = sprite_category(rel_assets, size)
                auto_dirs.add(cat)
                plan.append((src, os.path.join(cat, "Export", rel_assets)))

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
    missing = [c for c in ("App icon", "Game logos", "Characters", "Backgrounds", "UI", "Screens", "Items") if c not in counts]
    if missing:
        print("  not in the kit yet: " + ", ".join(missing))

    if a.dry_run:
        print(f"{cfg.get('game', '?')}: {len(plan)} files would be written to {out}")
        return

    managed = set(art) | {"SFX", "Music"}
    for m in managed:
        shutil.rmtree(os.path.join(out, m), ignore_errors=True)
    for c in ("UI", "Characters", "Currency", "Items", "Backgrounds", "Screens"):  # auto sprites: only their Export/ subfolder
        shutil.rmtree(os.path.join(out, c, "Export"), ignore_errors=True)
    for src, dst in plan:
        d = os.path.join(out, dst)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copyfile(src, d)
    print(f"{cfg.get('game', '?')}: {len(plan)} files written to {out}")


if __name__ == "__main__":
    main()
