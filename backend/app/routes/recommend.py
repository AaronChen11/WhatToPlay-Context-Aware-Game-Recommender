from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import SteamProfile, UserContextLog, UserGameStat, UserPreference
from app.models_catalog import GameCatalog
from app.services.recommender import (
    RecommendationContext,
    has_minimum_review_count,
    parse_preference,
    score_candidate,
    update_user_preference,
)
from app.services.steam_client import get_friend_online_count

recommend_bp = Blueprint("recommend", __name__)


@recommend_bp.post("")
@jwt_required()
def recommend_games():
    user_id = int(get_jwt_identity())
    payload = request.get_json(silent=True) or {}

    time_available_min = int(payload.get("time_available_min") or 45)
    energy_level = (payload.get("energy_level") or "low").strip().lower()
    goal = (payload.get("goal") or "relax").strip().lower()
    platform = (payload.get("platform") or "windows").strip().lower()
    social_mode = (payload.get("social_mode") or "any").strip().lower()
    prefer_installed = bool(payload.get("prefer_installed", True))
    shuffle_seed = int(payload.get("shuffle_seed") or 0)

    if energy_level not in ("low", "high"):
        return jsonify({"error": "invalid_energy_level"}), 400
    if goal not in ("relax", "competitive", "story", "social"):
        return jsonify({"error": "invalid_goal"}), 400
    if platform not in ("windows", "mac", "linux"):
        return jsonify({"error": "invalid_platform"}), 400
    if social_mode not in ("solo", "social", "any"):
        return jsonify({"error": "invalid_social_mode"}), 400

    steam = SteamProfile.query.filter_by(auth_user_id=user_id).first()
    if not steam:
        return jsonify({"error": "steam_not_bound"}), 400

    # Candidate generation from user backlog/library
    stats = UserGameStat.query.filter_by(steamid=steam.steamid).all()
    if not stats:
        return jsonify({"error": "empty_library", "hint": "sync_steam_first"}), 400

    appids = [s.appid for s in stats]
    catalog_rows = GameCatalog.query.filter(GameCatalog.appid.in_(appids)).all()
    by_appid = {c.appid: c for c in catalog_rows}

    friends_online_count = get_friend_online_count(current_app.config.get("STEAM_API_KEY", ""), steam.steamid)
    ctx = RecommendationContext(
        time_available_min=max(10, min(300, time_available_min)),
        energy_level=energy_level,
        goal=goal,
        platform=platform,
        social_mode=social_mode,
        prefer_installed=prefer_installed,
        friends_online_count=friends_online_count,
    )

    db.session.add(UserContextLog(
        auth_user_id=user_id,
        time_available_min=ctx.time_available_min,
        energy_level=ctx.energy_level,
        platform=ctx.platform,
        social_mode=ctx.social_mode,
    ))

    pref = UserPreference.query.filter_by(auth_user_id=user_id).first()
    genre_weights = parse_preference(pref)
    comfort_bias = pref.comfort_bias if pref else 0.0

    scored = []
    for stat in stats:
        cat = by_appid.get(stat.appid)
        if not cat:
            continue

        if not has_minimum_review_count(cat):
            continue

        # platform filtering (candidate generation)
        supported = {
            "windows": bool(cat.windows),
            "mac": bool(cat.mac),
            "linux": bool(cat.linux),
        }
        if not supported.get(platform, False):
            continue

        score, reasons = score_candidate(stat, cat, ctx, genre_weights, comfort_bias)

        if shuffle_seed:
            score += ((stat.appid + shuffle_seed) % 7) * 0.07

        scored.append({
            "appid": stat.appid,
            "name": cat.name,
            "header_image": cat.header_image,
            "genres": cat.genres,
            "avg_session_minutes": cat.avg_session_minutes,
            "difficulty": cat.difficulty,
            "multiplayer_mode": cat.multiplayer_mode,
            "playtime_forever": stat.playtime_forever,
            "score": round(score, 4),
            "why": reasons,
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    top_pick = scored[0] if scored else None
    alternatives = scored[1:8] if len(scored) > 1 else []

    db.session.commit()

    return jsonify({
        "context": {
            "time_available_min": ctx.time_available_min,
            "energy_level": ctx.energy_level,
            "goal": ctx.goal,
            "platform": ctx.platform,
            "social_mode": ctx.social_mode,
        },
        "friends_online_count": friends_online_count,
        "top_pick": top_pick,
        "alternatives": alternatives,
        "total_candidates": len(scored),
    }), 200


@recommend_bp.post("/feedback")
@jwt_required()
def recommendation_feedback():
    user_id = int(get_jwt_identity())
    payload = request.get_json(silent=True) or {}

    appid = int(payload.get("appid") or 0)
    action = (payload.get("action") or "").strip().lower()
    genres = payload.get("genres") or ""
    context_snapshot = payload.get("context") or {}

    if not appid:
        return jsonify({"error": "missing_appid"}), 400
    if action not in ("accept", "reject", "click"):
        return jsonify({"error": "invalid_action"}), 400

    update_user_preference(db, user_id, appid, action, genres, context_snapshot)
    db.session.commit()

    return jsonify({"ok": True}), 200