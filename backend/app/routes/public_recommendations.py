from __future__ import annotations

from typing import Any
import requests
from flask import Blueprint, jsonify, request

public_bp = Blueprint("public", __name__)

FREETOGAME_URL = "https://www.freetogame.com/api/games"
CHEAPSHARK_URL = "https://www.cheapshark.com/api/1.0/deals"


def clamp(num: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, num))


def normalize_title(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def get_session_length_by_genre(genre: str = "") -> int:
    key = genre.lower()
    if any(x in key for x in ("battle", "moba", "shooter")):
        return 30
    if any(x in key for x in ("roguel", "action")):
        return 40
    if any(x in key for x in ("racing", "sports")):
        return 35
    if any(x in key for x in ("strategy", "rpg")):
        return 75
    if "mmo" in key:
        return 90
    if any(x in key for x in ("adventure", "story")):
        return 60
    if any(x in key for x in ("sandbox", "simulation")):
        return 50
    return 45


def get_intensity_by_genre(genre: str = "") -> int:
    key = genre.lower()
    if any(x in key for x in ("horror", "battle", "moba")):
        return 3
    if any(x in key for x in ("shooter", "action", "sports")):
        return 2
    if any(x in key for x in ("puzzle", "adventure", "rpg")):
        return 1
    if any(x in key for x in ("sandbox", "simulation", "casual")):
        return 0
    return 1


def is_social_genre(genre: str = "") -> bool:
    key = genre.lower()
    return any(x in key for x in ("mmo", "battle", "moba", "shooter", "sports"))


def get_goal_boost(goal: str, genre: str, social_game: bool) -> int:
    key = genre.lower()
    if goal == "relax":
        return 16 if any(x in key for x in ("simulation", "sandbox", "casual", "puzzle")) else -4
    if goal == "competitive":
        return 16 if any(x in key for x in ("sports", "battle", "moba", "shooter")) else -4
    if goal == "story":
        return 16 if any(x in key for x in ("adventure", "rpg")) else -3
    if goal == "social":
        return 16 if social_game else -6
    return 0


def create_reasons(item: dict[str, Any], time_available: int, energy: str, goal: str, friends_online: bool, device: str) -> list[str]:
    reasons: list[str] = []
    session_length = get_session_length_by_genre(item.get("genre") or "")
    social_game = is_social_genre(item.get("genre") or "")
    intensity = get_intensity_by_genre(item.get("genre") or "")

    if abs(session_length - time_available) <= 20:
        reasons.append(f"Fits your {time_available} minute window")
    if energy == "low" and intensity <= 1:
        reasons.append("Low mental load for your current energy")
    if energy == "high" and intensity >= 2:
        reasons.append("High intensity option while you are focused")
    if goal == "social" and social_game:
        reasons.append("Built for social sessions")
    if friends_online and social_game:
        reasons.append("Friends online can make this more fun right now")
    if not friends_online and not social_game:
        reasons.append("Great solo flow when friends are offline")
    if device == "mobile" and "browser" in (item.get("platform") or "").lower():
        reasons.append("Playable on a lighter device setup")
    if item.get("salePrice"):
        reasons.append(f"On sale for ${float(item['salePrice']):.2f}")

    return reasons[:3]


def rank_games(games: list[dict[str, Any]], context: dict[str, Any]) -> list[dict[str, Any]]:
    ranked: list[dict[str, Any]] = []
    for game in games:
        genre = game.get("genre") or ""
        session_length = get_session_length_by_genre(genre)
        intensity = get_intensity_by_genre(genre)
        social_game = is_social_genre(genre)

        time_fit = 40 - clamp(abs(context["timeAvailable"] - session_length), 0, 40)

        if context["energy"] == "low":
            energy_fit = 18 if intensity <= 1 else -10
        else:
            energy_fit = 18 if intensity >= 2 else 2

        social_fit = 14 if context["friendsOnline"] and social_game else (-5 if context["friendsOnline"] else (-2 if social_game else 8))
        goal_boost = get_goal_boost(context["goal"], genre, social_game)

        platform = (game.get("platform") or "").lower()
        device = context["device"]
        if device == "pc":
            device_fit = 10 if "pc" in platform else 2
        elif device == "console":
            device_fit = 4 if "pc" in platform else 9
        else:
            device_fit = 10 if ("browser" in platform or "web" in platform) else 3

        quality_signal = clamp((float(game.get("steamRatingPercent") or 70)) / 10, 0, 10)
        score = time_fit + energy_fit + social_fit + goal_boost + device_fit + quality_signal

        ranked_item = {
            **game,
            "sessionLength": session_length,
            "score": round(score, 4),
            "reasons": create_reasons(
                game,
                context["timeAvailable"],
                context["energy"],
                context["goal"],
                context["friendsOnline"],
                context["device"],
            ),
        }
        ranked.append(ranked_item)

    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked


@public_bp.post("/recommend")
def public_recommend():
    payload = request.get_json(silent=True) or {}

    device = str(payload.get("device") or "pc").strip().lower()
    energy = str(payload.get("energy") or "low").strip().lower()
    goal = str(payload.get("goal") or "relax").strip().lower()
    time_available = int(payload.get("timeAvailable") or 45)
    friends_online = bool(payload.get("friendsOnline", False))

    if device not in ("pc", "console", "mobile"):
        return jsonify({"error": "invalid_device"}), 400
    if energy not in ("low", "high"):
        return jsonify({"error": "invalid_energy"}), 400
    if goal not in ("relax", "competitive", "story", "social"):
        return jsonify({"error": "invalid_goal"}), 400

    time_available = max(15, min(180, time_available))
    platform_param = "browser" if device == "mobile" else "pc"

    try:
        free_res = requests.get(FREETOGAME_URL, params={"platform": platform_param}, timeout=15)
        free_res.raise_for_status()

        deal_res = requests.get(
            CHEAPSHARK_URL,
            params={"pageSize": 80, "storeID": 1, "sortBy": "DealRating", "onSale": 1},
            timeout=15,
        )
        deal_res.raise_for_status()
    except Exception as exc:
        return jsonify({"error": "upstream_fetch_failed", "detail": str(exc)}), 502

    free_games = free_res.json()[:60]
    deals = deal_res.json()

    deal_map = {normalize_title(d.get("title", "")): d for d in deals}

    merged_games: list[dict[str, Any]] = []
    for game in free_games:
        title_key = normalize_title(game.get("title", ""))
        deal = deal_map.get(title_key, {})
        merged_games.append(
            {
                **game,
                "salePrice": deal.get("salePrice"),
                "normalPrice": deal.get("normalPrice"),
                "savings": deal.get("savings"),
                "steamRatingPercent": deal.get("steamRatingPercent"),
                "thumb": deal.get("thumb"),
                "steamAppID": deal.get("steamAppID"),
            }
        )

    ranked = rank_games(
        merged_games,
        {
            "timeAvailable": time_available,
            "energy": energy,
            "goal": goal,
            "device": device,
            "friendsOnline": friends_online,
        },
    )

    return jsonify({"ok": True, "results": ranked}), 200
