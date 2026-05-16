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
    if not value:
        return None
    try:
        normalized = str(value).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None

def _compute_status(start_date_str, end_date_str):
    start_date = _parse_iso_datetime(start_date_str)
    end_date = _parse_iso_datetime(end_date_str)
    now = datetime.now(timezone.utc)

    if start_date and start_date > now: return 'scheduled'
    if end_date and end_date <= now: return 'past'
    return 'current' if start_date else 'scheduled'

def _format_datetime_for_notification(value):
    dt = _parse_iso_datetime(value)
    if not dt:
        raw = str(value or "").strip()
        return raw or "N/A"
    return dt.strftime("%Y-%m-%d %H:%M UTC")

def _serialize_tournament(doc):
    data = serialize_firestore(doc)
    data.setdefault('participants', [])
    data.setdefault('registered_team_ids', [])
    data.setdefault('creator_id', '')
    data.setdefault('started', False)
    data['status'] = _compute_status(data.get('start_date'), data.get('end_date'))
    return data

def _get_tournament_member_user_ids(tournament_data):
    team_ids = list(tournament_data.get("registered_team_ids", []))
    if not team_ids:
        return []

    team_refs = [db.collection("teams").document(team_id) for team_id in team_ids]
    member_ids = set()
    for team_doc in db.get_all(team_refs):
        if not team_doc.exists:
            continue
        team_data = team_doc.to_dict() or {}
        pilot_id = str(team_data.get("pilot_id", "")).strip()
        copilot_id = str(team_data.get("copilot_id", "")).strip()
        if pilot_id:
            member_ids.add(pilot_id)
        if copilot_id:
            member_ids.add(copilot_id)
    return list(member_ids)

def _notify_tournament_members(tournament_data, message):
    user_ids = _get_tournament_member_user_ids(tournament_data)
    if not user_ids:
        return

    created_at = datetime.now(timezone.utc).isoformat()
    batch = db.batch()
    for user_id in user_ids:
        notif_ref = db.collection("notifications").document()
        batch.set(notif_ref, {
            "user_id": user_id,
            "message": message,
            "read": False,
            "created_at": created_at,
        })
    batch.commit()

def _get_detailed_tournament_data(tournament_id):
    tourn_ref = db.collection("tournaments").document(tournament_id)
    tourn_doc = tourn_ref.get()
    if not tourn_doc.exists:
        return None
    
    detailed_data = _serialize_tournament(tourn_doc)
    detailed_data["matches"] = []
    matches_query = db.collection("matches").where(filter=FieldFilter("tournament_id", "==", tournament_id)).stream()
    for m in matches_query:
        m_dict = m.to_dict() or {}
        m_dict["id"] = m.id
        detailed_data["matches"].append(m_dict)
    detailed_data["matches"].sort(key=lambda x: (int(x.get("round", 1)), int(x.get("slot", 1))))
    return detailed_data

@tournaments_bp.route('/<tournament_id>/finish', methods=['POST'])
def finish_tournament(tournament_id):
    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()
    if not tourn_doc.exists:
        return jsonify({"message": "Tournament not found"}), 404
    
    finished_at = datetime.now(timezone.utc).isoformat()
    tourn_ref.update({"end_date": finished_at})

    tourn_data = tourn_doc.to_dict() or {}
    tournament_name = tourn_data.get("name", "Tournament")
    _notify_tournament_members(
        tourn_data,
        f'Tournament "{tournament_name}" was marked as finished by the tournament admin.'
    )
    
    # Return refreshed details
    detailed_data = _get_detailed_tournament_data(tournament_id)
    return jsonify(detailed_data), 200

def _build_knockout_matches(tournament_id, category, teams):
    """Builds a full 8/16-team bracket with placeholders for future rounds."""
    bracket_size = 8 if len(teams) <= 8 else 16
    if len(teams) not in (8, 16):
        raise ValueError("Tournament must have exactly 8 or 16 registered teams to start.")

    rounds = []
    matches_this_round = bracket_size // 2
    round_num = 1
    while matches_this_round >= 1:
        rounds.append((round_num, matches_this_round))
        matches_this_round //= 2
        round_num += 1

    created_at = datetime.now(timezone.utc).isoformat()
    payloads = []

    # Round 1 with real teams
    random.shuffle(teams)
    for slot in range(1, rounds[0][1] + 1):
        a = teams[(slot - 1) * 2]
        b = teams[(slot - 1) * 2 + 1]
        payloads.append({
            "tournament_id": tournament_id,
            "category": category,
            "status": "scheduled",
            "team_a_id": a["id"],
            "team_a_name": a.get("name", "TBD"),
            "team_b_id": b["id"],
            "team_b_name": b.get("name", "TBD"),
            "winner_id": None,
            "winner_name": "TBD",
            "round": 1,
            "slot": slot,
            "created_at": created_at,
        })

    # Later rounds as placeholders
    for round_num, match_count in rounds[1:]:
        for slot in range(1, match_count + 1):
            payloads.append({
                "tournament_id": tournament_id,
                "category": category,
                "status": "tbd",
                "team_a_id": "",
                "team_a_name": "TBD",
                "team_b_id": "",
                "team_b_name": "TBD",
                "winner_id": None,
                "winner_name": "TBD",
                "round": round_num,
                "slot": slot,
                "created_at": created_at,
            })

    return payloads

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
    detailed_data["matches"].sort(key=lambda x: (int(x.get("round", 1)), int(x.get("slot", 1))))
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
        "started": False,
        "registered_team_ids": [],
        "participants": [],
        "creator_id": str(data.get("creator_id", "")).strip(),
        "max_participants": max(0, max_participants),
    }

    ref = db.collection("tournaments").document()
    ref.set(tournament_data)
    return jsonify(_serialize_tournament(ref.get())), 201

@tournaments_bp.route('/<tournament_id>', methods=['PUT'])
def update_tournament(tournament_id):
    data = request.get_json(silent=True) or {}

    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()
    if not tourn_doc.exists:
        return jsonify({"message": "Tournament not found"}), 404

    current_data = tourn_doc.to_dict() or {}
    name = str(data.get("name", current_data.get("name", ""))).strip()
    start_date = str(data.get("start_date", current_data.get("start_date", ""))).strip()
    end_date = str(data.get("end_date", current_data.get("end_date", ""))).strip()

    if not name or not start_date or not end_date:
        return jsonify({"message": "Missing required fields: name, start_date, end_date"}), 400

    start_dt = _parse_iso_datetime(start_date)
    end_dt = _parse_iso_datetime(end_date)
    if not start_dt or not end_dt:
        return jsonify({"message": "Invalid date format. Use ISO-8601 date/datetime."}), 400
    if end_dt <= start_dt:
        return jsonify({"message": "end_date must be later than start_date"}), 400

    changes = []
    if name != str(current_data.get("name", "")).strip():
        changes.append(f'name: "{current_data.get("name", "")}" -> "{name}"')
    if start_date != str(current_data.get("start_date", "")).strip():
        old_start = _format_datetime_for_notification(current_data.get("start_date", ""))
        new_start = _format_datetime_for_notification(start_date)
        changes.append(f'start date: "{old_start}" -> "{new_start}"')
    if end_date != str(current_data.get("end_date", "")).strip():
        old_end = _format_datetime_for_notification(current_data.get("end_date", ""))
        new_end = _format_datetime_for_notification(end_date)
        changes.append(f'end date: "{old_end}" -> "{new_end}"')

    tourn_ref.update({"name": name, "start_date": start_date, "end_date": end_date})

    if changes:
        tournament_name = name or current_data.get("name", "Tournament")
        _notify_tournament_members(
            current_data,
            f'Tournament "{tournament_name}" was updated by the tournament admin: ' + "; ".join(changes)
        )
    return jsonify(_serialize_tournament(tourn_ref.get())), 200

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

    tournament_name = tourn_data.get("name", "Tournament")
    action_detail = "Full bracket simulation generated." if simulate else "Round pairings generated."
    _notify_tournament_members(
        tourn_data,
        f'Tournament "{tournament_name}" was updated by the tournament admin. {action_detail}'
    )

    return jsonify({"message": f"Successfully generated {total_generated} matches.", "rounds": round_num - 1 if simulate else 1}), 201

@tournaments_bp.route('/<tournament_id>/start', methods=['POST'])
def start_tournament(tournament_id):
    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()
    if not tourn_doc.exists:
        return jsonify({"message": "Tournament not found"}), 404

    tourn_data = tourn_doc.to_dict() or {}
    if bool(tourn_data.get("started")):
        return jsonify({"message": "Tournament already started."}), 409

    team_ids = list(tourn_data.get('registered_team_ids', []))
    if len(team_ids) not in (8, 16):
        return jsonify({"message": "Tournament can only start with exactly 8 or 16 registered teams."}), 409

    team_refs = [db.collection("teams").document(tid) for tid in team_ids]
    teams = [{**doc.to_dict(), "id": doc.id} for doc in db.get_all(team_refs) if doc.exists]
    if len(teams) != len(team_ids):
        return jsonify({"message": "Some registered teams no longer exist."}), 409

    existing_matches = db.collection("matches").where(
        filter=FieldFilter("tournament_id", "==", tournament_id)
    ).stream()
    for match_doc in existing_matches:
        match_doc.reference.delete()

    match_payloads = _build_knockout_matches(
        tournament_id=tournament_id,
        category=tourn_data.get("category", ""),
        teams=teams,
    )
    batch = db.batch()
    for payload in match_payloads:
        m_ref = db.collection("matches").document()
        batch.set(m_ref, payload)
    batch.commit()
    tourn_ref.update({"started": True})
    tournament_name = tourn_data.get("name", "Tournament")
    _notify_tournament_members(
        tourn_data,
        f'Tournament "{tournament_name}" was started by the tournament admin.'
    )

    refreshed = tourn_ref.get()
    data = _serialize_tournament(refreshed)
    data["matches"] = []
    matches_query = db.collection("matches").where(
        filter=FieldFilter("tournament_id", "==", tournament_id)
    ).stream()
    for m in matches_query:
        m_data = m.to_dict() or {}
        m_data["id"] = m.id
        data["matches"].append(m_data)
    data["matches"].sort(key=lambda x: (int(x.get("round", 1)), int(x.get("slot", 1))))
    return jsonify(data), 200

@tournaments_bp.route('/<tournament_id>/matches/<match_id>/result', methods=['POST'])
def set_match_result(tournament_id, match_id):
    data = request.get_json(silent=True) or {}
    winner_id = str(data.get("winner_id", "")).strip()
    left_time = data.get("team_a_time")
    right_time = data.get("team_b_time")

    if not winner_id:
        return jsonify({"message": "Missing winner_id"}), 400

    match_ref = db.collection("matches").document(match_id)
    match_doc = match_ref.get()
    if not match_doc.exists:
        return jsonify({"message": "Match not found"}), 404

    match_data = match_doc.to_dict() or {}
    if match_data.get("tournament_id") != tournament_id:
        return jsonify({"message": "Match does not belong to this tournament."}), 409

    a_id = str(match_data.get("team_a_id") or "")
    b_id = str(match_data.get("team_b_id") or "")
    if winner_id not in (a_id, b_id):
        return jsonify({"message": "winner_id must be one of the teams in the match."}), 400

    winner_name = match_data.get("team_a_name", "TBD") if winner_id == a_id else match_data.get("team_b_name", "TBD")
    updates = {
        "winner_id": winner_id,
        "winner_name": winner_name,
        "status": "past",
    }
    if isinstance(left_time, (int, float)):
        updates["team_a_time"] = float(left_time)
    if isinstance(right_time, (int, float)):
        updates["team_b_time"] = float(right_time)
    section_a = data.get("section_times_a")
    section_b = data.get("section_times_b")
    if section_a:
        s_a = [section_a.get("sector_1", 0), section_a.get("sector_2", 0), section_a.get("sector_3", 0)]
        updates["team_a_sectors"] = s_a
    if section_b:
        s_b = [section_b.get("sector_1", 0), section_b.get("sector_2", 0), section_b.get("sector_3", 0)]
        updates["team_b_sectors"] = s_b
    match_ref.update(updates)
    _resolve_pending_predictions(match_id, winner_id)

    if section_a or section_b:
        batch = db.batch()
        if section_a and a_id:
            batch.set(db.collection("match_stats").document(), {
                "match_id": match_id, "team_id": a_id,
                "section_times": section_a, "total_time": left_time,
            })
        if section_b and b_id:
            batch.set(db.collection("match_stats").document(), {
                "match_id": match_id, "team_id": b_id,
                "section_times": section_b, "total_time": right_time,
            })
        batch.commit()

    round_num = int(match_data.get("round", 1))
    slot = int(match_data.get("slot", 1))
    next_round = round_num + 1
    next_slot = (slot + 1) // 2

    next_match_docs = list(
        db.collection("matches")
        .where(filter=FieldFilter("tournament_id", "==", tournament_id))
        .where(filter=FieldFilter("round", "==", next_round))
        .where(filter=FieldFilter("slot", "==", next_slot))
        .limit(1)
        .stream()
    )
    if next_match_docs:
        next_doc = next_match_docs[0]
        next_data = next_doc.to_dict() or {}
        side_is_a = (slot % 2 == 1)
        next_updates = {}
        if side_is_a:
            next_updates["team_a_id"] = winner_id
            next_updates["team_a_name"] = winner_name
        else:
            next_updates["team_b_id"] = winner_id
            next_updates["team_b_name"] = winner_name

        merged_a = next_updates.get("team_a_id", next_data.get("team_a_id", ""))
        merged_b = next_updates.get("team_b_id", next_data.get("team_b_id", ""))
        if merged_a and merged_b:
            next_updates["status"] = "scheduled"
        elif merged_a or merged_b:
            next_updates["status"] = "waiting"
        else:
            next_updates["status"] = "tbd"
        next_doc.reference.update(next_updates)
    else:
        # Final match — mark tournament as completed
        db.collection('tournaments').document(tournament_id).update({
            "end_date": datetime.now(timezone.utc).isoformat()
        })

    tourn_doc = db.collection("tournaments").document(tournament_id).get()
    tourn_data = tourn_doc.to_dict() or {}
    tournament_name = tourn_data.get("name", "Tournament")
    _notify_tournament_members(
        tourn_data,
        (
            f'Tournament "{tournament_name}" was updated by the tournament admin. '
            f'Match result recorded: {match_data.get("team_a_name", "Team A")} vs '
            f'{match_data.get("team_b_name", "Team B")} - winner: {winner_name}.'
        )
    )

    # Return refreshed details
    detailed_data = _get_detailed_tournament_data(tournament_id)
    if not detailed_data:
        return jsonify({"message": "Tournament not found"}), 404
    return jsonify(detailed_data), 200

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
    if not bool(tourn_data.get("started")) and tournament_status != 'past':
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

    if not bool(tourn_data.get("started")):
        _regenerate_round_one_matches(
            tournament_id=tournament_id,
            category=tourn_data.get('category'),
            team_ids=updated_team_ids,
            match_status='scheduled'
        )

    return jsonify({"message": "Left tournament successfully"}), 200

@tournaments_bp.route('/<tournament_id>', methods=['DELETE'])
def delete_tournament(tournament_id):
    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()
    tourn_data = tourn_doc.to_dict() if tourn_doc.exists else {}
    tournament_name = (tourn_data or {}).get("name", "Tournament")

    if tourn_data:
        _notify_tournament_members(
            tourn_data,
            f'Tournament "{tournament_name}" was deleted by the tournament admin.'
        )

    matches = db.collection("matches").where(filter=FieldFilter("tournament_id", "==", tournament_id)).stream()
    for m in matches: m.reference.delete()
    tourn_ref.delete()
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
