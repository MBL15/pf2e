import json
import re
from pathlib import Path

src = Path(r"c:\Users\matve\днд\data\monsters-raw.json")
data = json.loads(src.read_text(encoding="utf-8"))

SIZE_MAP = {
    "tiny": "tiny",
    "small": "small",
    "medium": "medium",
    "large": "large",
    "huge": "huge",
    "gargantuan": "gargantuan",
}

TYPE_HINTS = [
    ("undead", "undead"),
    ("dragon", "dragon"),
    ("fiend", "fiend"),
    ("celestial", "monitor"),
    ("animal", "animal"),
    ("beast", "beast"),
    ("construct", "construct"),
    ("elemental", "elemental"),
    ("fey", "fey"),
    ("giant", "giant"),
    ("humanoid", "humanoid"),
    ("ooze", "ooze"),
    ("plant", "plant"),
    ("spirit", "spirit"),
    ("aberration", "aberration"),
    ("monitor", "monitor"),
]


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def land_speed(speed) -> int:
    if not isinstance(speed, dict):
        return 25
    for key in ("land", "walk", "burrow", "climb", "swim", "fly"):
        if key in speed and isinstance(speed[key], (int, float)):
            return int(speed[key])
    for v in speed.values():
        if isinstance(v, (int, float)):
            return int(v)
    return 25


def creature_type(traits: list[str]) -> str:
    lower = [t.lower() for t in traits]
    for needle, tid in TYPE_HINTS:
        if any(needle in t for t in lower):
            return tid
    return "beast"


def parse_attack(abilities: list[str]):
    text = " ".join(abilities or [])
    m = re.search(r"(?:Melee|Ranged|Strike)[^\n]{0,50}?\+(\d+)", text, re.I)
    bonus = int(m.group(1)) if m else None
    dm = re.search(r"(\d+d\d+(?:\s*\+\s*\d+)?)", text)
    damage = dm.group(1).replace(" ", "") if dm else ""
    return bonus, damage


out = []
seen = set()
for m in data:
    name = (m.get("name") or "").strip()
    if not name:
        continue
    key = name.lower()
    if key in seen:
        continue
    seen.add(key)

    traits_raw = m.get("traits") or []
    traits = []
    for t in traits_raw:
        if isinstance(t, dict):
            n = t.get("name")
            if n:
                traits.append(n)
        elif isinstance(t, str):
            traits.append(t)

    size = SIZE_MAP.get(str(m.get("size") or "Medium").lower(), "medium")
    perc = m.get("perception") or {}
    perception = perc.get("bonus") if isinstance(perc, dict) else (perc or 0)
    saves = m.get("saves") or {}
    abilities = m.get("abilities") or []
    ab_text = [a if isinstance(a, str) else str(a) for a in abilities] if isinstance(abilities, list) else []
    attack, damage = parse_attack(ab_text)
    meta = m.get("meta") or {}
    try:
        level = int(m.get("level"))
    except (TypeError, ValueError):
        continue

    out.append(
        {
            "id": slugify(name),
            "name": name,
            "nameEn": name,
            "level": level,
            "hp": int(m.get("hp") or 1),
            "ac": int(m.get("ac") or 10),
            "fort": int(saves.get("fort") or 0),
            "ref": int(saves.get("ref") or 0),
            "will": int(saves.get("will") or 0),
            "perception": int(perception or 0),
            "speed": land_speed(m.get("speed")),
            "size": size,
            "creatureType": creature_type(traits),
            "traits": traits[:10],
            "attackBonus": attack,
            "damage": damage,
            "source": (meta.get("source") or "")[:80],
            "aonId": meta.get("aonId"),
            "aonUrl": meta.get("aonUrl") or "",
            "note": "; ".join(ab_text[:2])[:220],
        }
    )

out.sort(key=lambda e: (e["level"], e["name"].lower()))
dest = Path(r"c:\Users\matve\днд\data\bestiary.json")
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("entries", len(out), "bytes", dest.stat().st_size)
