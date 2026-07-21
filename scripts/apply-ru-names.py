"""Apply Russian creature names from pf2.ru community translations (Foundry pf2e-ru + pf2eRuDB)."""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BESTIARY = ROOT / "data" / "bestiary.json"
PF2R_BASE = "https://gitlab.com/gnuraco/pf2r/-/raw/master/"
PF2R_TREE = "https://gitlab.com/api/v4/projects/gnuraco%2Fpf2r/repository/tree?recursive=true&per_page=100&page={page}"
RUDB_BASE = "https://raw.githubusercontent.com/ARgits/pf2eRuDB/main/src/data/prod/creatures-{i}.json"


def fetch_json(url: str, timeout: int = 120):
    req = urllib.request.Request(url, headers={"User-Agent": "GlubinyBestiary/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def clean_ru(name: str) -> str:
    if not name:
        return name
    s = re.sub(r"\s*\[\s*Legacy\s*\]", "", name, flags=re.I)
    s = re.sub(r"\(\*\)", "", s)
    s = re.sub(r"\s*\([^)]*[A-Za-z][^)]*\)\s*$", "", s).strip()
    return re.sub(r"\s+", " ", s).strip()


def list_pf2r_bestiary_files() -> list[str]:
    paths: list[str] = []
    page = 1
    while True:
        data = fetch_json(PF2R_TREE.format(page=page), timeout=60)
        if not data:
            break
        paths.extend(
            item["path"]
            for item in data
            if "bestiary" in item["path"].lower() and item["path"].endswith(".json")
        )
        page += 1
    return paths


def load_foundry_names() -> dict[str, str]:
    by_en: dict[str, str] = {}
    for path in list_pf2r_bestiary_files():
        try:
            data = fetch_json(PF2R_BASE + path)
        except Exception as err:
            print("skip", path, err)
            continue
        for key, entry in (data.get("entries") or {}).items():
            if isinstance(entry, dict) and entry.get("name"):
                by_en[key.strip().lower()] = clean_ru(entry["name"])
    return by_en


def load_rudb_maps() -> tuple[dict[str, str], dict[int, str]]:
    by_en: dict[str, str] = {}
    by_aon: dict[int, str] = {}
    for i in range(1, 11):
        try:
            data = fetch_json(RUDB_BASE.format(i=i), timeout=60)
        except Exception:
            break
        for creature in data.get("creatures") or []:
            ru = (creature.get("name") or "").strip()
            en = (creature.get("originalName") or "").strip()
            if not ru or not en:
                continue
            by_en[en.lower()] = ru
            match = re.search(r"Monsters\.aspx\?ID=(\d+)", creature.get("fullName") or "")
            if match:
                by_aon[int(match.group(1))] = ru
    return by_en, by_aon


def resolve_ru(entry: dict, by_en: dict[str, str], by_aon: dict[int, str]) -> str | None:
    aon_id = entry.get("aonId")
    if aon_id and aon_id in by_aon:
        return by_aon[aon_id]
    en = (entry.get("nameEn") or entry.get("name") or "").strip()
    if not en:
        return None
    return by_en.get(en.lower())


def main() -> None:
    bestiary = json.loads(BESTIARY.read_text(encoding="utf-8"))
    foundry = load_foundry_names()
    rudb_en, rudb_aon = load_rudb_maps()
    by_en = {**foundry, **rudb_en}

    translated = 0
    for entry in bestiary:
        en = entry.get("nameEn") or entry.get("name")
        if en and not entry.get("nameEn"):
            entry["nameEn"] = en
        ru = resolve_ru(entry, by_en, rudb_aon)
        if ru:
            entry["name"] = ru
            translated += 1

    BESTIARY.write_text(json.dumps(bestiary, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"entries: {len(bestiary)}")
    print(f"translated: {translated}")
    print(f"left in English: {len(bestiary) - translated}")
    print(f"sources: foundry={len(foundry)} rudb_aon={len(rudb_aon)}")


if __name__ == "__main__":
    main()
