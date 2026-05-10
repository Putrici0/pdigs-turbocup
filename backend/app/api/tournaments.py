from datetime import datetime, timedelta, timezone
import random

from flask import Blueprint, jsonify, request
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.db import db
from backend.app.utils import serialize_firestore
from backend.app.logic.simulator import resolve_match_mechanics, update_participant_stats

tournaments_bp = Blueprint('tournaments', __name__)

# --- HELPERS ---

def _resolve_pending_predictions(match_id, actual_winner_id):
    """Auto-resolve any pending predictions for a simulated match."""
    pred_docs = list(
        db.collection("predictions")
        .where(filter=FieldFilter("match_id", "==", match_id))
        .where(filter=FieldFilter("is_correct", "==", None))
        .limit(1)
        .stream()
    )
    if not pred_docs:
        return
    pred_doc = pred_docs[0]
    pred_data = pred_doc.to_dict()
    predicted = pred_data.get("predicted_winner_id")
    is_correct = (predicted == actual_winner_id)
    pred_doc.reference.update({
        "actual_winner_id": actual_winner_id,
        "is_correct": is_correct,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    })

def _parse_iso_datetime(value):
    if not value: return None
    try: return datetime.fromisoformat(value)
    except: return None

def _compute_status(start_date_str, end_date_str):
    start_date = _parse_iso_datetime(start_date_str)
    end_date = _parse_iso_datetime(end_date_str)
    
    # Ensure 'now' has timezone if dates have it, or both are naive.
    # ISO-8601 from mass_populate often includes UTC offset.
    if start_date and start_date.tzinfo:
        now = datetime.now(timezone.utc)
    else:
        now = datetime.now()

    if start_date and start_date > now: return 'scheduled'
    if end_date and end_date < now: return 'past'
    return 'current' if start_date else 'scheduled'

def _serialize_tournament(doc):
    data = serialize_firestore(doc)
    data.setdefault('participants', [])
    data.setdefault('registered_team_ids', [])
    data.setdefault('creator_id', '')
    data['status'] = _compute_status(data.get('start_date'), data.get('end_date'))
    return data

def _regenerate_round_one_matches(tournament_id, category, team_ids, match_status):
    """
    Rebuild round-1 bracket matches.
    Existing matches for the tournament are replaced to keep the bracket in sync
    with the latest registered teams.
    """
    existing_matches = db.collection("matches").where(
        filter=FieldFilter("tournament_id", "==", tournament_id)
    ).stream()
    for match_doc in existing_matches:
        match_doc.reference.delete()

    if len(team_ids) < 2:
        return

    team_refs = [db.collection("teams").document(tid) for tid in team_ids]
    teams_map = {doc.id: {**doc.to_dict(), "id": doc.id} for doc in db.get_all(team_refs) if doc.exists}
    current_round_teams = [teams_map[tid] for tid in team_ids if tid in teams_map]
    random.shuffle(current_round_teams)

    batch = db.batch()
    created_at = datetime.utcnow().isoformat()
    for i in range(0, len(current_round_teams) - 1, 2):
        t_a = current_round_teams[i]
        t_b = current_round_teams[i + 1]
        m_ref = db.collection("matches").document()
        batch.set(m_ref, {
            "tournament_id": tournament_id,
            "category": category,
            "status": match_status,
            "team_a_id": t_a["id"],
            "team_a_name": t_a.get("name", "TBD"),
            "team_b_id": t_b["id"],
            "team_b_name": t_b.get("name", "TBD"),
            "winner_id": None,
            "winner_name": "TBD",
            "round": 1,
            "created_at": created_at,
        })

    # Keep odd-team brackets visible with a BYE slot so no team disappears.
    if len(current_round_teams) % 2 == 1:
        t_a = current_round_teams[-1]
        m_ref = db.collection("matches").document()
        batch.set(m_ref, {
            "tournament_id": tournament_id,
            "category": category,
            "status": match_status,
            "team_a_id": t_a["id"],
            "team_a_name": t_a.get("name", "TBD"),
            "team_b_id": "",
            "team_b_name": "BYE",
            "winner_id": None,
            "winner_name": "TBD",
            "round": 1,
            "created_at": created_at,
        })
    batch.commit()

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

@tournaments_bp.route("/", methods=["POST"])
def create_tournament():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    category = str(data.get("category", "")).strip().lower()
    start_date = str(data.get("start_date", "")).strip()
    end_date = str(data.get("end_date", "")).strip()

    if not name or not category or not start_date or not end_date:
        return jsonify({"message": "Missing required fields: name, category, start_date, end_date"}), 400

    start_dt = _parse_iso_datetime(start_date)
    end_dt = _parse_iso_datetime(end_date)
    if not start_dt or not end_dt:
        return jsonify({"message": "Invalid date format. Use ISO-8601 date/datetime."}), 400
    if end_dt <= start_dt:
        return jsonify({"message": "end_date must be later than start_date"}), 400

    max_participants = data.get("max_participants", 16)
    try:
        max_participants = int(max_participants)
    except (TypeError, ValueError):
        max_participants = 16

    tournament_data = {
        "name": name,
        "category": category,
        "start_date": start_date,
        "end_date": end_date,
        "registered_team_ids": [],
        "participants": [],
        "creator_id": str(data.get("creator_id", "")).strip(),
        "max_participants": max(0, max_participants),
    }

    ref = db.collection("tournaments").document()
    ref.set(tournament_data)
    return jsonify(_serialize_tournament(ref.get())), 201

@tournaments_bp.route('/<tournament_id>/generate-matches', methods=['POST'])
def generate_tournament_matches(tournament_id):
    """
    Admin action to generate matches.
    If simulate=true: Generates the FULL bracket (all rounds) and resolves winners.
    If simulate=false: Generates only the current round of pairings.
    """
    simulate = request.args.get('simulate', 'false').lower() == 'true'
    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()
    if not tourn_doc.exists: return jsonify({"message": "Tournament not found"}), 404
    
    tourn_data = tourn_doc.to_dict()
    team_ids = tourn_data.get('registered_team_ids', [])
    category = tourn_data.get('category')
    if len(team_ids) < 2: return jsonify({"message": "Need at least 2 teams"}), 400

    # Cache team data
    team_refs = [db.collection("teams").document(tid) for tid in team_ids]
    teams_map = {doc.id: {**doc.to_dict(), "id": doc.id} for doc in db.get_all(team_refs) if doc.exists}

    # Initial shuffle
    current_round_teams = [teams_map[tid] for tid in team_ids if tid in teams_map]
    random.shuffle(current_round_teams)
    
    batch = db.batch()
    round_num = 1
    total_generated = 0
    start_time = datetime.utcnow()
    resolved_matches = []

    # Loop for Full Bracket Simulation if simulate=true
    # Otherwise, it runs only once for Round 1
    while len(current_round_teams) >= 2:
        winners_of_round = []
        
        for i in range(0, len(current_round_teams) - 1, 2):
            t_a = current_round_teams[i]
            t_b = current_round_teams[i+1]
            
            winner_id, winner_name = None, "TBD"
            match_status = "scheduled"
            res = None

            if simulate:
                res = resolve_match_mechanics(t_a, t_b)
                winner_id, winner_name = res["winner_id"], res["winner_name"]
                match_status = "past"
                # VITAL: Advance the winner to the next round
                winners_of_round.append(t_a if winner_id == t_a["id"] else t_b)
            
            m_ref = db.collection("matches").document()
            batch.set(m_ref, {
                "tournament_id": tournament_id, "category": category, "status": match_status,
                "team_a_id": t_a["id"], "team_a_name": t_a["name"],
                "team_b_id": t_b["id"], "team_b_name": t_b["name"],
                "winner_id": winner_id, "winner_name": winner_name,
                "round": round_num, "created_at": start_time.isoformat()
            })

            if simulate and res:
                for tid in [t_a["id"], t_b["id"]]:
                    tel = res["telemetry"][tid]
                    batch.set(db.collection("match_stats").document(), {
                        "match_id": m_ref.id, 
                        "team_id": tid,
                        "average_speed": tel["average_speed"], 
                        "section_times": tel["section_times"]
                    })
                    update_participant_stats(batch, db, teams_map[tid], winner_id)
                resolved_matches.append({"match_id": m_ref.id, "winner_id": winner_id})
            total_generated += 1

        if not simulate:
            break # Generate only Round 1 and exit
        
        current_round_teams = winners_of_round
        round_num += 1
        start_time += timedelta(hours=6)

    batch.commit()

    for rm in resolved_matches:
        _resolve_pending_predictions(rm["match_id"], rm["winner_id"])

    return jsonify({"message": f"Successfully generated {total_generated} matches.", "rounds": round_num - 1 if simulate else 1}), 201

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
    if team_id in tourn_data.get('registered_team_ids', []):
        return jsonify({"message": "Already enrolled"}), 400
    tourn_ref.update({
        "registered_team_ids": firestore.ArrayUnion([team_id]),
        "participants": firestore.ArrayUnion([{"id": team_id, "name": team_data.get('name', 'Unknown')}])
    })

    updated_team_ids = list(tourn_data.get('registered_team_ids', [])) + [team_id]
    tournament_status = _compute_status(tourn_data.get('start_date'), tourn_data.get('end_date'))
    if tournament_status != 'past':
        round_status = 'current' if tournament_status == 'current' else 'scheduled'
        _regenerate_round_one_matches(
            tournament_id=tournament_id,
            category=tourn_data.get('category'),
            team_ids=updated_team_ids,
            match_status=round_status
        )

    return jsonify({"message": "Joined successfully"}), 200

@tournaments_bp.route('/<tournament_id>/leave', methods=['POST'])
def leave_tournament(tournament_id):
    data = request.get_json(silent=True) or {}
    team_id = str(data.get('team_id', '')).strip()
    if not team_id:
        return jsonify({"message": "Missing team_id"}), 400

    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()
    if not tourn_doc.exists:
        return jsonify({"message": "Tournament not found"}), 404

    tourn_data = tourn_doc.to_dict() or {}
    tournament_status = _compute_status(tourn_data.get('start_date'), tourn_data.get('end_date'))
    if tournament_status != 'scheduled':
        return jsonify({"message": "You can only leave a tournament while it is scheduled."}), 409

    registered_team_ids = list(tourn_data.get('registered_team_ids', []))
    if team_id not in registered_team_ids:
        return jsonify({"message": "Team is not enrolled in this tournament."}), 400

    updated_team_ids = [tid for tid in registered_team_ids if tid != team_id]
    updated_participants = [
        participant for participant in list(tourn_data.get('participants', []))
        if str(participant.get('id', '')) != team_id
    ]

    tourn_ref.update({
        "registered_team_ids": updated_team_ids,
        "participants": updated_participants
    })

    _regenerate_round_one_matches(
        tournament_id=tournament_id,
        category=tourn_data.get('category'),
        team_ids=updated_team_ids,
        match_status='scheduled'
    )

    return jsonify({"message": "Left tournament successfully"}), 200

@tournaments_bp.route('/<tournament_id>', methods=['DELETE'])
def delete_tournament(tournament_id):
    matches = db.collection("matches").where(filter=FieldFilter("tournament_id", "==", tournament_id)).stream()
    for m in matches: m.reference.delete()
    db.collection('tournaments').document(tournament_id).delete()
    return jsonify({"message": "Deleted successfully"}), 200

@tournaments_bp.route('/user/<user_id>', methods=['GET'])
def get_user_tournaments(user_id):
    teams_ref = db.collection('teams')
    p_teams = teams_ref.where(filter=FieldFilter('pilot_id', '==', user_id)).stream()
    c_teams = teams_ref.where(filter=FieldFilter('copilot_id', '==', user_id)).stream()
    team_ids = {t.id for t in p_teams} | {t.id for t in c_teams}
    if not team_ids: return jsonify({"past": [], "scheduled": []}), 200
    past, scheduled = [], []
    for tourn in db.collection('tournaments').where(filter=FieldFilter('registered_team_ids', 'array_contains_any', list(team_ids))).stream():
        ser = _serialize_tournament(tourn)
        if ser['status'] == 'past': past.append(ser)
        else: scheduled.append(ser)
    return jsonify({"past": past, "scheduled": scheduled}), 200

@tournaments_bp.route('/admin/<admin_id>', methods=['GET'])
def get_admin_tournaments(admin_id):
    tournaments = db.collection('tournaments').where(
        filter=FieldFilter('creator_id', '==', admin_id)
    ).stream()
    return jsonify([_serialize_tournament(doc) for doc in tournaments]), 200
