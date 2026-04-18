from flask import Blueprint, jsonify
from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.db import db
from backend.app.utils import serialize_firestore
from backend.app.models.racing_category import racing_category

stats_bp = Blueprint('stats', __name__)

# --- HELPERS ---

def _count_query(query):
    """Efficiently counts documents in a query using the native .count() method."""
    results = query.count().get()
    return results[0][0].value

# --- GLOBAL STATS ENDPOINTS ---

@stats_bp.route('/global/summary', methods=['GET'])
def get_global_summary():
    try:
        return jsonify({
            "total_users": _count_query(db.collection("users")),
            "total_teams": _count_query(db.collection("teams")),
            "total_tournaments": _count_query(db.collection("tournaments")),
            "total_matches": _count_query(db.collection("matches"))
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@stats_bp.route('/global/tournaments', methods=['GET'])
def get_global_tournaments_stats():
    try:
        stats = {"total": _count_query(db.collection("tournaments"))}
        for status in ["current", "past", "scheduled"]:
            query = db.collection("tournaments").where(filter=FieldFilter("status", "==", status))
            stats[status] = _count_query(query)
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@stats_bp.route('/global/categories', methods=['GET'])
def get_global_categories_stats():
    try:
        categories_data = {}
        for cat in racing_category:
            cat_val = cat.value
            teams_query = db.collection("teams").where(filter=FieldFilter("category", "==", cat_val))
            tourn_query = db.collection("tournaments").where(filter=FieldFilter("category", "==", cat_val))
            categories_data[cat_val] = {
                "teams": _count_query(teams_query),
                "tournaments": _count_query(tourn_query)
            }
        return jsonify(categories_data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- USER STATS ENDPOINT ---

@stats_bp.route('/user/<user_id>', methods=['GET'])
def get_user_stats(user_id):
    try:
        participant_doc = db.collection("participants").document(user_id).get()
        performance = {"win": 0, "loss": 0, "matchesPlayed": 0, "win_rate": 0}
        
        if participant_doc.exists:
            p_data = participant_doc.to_dict().get("stats", {})
            performance.update(p_data)
            if performance["matchesPlayed"] > 0:
                performance["win_rate"] = round((performance["win"] / performance["matchesPlayed"]) * 100, 2)

        pilot_query = db.collection("teams").where(filter=FieldFilter("pilot_id", "==", user_id))
        copilot_query = db.collection("teams").where(filter=FieldFilter("copilot_id", "==", user_id))
        
        team_ids = [doc.id for doc in pilot_query.stream()] + [doc.id for doc in copilot_query.stream()]
        
        tournaments_count = 0
        if team_ids:
            for i in range(0, len(team_ids), 30):
                chunk = team_ids[i:i + 30]
                query = db.collection("tournaments").where(
                    filter=FieldFilter("registered_team_ids", "array_contains_any", chunk)
                )
                tournaments_count += _count_query(query)

        return jsonify({
            "user_id": user_id,
            "performance": performance,
            "total_teams": len(team_ids),
            "total_tournaments": tournaments_count
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- OPTIMIZED MATCH STATS ENDPOINT (BATCH GET) ---

@stats_bp.route('/match/<match_id>', methods=['GET'])
def get_match_stats(match_id):
    """Returns detailed match information using Batch Get for teams to minimize round-trips."""
    try:
        # 1. Get Match Document
        match_doc = db.collection("matches").document(match_id).get()
        if not match_doc.exists:
            return jsonify({"error": "Match not found"}), 404
        
        match_data = match_doc.to_dict()
        team_ids_to_fetch = filter(None, [
            match_data.get("team_a_id"),
            match_data.get("team_b_id"),
            match_data.get("winner_id")
        ])
        
        # 2. Batch Get Teams (This is the Level 1 optimization)
        # We create unique references and fetch them all at once
        unique_team_ids = list(set(team_ids_to_fetch))
        team_names_map = {}
        
        if unique_team_ids:
            team_refs = [db.collection("teams").document(tid) for tid in unique_team_ids]
            # db.get_all() performs a single multi-document fetch
            team_docs = db.get_all(team_refs)
            for doc in team_docs:
                if doc.exists:
                    team_names_map[doc.id] = doc.to_dict().get("name", "Unknown Team")

        # 3. Build Response using the map
        team_a_id = match_data.get("team_a_id")
        team_b_id = match_data.get("team_b_id")
        winner_id = match_data.get("winner_id")

        detailed_response = {
            "id": match_id,
            "category": match_data.get("category"),
            "status": match_data.get("status"),
            "round": match_data.get("round"),
            "teams": {
                "team_a": {"id": team_a_id, "name": team_names_map.get(team_a_id, "TBD")},
                "team_b": {"id": team_b_id, "name": team_names_map.get(team_b_id, "TBD")}
            },
            "result": {
                "winner_id": winner_id,
                "winner_name": team_names_map.get(winner_id, "TBD") if winner_id else "TBD"
            },
            "performance": []
        }

        # 4. Fetch Telemetry
        stats_query = db.collection("match_stats").where(filter=FieldFilter("match_id", "==", match_id)).stream()
        for stat_doc in stats_query:
            stat_data = stat_doc.to_dict()
            stat_data.pop("match_id", None)
            detailed_response["performance"].append(stat_data)

        return jsonify(detailed_response), 200
    except Exception as e:
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500
