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

        # Optimization: O(1) count for teams
        pilot_count = _count_query(db.collection("teams").where(filter=FieldFilter("pilot_id", "==", user_id)))
        copilot_count = _count_query(db.collection("teams").where(filter=FieldFilter("copilot_id", "==", user_id)))
        total_teams = pilot_count + copilot_count
        
        # Tournaments participation (Chunked query)
        tournaments_count = 0
        # For the count we still need the team IDs, so we fetch them selectively
        team_ids = [doc.id for doc in db.collection("teams").where(filter=FieldFilter("pilot_id", "==", user_id)).select([]).stream()]
        team_ids += [doc.id for doc in db.collection("teams").where(filter=FieldFilter("copilot_id", "==", user_id)).select([]).stream()]
        
        if team_ids:
            for i in range(0, len(team_ids), 30):
                chunk = team_ids[i:i + 30]
                query = db.collection("tournaments").where(filter=FieldFilter("registered_team_ids", "array_contains_any", chunk))
                tournaments_count += _count_query(query)

        return jsonify({
            "user_id": user_id,
            "performance": performance,
            "total_teams": total_teams,
            "total_tournaments": tournaments_count
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- OPTIMIZED MATCH STATS ENDPOINT (ZERO EXTRA READS) ---

@stats_bp.route('/match/<match_id>', methods=['GET'])
def get_match_stats(match_id):
    """
    ULTRA OPTIMIZED: Uses desnormalized names from the match document.
    Reduces Firestore reads to the bare minimum.
    """
    try:
        match_doc = db.collection("matches").document(match_id).get()
        if not match_doc.exists:
            return jsonify({"error": "Match not found"}), 404
        
        m = match_doc.to_dict()

        # Build response directly from the match document
        # No more db.get_all() needed for names!
        detailed_response = {
            "id": match_id,
            "category": m.get("category"),
            "status": m.get("status"),
            "round": m.get("round"),
            "teams": {
                "team_a": {"id": m.get("team_a_id"), "name": m.get("team_a_name", "TBD")},
                "team_b": {"id": m.get("team_b_id"), "name": m.get("team_b_name", "TBD")}
            },
            "result": {
                "winner_id": m.get("winner_id"),
                "winner_name": m.get("winner_name", "TBD")
            },
            "performance": []
        }

        # Fetch telemetry
        stats_query = db.collection("match_stats").where(filter=FieldFilter("match_id", "==", match_id)).stream()
        for stat_doc in stats_query:
            stat_data = stat_doc.to_dict()
            stat_data.pop("match_id", None)
            detailed_response["performance"].append(stat_data)

        return jsonify(detailed_response), 200
    except Exception as e:
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500
