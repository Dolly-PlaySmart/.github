#!/usr/bin/env python3
"""Brand-asset connector: push a game's assets (logos, icons, characters, UI, backgrounds, sound effects, music, fonts…)
into the Creative Library's Brand assets (creative-library-dolly.vercel.app/library/brand). Python 3.8+, standard library only.

    CL_KEY=<brand upload key> python3 brand_upload.py --game "Tower Smash" ./TowerSmash/BrandKit
    CL_KEY=... python3 brand_upload.py ./AllGames            # one sub-folder per game: ./AllGames/Tower Smash/..., ./AllGames/Knife King/...
    add --dry-run to see what would be sent, without sending anything

- Category = the first folder name under the game folder that matches one of the library's categories
  (Logo/, App icon/, Characters/, Backgrounds/, UI/, SFX/ or Sounds/, Music/, Fonts/…). Anything else goes to "Other";
  a sound file defaults to "Sound effects", a font to "Fonts".
- Name = the file name made readable ("btn_play-big.png" -> "Btn play big"); the relative path is kept in the notes.
- Safe to re-run (e.g. on every build): a file already in the library for that game (same SHA-256) is skipped.
- A game that is not in the library yet is created by the first upload.
- The key (CL_KEY) is a secret: keep it in the CI secret store or a secret manager, never in the repo, Slack or logs (R6).
  It can only list and add brand assets; it cannot delete or rename anything (R7).
Exit code 1 if any file failed, so a CI step shows red.
"""
import argparse, hashlib, json, mimetypes, os, re, sys, urllib.error, urllib.request

SITE = os.environ.get("CL_URL", "https://creative-library-dolly.vercel.app").rstrip("/")
TYPES = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif", "svg": "image/svg+xml",
         "pdf": "application/pdf", "mp4": "video/mp4", "mov": "video/quicktime", "ttf": "font/ttf", "otf": "font/otf", "woff2": "font/woff2",
         "zip": "application/zip", "wav": "audio/wav", "mp3": "audio/mpeg", "ogg": "audio/ogg", "m4a": "audio/mp4"}
AUDIO, FONTS = {"wav", "mp3", "ogg", "m4a"}, {"ttf", "otf", "woff2"}
# folder name (lower case, spaces/_/- removed) -> library category
CATS = [("appicon", "App icon"), ("gamelogo", "Game logos"), ("logo", "Logo"), ("gameicon", "Game icons"), ("eventicon", "Event icons"),
        ("icon", "Game icons"), ("character", "Characters"), ("char", "Characters"), ("mascot", "Characters"),
        ("currency", "Currency & rewards"), ("reward", "Currency & rewards"), ("coin", "Currency & rewards"), ("event", "Event icons"),
        ("item", "Game items"), ("prop", "Game items"), ("background", "Backgrounds"), ("bg", "Backgrounds"), ("ui", "UI elements"),
        ("button", "UI elements"), ("hud", "UI elements"), ("screenshot", "Store screenshots"), ("store", "Store screenshots"),
        ("screen", "Game screens"), ("sfx", "Sound effects"), ("sound", "Sound effects"), ("audio", "Sound effects"),
        ("music", "Music"), ("font", "Fonts"), ("colour", "Colours"), ("color", "Colours"), ("palette", "Colours")]


def category(rel_dirs, ext):
    for d in rel_dirs:
        k = re.sub(r"[\s_\-]+", "", d.lower())
        for key, cat in CATS:
            if k.startswith(key) or k == key + "s":
                return cat
    return "Sound effects" if ext in AUDIO else "Fonts" if ext in FONTS else "Other"


def readable(fname):
    t = re.sub(r"[_\-.]+", " ", os.path.splitext(fname)[0]).strip()
    t = re.sub(r"\s+", " ", t)
    return (t[0].upper() + t[1:]) if t else fname


def api(method, path, key, body=None):
    req = urllib.request.Request(SITE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"authorization": "Bearer " + key, "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path}: {e.code} {e.read()[:200].decode(errors='replace')}")


def files_of(game_dir):
    for root, dirs, names in os.walk(game_dir):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for n in sorted(names):
            ext = n.rsplit(".", 1)[-1].lower() if "." in n else ""
            if n.startswith(".") or ext not in TYPES:      # skips .meta (Unity), .psd, .DS_Store…
                continue
            p = os.path.join(root, n)
            yield p, os.path.relpath(p, game_dir), ext


def push_game(game, game_dir, key, dry):
    have = set()
    if not dry:
        have = {a.get("sha256") for a in api("GET", "/api/brand?game=" + urllib.parse.quote(game), key).get("rows", []) if a.get("sha256")}
    sent = skipped = failed = 0
    for path, rel, ext in files_of(game_dir):
        data = open(path, "rb").read()
        sha = hashlib.sha256(data).hexdigest()
        cat = category(rel.split(os.sep)[:-1], ext)
        name = readable(os.path.basename(path))
        if sha in have:
            skipped += 1; continue
        if len(data) > 300 * 1024 * 1024:
            print(f"  ! {rel}: over 300 MB, skipped"); failed += 1; continue
        if dry:
            print(f"  would add  {cat:20} {name}  ({rel})"); sent += 1; continue
        try:
            u = api("POST", "/api/brand/upload-url", key, {"contentType": TYPES[ext], "size": len(data), "name": os.path.basename(path)})
            put = urllib.request.Request(u["url"], data=data, method="PUT", headers={"content-type": u["contentType"]})
            urllib.request.urlopen(put, timeout=300).read()
            r = api("POST", "/api/brand", key, {"game": game, "category": cat, "name": name, "notes": rel, "key": u["key"],
                                                "ext": u["ext"], "size": len(data), "sha256": sha})
            have.add(sha)
            if r.get("duplicate"): skipped += 1
            else: sent += 1; print(f"  + {cat:20} {name}")
        except Exception as e:
            failed += 1; print(f"  ! {rel}: {e}")
    print(f"{game}: {sent} {'to add' if dry else 'added'}, {skipped} already there, {failed} failed")
    return failed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder"); ap.add_argument("--game", help="game name, e.g. \"Tower Smash\" (else: one sub-folder per game)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    key = os.environ.get("CL_KEY", "")
    if not key and not a.dry_run:
        sys.exit("Set CL_KEY (the brand upload key) in the environment.")
    if not os.path.isdir(a.folder):
        sys.exit(f"{a.folder}: not a folder")
    games = [(a.game, a.folder)] if a.game else [(d, os.path.join(a.folder, d)) for d in sorted(os.listdir(a.folder))
                                                  if os.path.isdir(os.path.join(a.folder, d)) and not d.startswith(".")]
    failed = sum(push_game(g, d, key, a.dry_run) for g, d in games)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    import urllib.parse
    main()
