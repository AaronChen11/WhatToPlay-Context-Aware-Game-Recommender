from __future__ import annotations

from typing import Any


def clamp(num: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, num))


SOCIAL_KEYWORDS = (
    "mmo",
    "battle",
    "moba",
    "shooter",
    "sports",
    "multiplayer",
    "coop",
    "co-op",
    "pvp",
    "party",
)
GOAL_KEYWORDS = {
    "relax": {
        "positive": (
            "simulation", "sandbox", "casual", "puzzle", "cozy", "relaxing", "atmospheric", "wholesome", "funny",
            "family friendly", "nature", "building", "farming", "farming sim", "life sim", "crafting", "exploration",
            "walking simulator", "management",
        ),
        "negative": (
            "shooter", "fps", "battle", "moba", "esports", "competitive", "pvp", "horror", "difficult", "survival horror",
            "fast paced", "arena shooter", "hero shooter",
        ),
    },
    "competitive": {
        "positive": (
            "sports", "basketball", "football", "baseball", "hockey", "racing", "battle", "moba", "shooter", "fps",
            "fighting", "strategy", "pvp", "competitive", "esports", "team-based", "team based", "score attack",
            "tactical", "fast-paced", "fast paced", "arena shooter", "hero shooter", "looter shooter",
        ),
        "negative": (
            "cozy", "relaxing", "casual", "story", "story rich", "visual novel", "walking simulator", "wholesome",
            "narrative", "conversation",
        ),
    },
    "story": {
        "positive": (
            "adventure", "rpg", "story", "story rich", "narrative", "choices matter", "multiple endings", "conversation",
            "narration", "lore-rich", "detective", "mystery", "visual novel", "interactive fiction", "singleplayer",
            "drama", "emotional",
        ),
        "negative": ("battle royale", "esports", "arena shooter", "pvp", "score attack"),
    },
    "social": {
        "positive": (
            "mmo", "mmorpg", "multiplayer", "co-op", "coop", "online co-op", "massively multiplayer", "party", "party game",
            "team-based", "team based", "guild", "squad", "pvp", "pve", "local multiplayer", "local co-op",
        ),
        "negative": ("singleplayer", "solo", "story rich"),
    },
}

TITLE_SIGNAL_HINTS = {
    ("counter strike", "counter-strike", "csgo", "cs2"): ("shooter", "fps", "competitive", "pvp", "multiplayer"),
    ("nba 2k", "nba2k"): ("sports", "basketball", "competitive", "multiplayer"),
    ("ea sports fc", "fifa"): ("sports", "football", "competitive", "multiplayer"),
}
LOW_INTENSITY_KEYWORDS = (
    "sandbox",
    "simulation",
    "casual",
    "cozy",
    "relax",
    "puzzle",
    "walking simulator",
    "visual novel",
)
MID_INTENSITY_KEYWORDS = (
    "puzzle",
    "adventure",
    "rpg",
    "story",
    "narrative",
)
FPS_PRIORITY_KEYWORDS = (
    "fps",
    "shooter",
    "hero shooter",
    "arena shooter",
    "looter shooter",
    "tactical",
    "team-based",
    "team based",
    "pvp",
    "esports",
)

HIGH_INTENSITY_KEYWORDS = (
    "horror",
    "battle",
    "moba",
    "shooter",
    "action",
    "sports",
    "fighting",
    "souls-like",
)


def compose_game_text(*parts: str | None) -> str:
    return " ".join(str(part or "") for part in parts).strip().lower()


def contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def normalize_terms(*raw_values: str) -> set[str]:
    terms: set[str] = set()
    for raw in raw_values:
        if not raw:
            continue
        text = str(raw).lower()
        for token in text.replace("/", " ").replace("-", " ").replace("_", " ").replace("&", " ").split(","):
            for piece in token.split():
                piece = piece.strip()
                if piece:
                    terms.add(piece)
            token = token.strip()
            if token:
                terms.add(token)
    return terms


def keyword_matches(keyword: str, normalized_terms: set[str], haystack: str) -> bool:
    normalized_keyword = keyword.lower().strip()
    if not normalized_keyword:
        return False
    return normalized_keyword in normalized_terms or normalized_keyword in haystack




def get_priority_keyword_hits(keywords: tuple[str, ...], text: str = "", multiplayer_mode: str = "") -> int:
    haystack = compose_game_text(text, multiplayer_mode)
    terms = normalize_terms(haystack)
    return sum(1 for keyword in keywords if keyword_matches(keyword, terms, haystack))

def get_goal_alignment(goal: str, text: str = "", multiplayer_mode: str = "") -> tuple[int, int]:
    config = GOAL_KEYWORDS.get(goal)
    if not config:
        return 0, 0
    haystack = compose_game_text(text, multiplayer_mode)
    terms = normalize_terms(haystack)
    positive_hits = sum(1 for keyword in config["positive"] if keyword_matches(keyword, terms, haystack))
    negative_hits = sum(1 for keyword in config["negative"] if keyword_matches(keyword, terms, haystack))
    return positive_hits, negative_hits




def get_title_signal_terms(title: str = "") -> str:
    normalized_title = str(title or "").lower().replace(":", " ")
    hints: list[str] = []
    for aliases, terms in TITLE_SIGNAL_HINTS.items():
        if any(alias in normalized_title for alias in aliases):
            hints.extend(terms)
    return " ".join(hints)

def stable_title_tiebreak(value: str = "") -> float:
    normalized = "".join(ch for ch in value.lower() if ch.isalnum())
    if not normalized:
        return 0.0
    return (sum(ord(ch) for ch in normalized) % 17) / 100


def get_session_length_by_text(text: str = "") -> int:
    key = text.lower()
    if any(x in key for x in ("battle", "moba", "shooter", "fighting", "party")):
        return 30
    if any(x in key for x in ("roguel", "action", "arcade")):
        return 40
    if any(x in key for x in ("racing", "sports")):
        return 35
    if any(x in key for x in ("strategy", "rpg", "4x")):
        return 75
    if "mmo" in key:
        return 90
    if any(x in key for x in ("adventure", "story", "narrative", "visual novel")):
        return 60
    if any(x in key for x in ("sandbox", "simulation", "builder", "farming")):
        return 50
    return 45


def get_intensity_by_text(text: str = "", difficulty: str = "") -> int:
    key = compose_game_text(text, difficulty)
    if contains_any(key, HIGH_INTENSITY_KEYWORDS) or any(x in key for x in ("hard", "high difficulty")):
        return 3
    if any(x in key for x in ("shooter", "action", "sports", "competitive", "pvp", "medium")):
        return 2
    if contains_any(key, MID_INTENSITY_KEYWORDS):
        return 1
    if contains_any(key, LOW_INTENSITY_KEYWORDS) or any(x in key for x in ("easy", "low difficulty")):
        return 0
    return 1


def is_social_game(text: str = "", multiplayer_mode: str = "") -> bool:
    key = compose_game_text(text, multiplayer_mode)
    return contains_any(key, SOCIAL_KEYWORDS)


def get_goal_boost(goal: str, text: str = "", multiplayer_mode: str = "") -> float:
    positive_hits, negative_hits = get_goal_alignment(goal, text, multiplayer_mode)

    if goal == "social":
        if positive_hits == 0:
            return -6 - min(4, negative_hits * 2)
        return clamp(10 + (positive_hits * 3) - (negative_hits * 2), -6, 18)

    baseline_penalty = {"relax": -4, "competitive": -4, "story": -3}.get(goal, 0)
    if positive_hits == 0:
        return baseline_penalty - min(4, negative_hits * 2)

    if goal == "competitive":
        score = 8 + (positive_hits * 2.5) - (negative_hits * 3)
        fps_hits = get_priority_keyword_hits(FPS_PRIORITY_KEYWORDS, text, multiplayer_mode)
        if fps_hits > 0:
            score += min(6, 2 + (fps_hits * 0.9))
        return clamp(score, -8, 28)

    score = 10 + (positive_hits * 4) - (negative_hits * 3)
    return clamp(score, -8, 22)


def get_device_fit(device: str, platform_text: str = "") -> int:
    platform = (platform_text or "").lower()
    if device == "pc":
        return 10 if "pc" in platform or "windows" in platform or "linux" in platform or "mac" in platform else 2
    if device == "console":
        return 4 if "pc" in platform or "windows" in platform or "linux" in platform or "mac" in platform else 9
    return 10 if ("browser" in platform or "web" in platform or "mobile" in platform) else 3


def create_standard_reasons(
    item: dict[str, Any],
    *,
    descriptor_text: str,
    time_available: int,
    energy: str,
    goal: str,
    friends_online: bool,
    device: str,
    multiplayer_mode: str = "",
    difficulty: str = "",
) -> list[str]:
    reasons: list[str] = []
    session_length = get_session_length_by_text(descriptor_text)
    social_game = is_social_game(descriptor_text, multiplayer_mode)
    intensity = get_intensity_by_text(descriptor_text, difficulty)

    if abs(session_length - time_available) <= 20:
        reasons.append(f"Fits your {time_available} minute window")
    if energy == "low" and intensity <= 1:
        reasons.append("Low mental load for your current energy")
    if energy == "high" and intensity >= 2:
        reasons.append("High intensity option while you are focused")
    goal_positive_hits, goal_negative_hits = get_goal_alignment(goal, descriptor_text, multiplayer_mode)
    if goal == "relax" and goal_positive_hits > goal_negative_hits:
        reasons.append("Supports a more relaxed session")
    if goal == "competitive" and goal_positive_hits > goal_negative_hits:
        fps_hits = get_priority_keyword_hits(FPS_PRIORITY_KEYWORDS, descriptor_text, multiplayer_mode)
        reasons.append("Strong FPS fit for a competitive session" if fps_hits > 0 else "Matches a competitive mood")
    if goal == "story" and goal_positive_hits > goal_negative_hits:
        reasons.append("Strong fit for a story-driven session")
    if goal == "social" and goal_positive_hits > goal_negative_hits and social_game:
        reasons.append("Built for social sessions")
    if friends_online and social_game:
        reasons.append("Friends online can make this more fun right now")
    if not friends_online and not social_game:
        reasons.append("Great solo flow when friends are offline")
    if device == "mobile" and any(x in (item.get("platform") or "").lower() for x in ("browser", "web", "mobile")):
        reasons.append("Playable on a lighter device setup")
    if item.get("salePrice"):
        reasons.append(f"On sale for ${float(item['salePrice']):.2f}")

    return reasons[:3]
