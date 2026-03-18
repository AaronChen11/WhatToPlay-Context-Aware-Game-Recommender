import time
import requests
import threading
from flask import Blueprint, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app import db
from app.models import SteamProfile, UserGameStat
from app.models_catalog import GameCatalog
from app.services.steam_client import get_owned_games, get_app_details, get_friends_with_status
from app.services.tfidf_index import build_index_from_documents, save_index

steam_bp = Blueprint("steam", __name__)

STEAMSPY_API_URL = "https://steamspy.com/api.php"

# Helper Functions for Data Inference
def build_document(name, genres, tags):
    """Build the document string for TF-IDF text similarity matching."""
    parts = [name]
    if genres: parts.append(genres)
    if tags: parts.append(tags)
    return "\n".join(parts)


def infer_difficulty(tags_dict):
    """Infer game difficulty based on SteamSpy user tags with type safety."""
    # Safety check: if tags_dict is a list or None, return default
    if not isinstance(tags_dict, dict):
        return "medium"

    tags_lower = [t.lower() for t in tags_dict.keys()]
    if any(k in tags_lower for k in ["souls-like", "difficult", "hard", "roguelike", "permadeath"]):
        return "high"
    if any(k in tags_lower for k in ["casual", "relaxing", "cozy", "visual novel", "walking simulator"]):
        return "low"
    return "medium"


def infer_multiplayer_mode(tags_dict):
    """Infer multiplayer mode based on SteamSpy user tags with type safety."""
    # Safety check: if tags_dict is a list or None, return default
    if not isinstance(tags_dict, dict):
        return "solo"

    tags_lower = [t.lower() for t in tags_dict.keys()]
    if any(k in tags_lower for k in ["co-op", "online co-op", "local co-op"]):
        return "coop"
    if any(k in tags_lower for k in ["multiplayer", "pvp", "competitive", "e-sports"]):
        return "pvp"
    if any(k in tags_lower for k in ["mmo", "massively multiplayer"]):
        return "mmo"
    return "solo"

# Internal Logic for Index Rebuilding
def rebuild_tfidf_index_internal():
    """Fetches all games from DB and rebuilds the local .pkl index file."""
    print("[Background Index] Starting TF-IDF index rebuild...")
    rows = db.session.query(GameCatalog.appid, GameCatalog.document).filter(GameCatalog.document.isnot(None)).all()

    if not rows:
        print("[Background Index] No documents found. Skipping index build.")
        return

    appids = [int(r[0]) for r in rows]
    docs = [r[1] or "" for r in rows]

    index = build_index_from_documents(docs, appids)
    out_path = save_index(index)
    print(f"[Background Index] Index saved to: {out_path}. Vocab size: {len(index.vocab)}")


# Background Task: Dual-API Sync + Index Rebuild
def background_sync_missing(app):
    """
    Runs in a background thread to fetch missing metadata
    and rebuild the TF-IDF index.
    """
    with app.app_context():
        # 1. Identify missing games
        owned_appids = {stat.appid for stat in db.session.query(UserGameStat.appid).distinct().all()}
        catalog_appids = {c.appid for c in db.session.query(GameCatalog.appid).all()}

        missing_appids = list(owned_appids - catalog_appids)
        if not missing_appids:
            print("[Background Task] No missing games to sync.")
            return

        print(f"[Background Task] Found {len(missing_appids)} missing games. Starting sync...")

        limit = 100
        inserted = 0

        for appid in missing_appids[:limit]:
            try:
                # --- Step 1: SteamSpy Data ---
                r = requests.get(STEAMSPY_API_URL, params={"request": "appdetails", "appid": appid}, timeout=10)
                r.raise_for_status()
                spy_data = r.json()

                if not spy_data or not spy_data.get("name"):
                    time.sleep(1.5)
                    continue

                name = spy_data.get("name")
                tags_dict = spy_data.get("tags", {})

                # Format tags for storage
                tags_str = ""
                if isinstance(tags_dict, dict):
                    tags_str = ", ".join(tags_dict.keys())

                genres = spy_data.get("genre", "")
                avg_session_minutes = spy_data.get("average_forever", 60) or 60

                # --- Step 2: Official Steam Data ---
                steam_data = get_app_details(appid)
                platforms = steam_data.get("platforms", {}) if steam_data else {}

                # --- Step 3: Persistence ---
                new_game = GameCatalog(
                    appid=appid,
                    name=name,
                    developers=", ".join(spy_data.get("developer", "").split(", ")),
                    publishers=", ".join(spy_data.get("publisher", "").split(", ")),
                    genres=genres,
                    tags=tags_str,
                    positive=spy_data.get("positive", 0),
                    negative=spy_data.get("negative", 0),
                    avg_session_minutes=avg_session_minutes,
                    difficulty=infer_difficulty(tags_dict),
                    multiplayer_mode=infer_multiplayer_mode(tags_dict),
                    document=build_document(name, genres, tags_str),
                    windows=platforms.get("windows", True),
                    mac=platforms.get("mac", False),
                    linux=platforms.get("linux", False),
                    header_image=f"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/header.jpg"
                )
                db.session.add(new_game)
                inserted += 1
                print(f"[Background Task] AppID {appid} synced ({name})")

            except Exception as e:
                print(f"[Background Task] AppID {appid} failed: {e}")

            time.sleep(1.5)  # Rate limit protection

        if inserted > 0:
            db.session.commit()
            print(f"[Background Task] Successfully added {inserted} games. Rebuilding index...")
            rebuild_tfidf_index_internal()
        else:
            print("[Background Task] No new games added.")


# Route: Sync User's Steam Library
@steam_bp.post("/sync")
@jwt_required()
def sync_owned_games():
    """
    Syncs user library AppIDs and playtimes, then triggers
    asynchronous metadata completion.
    """
    user_id = int(get_jwt_identity())
    sp = SteamProfile.query.filter_by(auth_user_id=user_id).first()
    if not sp:
        return jsonify({"error": "steam_not_bound"}), 400

    api_key = current_app.config.get("STEAM_API_KEY", "")
    if not api_key:
        return jsonify({"error": "steam_api_key_missing"}), 500

    games = get_owned_games(api_key, sp.steamid)
    now = int(time.time())

    if not games:
        sp.last_sync_ts = now
        db.session.commit()
        return jsonify({"ok": True, "synced": 0}), 200

    # UPSERT stats
    rows = []
    for g in games:
        rows.append({
            "steamid": sp.steamid,
            "appid": int(g.get("appid")),
            "playtime_forever": int(g.get("playtime_forever", 0)),
            "playtime_2weeks": int(g.get("playtime_2weeks", 0)),
            "last_played": int(g.get("rtime_last_played") or 0) or None
        })

    bind = db.session.get_bind() or db.engine
    dialect_name = bind.dialect.name if bind is not None else ""

    # SQLite on Render free tier can hit parameter limits for large libraries.
    # Chunking avoids "too many SQL variables" during bulk UPSERT.
    chunk_size = 120 if dialect_name == "sqlite" else 500
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i:i + chunk_size]

        if dialect_name == "sqlite":
            stmt = sqlite_insert(UserGameStat).values(chunk)
            stmt = stmt.on_conflict_do_update(
                index_elements=["steamid", "appid"],
                set_={
                    "playtime_forever": stmt.excluded.playtime_forever,
                    "playtime_2weeks": stmt.excluded.playtime_2weeks,
                    "last_played": stmt.excluded.last_played,
                },
            )
            db.session.execute(stmt)
        else:
            stmt = mysql_insert(UserGameStat).values(chunk)
            stmt = stmt.on_duplicate_key_update(
                playtime_forever=stmt.inserted.playtime_forever,
                playtime_2weeks=stmt.inserted.playtime_2weeks,
                last_played=stmt.inserted.last_played
            )
            db.session.execute(stmt)
    sp.last_sync_ts = now
    db.session.commit()

    # Trigger background completion
    app_object = current_app._get_current_object()
    threading.Thread(target=background_sync_missing, args=(app_object,), daemon=True).start()

    return jsonify({
        "ok": True,
        "synced": len(rows),
        "updated_at": now
    }), 200


@steam_bp.get("/friends")
@jwt_required()
def get_steam_friends():
    user_id = int(get_jwt_identity())
    sp = SteamProfile.query.filter_by(auth_user_id=user_id).first()
    if not sp:
        return jsonify({"error": "steam_not_bound"}), 400

    api_key = current_app.config.get("STEAM_API_KEY", "")
    if not api_key:
        return jsonify({"error": "steam_api_key_missing"}), 500

    try:
        players = get_friends_with_status(api_key, sp.steamid)
    except Exception as exc:
        return jsonify({"error": "steam_friends_fetch_failed", "detail": str(exc)}), 502

    def status_label(personastate: int) -> str:
        mapping = {
            0: "Offline",
            1: "Online",
            2: "Busy",
            3: "Away",
            4: "Snooze",
            5: "Looking to trade",
            6: "Looking to play",
        }
        return mapping.get(personastate, "Unknown")

    friends = []
    online_count = 0
    for p in players:
        personastate = int(p.get("personastate", 0))
        online = personastate > 0
        if online:
            online_count += 1
        friends.append(
            {
                "steamid": p.get("steamid"),
                "name": p.get("personaname"),
                "status": status_label(personastate),
                "online": online,
                "avatar": p.get("avatarfull") or p.get("avatarmedium") or p.get("avatar"),
                "game": p.get("gameextrainfo"),
            }
        )

    return jsonify(
        {
            "ok": True,
            "count": len(friends),
            "online_count": online_count,
            "friends": friends,
        }
    ), 200


@steam_bp.get("/library_index")
@jwt_required()
def get_library_index():
    user_id = int(get_jwt_identity())
    sp = SteamProfile.query.filter_by(auth_user_id=user_id).first()
    if not sp:
        return jsonify({"error": "steam_not_bound"}), 400

    stats = UserGameStat.query.filter_by(steamid=sp.steamid).all()
    appids = [int(stat.appid) for stat in stats]

    titles = []
    if appids:
        rows = GameCatalog.query.filter(GameCatalog.appid.in_(appids)).all()
        titles = [row.name for row in rows if row.name]

    return jsonify({"ok": True, "appids": appids, "titles": titles}), 200
