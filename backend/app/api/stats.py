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

# --- RANKING ENDPOINTS ---

@stats_bp.route('/ranking/teams', methods=['GET'])
def get_team_ranking():
    """
    Returns the top teams based on the performance of their members.
    Supports optional 'category' and 'limit' query parameters.
    """
    try:
        from flask import request
        category = request.args.get('category')
        limit_val = request.args.get('limit', default=50, type=int)

        query = db.collection("teams")
        if category and category != 'all':
            query = query.where(filter=FieldFilter("category", "==", category))
        
        teams_list = list(query.limit(limit_val * 2).stream()) # Fetch more to allow sorting after computing points
        if not teams_list:
            return jsonify([]), 200

        # Collect all unique user IDs to fetch them in one go
        uids = set()
        for doc in teams_list:
            t = doc.to_dict()
            if t.get("pilot_id"): uids.add(t["pilot_id"])
            if t.get("copilot_id"): uids.add(t["copilot_id"])
        
        # Batch fetch all participants
        participants_map = {}
        if uids:
            p_refs = [db.collection("participants").document(uid) for uid in uids]
            p_docs = db.get_all(p_refs)
            participants_map = {doc.id: doc.to_dict() for doc in p_docs if doc.exists}

        ranking = []
        for team_doc in teams_list:
            t = team_doc.to_dict()
            score = 0
            matches = 0
            
            # Fix: We only use the Pilot's stats to represent the Team performance.
            # Summing pilot + copilot doubles the points since they win/play together.
            pilot_id = t.get("pilot_id")
            p_data = participants_map.get(pilot_id)
            if p_data:
                p_stats = p_data.get("stats", {})
                score = p_stats.get("win", 0) * 3
                matches = p_stats.get("matchesPlayed", 0)
            
            ranking.append({
                "id": team_doc.id,
                "name": t.get("name", "Unknown"),
                "category": t.get("category", "N/A"),
                "points": score,
                "matches": matches,
                "win_rate": round((score / (matches * 3) * 100), 2) if matches > 0 else 0
            })
            
        ranking.sort(key=lambda x: x["points"], reverse=True)
        return jsonify(ranking[:limit_val]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@stats_bp.route('/records', methods=['GET'])
def get_records():
    """Fetches special hall-of-fame style records based on real data."""
    try:
        # 1. Most Active & Top Scorer (from teams)
        teams_list = list(db.collection("teams").limit(100).stream())
        uids = set()
        for doc in teams_list:
            t = doc.to_dict()
            if t.get("pilot_id"): uids.add(t["pilot_id"])
        
        participants_map = {}
        if uids:
            p_refs = [db.collection("participants").document(uid) for uid in uids]
            p_docs = db.get_all(p_refs)
            participants_map = {doc.id: doc.to_dict() for doc in p_docs if doc.exists}

        most_active = {"name": "N/A", "value": 0}
        top_scorer = {"name": "N/A", "value": 0}
        best_win_rate = {"name": "N/A", "value": 0}
        
        for team_doc in teams_list:
            t = team_doc.to_dict()
            pilot_id = t.get("pilot_id")
            p_data = participants_map.get(pilot_id)
            if p_data:
                stats = p_data.get("stats", {})
                matches = stats.get("matchesPlayed", 0)
                wins = stats.get("win", 0)
                points = wins * 3
                win_rate = round((wins / matches * 100), 1) if matches > 0 else 0
                
                if matches > most_active["value"]:
                    most_active = {"name": t.get("name"), "value": matches}
                if points > top_scorer["value"]:
                    top_scorer = {"name": t.get("name"), "value": points}
                if win_rate > best_win_rate["value"] and matches >= 3: # Minimum 3 matches for win rate record
                    best_win_rate = {"name": t.get("name"), "value": win_rate}

        # 2. Fastest Lap (from match_stats)
        # We look for the minimum total_time in match_stats
        fastest_query = db.collection("match_stats").order_by("total_time").limit(1).stream()
        fastest_lap = {"name": "N/A", "value": "0.000"}
        
        for stat_doc in fastest_query:
            s_data = stat_doc.to_dict()
            t_id = s_data.get("team_id")
            time_val = s_data.get("total_time", 0)
            if t_id:
                t_doc = db.collection("teams").document(t_id).get()
                t_name = t_doc.to_dict().get("name", "Unknown") if t_doc.exists else "Unknown"
                fastest_lap = {"name": t_name, "value": f"{time_val:.3f}s"}

        return jsonify({
            "most_active": most_active,
            "top_scorer": top_scorer,
            "best_win_rate": best_win_rate,
            "fastest_lap": fastest_lap
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@stats_bp.route('/matchup/<team_a_id>/<team_b_id>', methods=['GET'])
def get_direct_matchup(team_a_id, team_b_id):
    """Calculates direct head-to-head stats between two teams."""
    try:
        # We need to check both A vs B and B vs A
        q1 = db.collection("matches").where(filter=FieldFilter("team_a_id", "==", team_a_id)).where(filter=FieldFilter("team_b_id", "==", team_b_id)).stream()
        q2 = db.collection("matches").where(filter=FieldFilter("team_a_id", "==", team_b_id)).where(filter=FieldFilter("team_b_id", "==", team_a_id)).stream()
        
        matches = list(q1) + list(q2)
        total = len(matches)
        
        a_wins = 0
        b_wins = 0
        for m in matches:
            m_data = m.to_dict()
            winner = m_data.get("winner_id")
            if winner == team_a_id: a_wins += 1
            elif winner == team_b_id: b_wins += 1
            
        return jsonify({
            "total_matches": total,
            "team_a_wins": a_wins,
            "team_b_wins": b_wins,
            "team_a_win_rate": round((a_wins / total * 100), 1) if total > 0 else 0,
            "team_b_win_rate": round((b_wins / total * 100), 1) if total > 0 else 0
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
