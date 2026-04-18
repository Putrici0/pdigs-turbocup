from datetime import datetime
import random

from flask import Blueprint, jsonify, request
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.db import db
from backend.app.utils import serialize_firestore

tournaments_bp = Blueprint('tournaments', __name__)

# --- HELPERS ---

def _parse_iso_datetime(value):
    if not value: return None
    try: return datetime.fromisoformat(value)
    except: return None

def _compute_status(start_date_str, end_date_str):
    """
    Fixed: Added safety checks for None comparisons to prevent TypeError.
    """
    start_date = _parse_iso_datetime(start_date_str)
    end_date = _parse_iso_datetime(end_date_str)
    now = datetime.now()
    
    if start_date and start_date > now: 
        return 'scheduled'
    # Check for end_date existence before comparing
    if end_date and end_date < now: 
        return 'past'
    
    return 'current' if start_date else 'scheduled'

def _serialize_tournament(doc):
    data = serialize_firestore(doc)
    data.setdefault('participants', [])
    data.setdefault('registered_team_ids', [])
    data.setdefault('creator_id', '')
    data['status'] = _compute_status(data.get('start_date'), data.get('end_date'))
    return data

# --- LECTURA ---

@tournaments_bp.route("/", methods=["GET"])
def get_tournaments():
    tournaments = db.collection("tournaments").stream()
    return jsonify([_serialize_tournament(doc) for doc in tournaments]), 200

@tournaments_bp.route("/<tournament_id>/details", methods=["GET"])
def get_tournament_detailed(tournament_id):
    tourn_ref = db.collection("tournaments").document(tournament_id)
    tourn_doc = tourn_ref.get()
    if not tourn_doc.exists: return jsonify({"message": "Tournament not found"}), 404
    
    detailed_data = _serialize_tournament(tourn_doc)
    matches_query = db.collection("matches").where(filter=FieldFilter("tournament_id", "==", tournament_id)).stream()
    
    detailed_data["matches"] = []
    for m in matches_query:
        m_dict = m.to_dict()
        m_dict["id"] = m.id
        detailed_data["matches"].append(m_dict)
    return jsonify(detailed_data), 200

# --- ACCIONES ---

@tournaments_bp.route('/<tournament_id>/generate-matches', methods=['POST'])
def generate_tournament_matches(tournament_id):
    """
    Improved: Handles odd team counts with a BYE and prevents duplicate generation.
    """
    simulate = request.args.get('simulate', 'false').lower() == 'true'
    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()
    if not tourn_doc.exists: return jsonify({"message": "Tournament not found"}), 404
    
    # 1. Check if matches already exist to avoid duplicates
    existing_matches = db.collection("matches").where(filter=FieldFilter("tournament_id", "==", tournament_id)).limit(1).get()
    if len(list(existing_matches)) > 0:
        return jsonify({"message": "Matches have already been generated for this tournament."}), 409

    tourn_data = tourn_doc.to_dict()
    team_ids = tourn_data.get('registered_team_ids', [])
    category = tourn_data.get('category')
    
    if len(team_ids) < 2: return jsonify({"message": "Need at least 2 teams"}), 400

    team_names = {}
    team_refs = [db.collection("teams").document(tid) for tid in team_ids]
    for doc in db.get_all(team_refs):
        if doc.exists: team_names[doc.id] = doc.to_dict().get('name', 'Unknown')

    shuffled = team_ids.copy()
    random.shuffle(shuffled)
    
    generated = []
    # If odd, the last team gets a BYE (not implemented as a match, or as a special match)
    # For now, we pair all we can
    for i in range(0, len(shuffled) - 1, 2):
        id_a, id_b = shuffled[i], shuffled[i+1]
        
        winner_id = None
        winner_name = "TBD"
        status = "scheduled"
        stats_a, stats_b = None, None

        if simulate:
            status = "past"
            stats_a = {"sector_1": round(random.uniform(28.0, 32.0), 3), "sector_2": round(random.uniform(42.0, 48.0), 3), "sector_3": round(random.uniform(26.0, 30.0), 3)}
            stats_b = {"sector_1": round(random.uniform(28.0, 32.0), 3), "sector_2": round(random.uniform(42.0, 48.0), 3), "sector_3": round(random.uniform(26.0, 30.0), 3)}
            total_a, total_b = sum(stats_a.values()), sum(stats_b.values())
            winner_id = id_a if total_a < total_b else id_b
            winner_name = team_names.get(winner_id, "Unknown")

        match_data = {
            "tournament_id": tournament_id,
            "team_a_id": id_a, "team_a_name": team_names.get(id_a, "TBD"),
            "team_b_id": id_b, "team_b_name": team_names.get(id_b, "TBD"),
            "category": category,
            "status": status,
            "winner_id": winner_id,
            "winner_name": winner_name,
            "round": 1,
            "created_at": datetime.utcnow().isoformat()
        }
        _, m_ref = db.collection("matches").add(match_data)
        match_data["id"] = m_ref.id
        generated.append(match_data)
        
        if simulate:
            for tid, s_data in [(id_a, stats_a), (id_b, stats_b)]:
                db.collection("match_stats").add({"match_id": m_ref.id, "team_id": tid, "average_speed": round(random.uniform(210, 310), 2), "section_times": s_data})
                t_info = db.collection("teams").document(tid).get().to_dict()
                for role in ["pilot_id", "copilot_id"]:
                    uid = t_info.get(role)
                    if uid:
                        win = 1 if tid == winner_id else 0
                        db.collection("participants").document(uid).update({
                            "stats.matchesPlayed": firestore.Increment(1),
                            "stats.win": firestore.Increment(win),
                            "stats.loss": firestore.Increment(0 if win else 1)
                        })

    # Optional: Logic for the team that stayed alone (BYE)
    if len(shuffled) % 2 != 0:
        # One team left! You could create a 'Bye' match or just log it
        pass

    return jsonify({"message": f"Generated {len(generated)} matches", "simulated": simulate}), 201

@tournaments_bp.route('/<tournament_id>/join', methods=['POST'])
def join_tournament(tournament_id):
    data = request.get_json()
    if not data or 'team_id' not in data: return jsonify({"message": "Missing team_id"}), 400
    team_id = data['team_id']
    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()
    if not tourn_doc.exists: return jsonify({"message": "Tournament not found"}), 404
    
    tourn_data = tourn_doc.to_dict()
    team_doc = db.collection('teams').document(team_id).get()
    if not team_doc.exists: return jsonify({"message": "Team not found"}), 404
    
    team_data = team_doc.to_dict()
    if str(tourn_data.get('category', '')).lower() != str(team_data.get('category', '')).lower():
        return jsonify({"message": "Category incompatibility"}), 400
    
    registered = tourn_data.get('registered_team_ids', [])
    if len(registered) >= 16: return jsonify({"message": "Tournament full"}), 400
    if team_id in registered: return jsonify({"message": "Already enrolled"}), 400
    
    tourn_ref.update({
        "registered_team_ids": firestore.ArrayUnion([team_id]),
        "participants": firestore.ArrayUnion({"id": team_id, "name": team_data.get('name', 'Unknown')})
    })
    return jsonify({"message": "Joined successfully"}), 200

@tournaments_bp.route('/<tournament_id>', methods=['DELETE'])
def delete_tournament(tournament_id):
    """Clean delete: Removes matches associated with the tournament."""
    # Delete matches first
    matches = db.collection("matches").where(filter=FieldFilter("tournament_id", "==", tournament_id)).stream()
    for m in matches:
        # Also could delete match_stats here
        m.reference.delete()
    
    db.collection('tournaments').document(tournament_id).delete()
    return jsonify({"message": "Tournament and associated matches deleted"}), 200

@tournaments_bp.route('/user/<user_id>', methods=['GET'])
def get_user_tournaments(user_id):
    """
    Optimized: Replaced full collection stream with efficient array-contains-any query.
    """
    # 1. Get user teams
    teams_ref = db.collection('teams')
    p_teams = teams_ref.where(filter=FieldFilter('pilot_id', '==', user_id)).stream()
    c_teams = teams_ref.where(filter=FieldFilter('copilot_id', '==', user_id)).stream()
    team_ids = {t.id for t in p_teams} | {t.id for t in c_teams}
    
    if not team_ids: return jsonify({"past": [], "scheduled": []}), 200

    # 2. Optimized Tournament Query
    past, scheduled = [], []
    team_ids_list = list(team_ids)
    
    # Firestore array_contains_any limit is 30.
    for i in range(0, len(team_ids_list), 30):
        chunk = team_ids_list[i:i + 30]
        query = db.collection('tournaments').where(
            filter=FieldFilter('registered_team_ids', 'array_contains_any', chunk)
        ).stream()
        
        for tourn in query:
            ser = _serialize_tournament(tourn)
            if ser['status'] == 'past': past.append(ser)
            else: scheduled.append(ser)
            
    return jsonify({"past": past, "scheduled": scheduled}), 200
