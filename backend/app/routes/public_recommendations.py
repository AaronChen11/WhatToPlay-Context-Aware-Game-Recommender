from __future__ import annotations

from datetime import datetime
from typing import Any
import requests
from flask import Blueprint, jsonify, request

from app.services.context_ranking import (
    clamp,
    compose_game_text,
    create_standard_reasons,
    get_device_fit,
    get_goal_alignment,
    get_goal_boost,
    get_intensity_by_text,
    get_session_length_by_text,
    get_title_signal_terms,
    is_social_game,
    stable_title_tiebreak,
)

public_bp = Blueprint("public", __name__)

FREETOGAME_URL = "https://www.freetogame.com/api/games"
CHEAPSHARK_URL = "https://www.cheapshark.com/api/1.0/deals"

def normalize_title(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())





def get_release_freshness_signal(release_date: str | None) -> float:
    if not release_date:
        return 0.0
    try:
        released = datetime.strptime(release_date, "%Y-%m-%d")
    except ValueError:
        return 0.0
    age_years = max(0.0, (datetime.utcnow() - released).days / 365.25)
    return clamp(2.5 - (age_years * 0.35), -1.0, 2.5)


def get_public_market_signal(game: dict[str, Any]) -> float:
    steam_rating = clamp((float(game.get("steamRatingPercent") or 70)) / 10, 0, 10)
    savings = clamp(float(game.get("savings") or 0) / 20, 0, 4)
    deal_rating = clamp(float(game.get("dealRating") or 0) * 0.4, 0, 4)
    return steam_rating + savings + deal_rating


def get_goal_detail_bonus(goal: str, descriptor_text: str) -> float:
    positive_hits, negative_hits = get_goal_alignment(goal, descriptor_text)
    return clamp((positive_hits * 0.8) - (negative_hits * 0.6), -1.2, 2.4)


def rank_games(games: list[dict[str, Any]], context: dict[str, Any]) -> list[dict[str, Any]]:
    ranked: list[dict[str, Any]] = []
    for game in games:
        descriptor_text = compose_game_text(
            game.get("genre") or "",
            game.get("title") or "",
            game.get("short_description") or "",
            game.get("publisher") or "",
            get_title_signal_terms(game.get("title") or ""),
        )
        session_length = get_session_length_by_text(descriptor_text)
        intensity = get_intensity_by_text(descriptor_text)
        social_game = is_social_game(descriptor_text)

        time_fit = 40 - clamp(abs(context["timeAvailable"] - session_length), 0, 40)

        if context["energy"] == "low":
            energy_fit = 18 if intensity <= 1 else -10
        else:
            energy_fit = 18 if intensity >= 2 else 2

        social_fit = 14 if context["friendsOnline"] and social_game else (-5 if context["friendsOnline"] else (-2 if social_game else 8))
        goal_boost = get_goal_boost(context["goal"], descriptor_text)

        device_fit = get_device_fit(context["device"], game.get("platform") or "")

        quality_signal = get_public_market_signal(game)
        freshness_signal = get_release_freshness_signal(game.get("release_date"))
        goal_detail_bonus = get_goal_detail_bonus(context["goal"], descriptor_text)
        tie_breaker = stable_title_tiebreak(game.get("title") or "")
        score = time_fit + energy_fit + social_fit + goal_boost + device_fit + quality_signal + freshness_signal + goal_detail_bonus + tie_breaker

        ranked_item = {
            **game,
            "sessionLength": session_length,
            "score": round(score, 4),
            "reasons": create_standard_reasons(
                game,
                descriptor_text=descriptor_text,
                time_available=context["timeAvailable"],
                energy=context["energy"],
                goal=context["goal"],
                friends_online=context["friendsOnline"],
                device=context["device"],
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
                "dealRating": deal.get("dealRating"),
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
