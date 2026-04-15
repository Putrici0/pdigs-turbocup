from datetime import datetime
import random

from flask import Blueprint, jsonify, request
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.db import db
from backend.app.utils import serialize_firestore

tournaments_bp = Blueprint('tournaments', __name__)


def _parse_iso_datetime(value):
    if not value:
        return None

    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _compute_status(start_date_str, end_date_str):
    start_date = _parse_iso_datetime(start_date_str)
    end_date = _parse_iso_datetime(end_date_str)
    now = datetime.now()

    if start_date and start_date > now:
        return 'scheduled'

    if end_date and end_date < now:
        return 'past'

    if start_date:
        return 'current'

    return 'scheduled'


def _resolve_user_name(user_id: str) -> str:
    if not user_id:
        return ''

    try:
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists:
            return user_id

        user_data = user_doc.to_dict() or {}
        return (
                user_data.get('fullName')
                or user_data.get('username')
                or user_data.get('email')
                or user_id
        )
    except Exception:
        return user_id


def _serialize_team_doc(team_doc):
    team_data = team_doc.to_dict() or {}
    team_data['id'] = team_doc.id

    pilot_id = team_data.get('pilot_id', '')
    copilot_id = team_data.get('copilot_id', '')

    team_data['pilot_name'] = _resolve_user_name(pilot_id) if pilot_id else ''
    team_data['copilot_name'] = _resolve_user_name(copilot_id) if copilot_id else ''

    return team_data


def _serialize_tournament(doc):
    data = serialize_firestore(doc)

    data.setdefault('participants', [])
    data.setdefault('registered_team_ids', [])
    data.setdefault('creator_id', '')
    data['status'] = _compute_status(data.get('start_date'), data.get('end_date'))

    return data


@tournaments_bp.route("/", methods=["GET"])
def get_tournaments():
    tournaments = db.collection("tournaments").stream()
    data = [_serialize_tournament(doc) for doc in tournaments]
    return jsonify(data), 200


@tournaments_bp.route("/current", methods=["GET"])
def get_current_tournaments():
    tournaments = db.collection("tournaments").stream()
    data = [_serialize_tournament(doc) for doc in tournaments]
    data = [item for item in data if item.get('status') == 'current']
    return jsonify(data), 200


@tournaments_bp.route("/past", methods=["GET"])
def get_past_tournaments():
    tournaments = db.collection("tournaments").stream()
    data = [_serialize_tournament(doc) for doc in tournaments]
    data = [item for item in data if item.get('status') == 'past']
    data.sort(key=lambda x: x.get("end_date", ""), reverse=True)
    return jsonify(data), 200


@tournaments_bp.route('/', methods=['POST'])
def create_tournament():
    data = request.get_json()

    if not data or 'name' not in data or 'start_date' not in data or 'category' not in data:
        return jsonify({"message": "Missing name, start_date, or category"}), 400

    start_date = _parse_iso_datetime(data.get('start_date'))
    if start_date is None:
        return jsonify({"message": "start_date must be a valid datetime in YYYY-MM-DDTHH:MM format"}), 400

    end_date_str = data.get('end_date')
    if end_date_str and _parse_iso_datetime(end_date_str) is None:
        return jsonify({"message": "end_date must be a valid datetime in YYYY-MM-DDTHH:MM format"}), 400

    tournament_data = {
        "name": data['name'],
        "category": data['category'],
        "start_date": data['start_date'],
        "end_date": end_date_str,
        "max_participants": data.get('max_participants', 0),
        "statistics_url": data.get('statistics_url', ""),
        "status": _compute_status(data.get('start_date'), end_date_str),
        "participants": [],
        "registered_team_ids": [],
        "creator_id": data.get('creator_id', "")
    }

    _, doc_ref = db.collection('tournaments').add(tournament_data)
    created_tournament = doc_ref.get()

    return jsonify(_serialize_tournament(created_tournament)), 201


@tournaments_bp.route('/<tournament_id>', methods=['DELETE'])
def delete_tournament(tournament_id):
    doc_ref = db.collection('tournaments').document(tournament_id)
    doc = doc_ref.get()

    if not doc.exists:
        return jsonify({"message": f"No tournament with id {tournament_id} was found"}), 404

    doc_ref.delete()
    return jsonify({"message": f"Tournament {tournament_id} was deleted successfully"}), 200


@tournaments_bp.route("/admin/<admin_id>", methods=["GET"])
def get_admin_tournaments(admin_id):
    query = db.collection("tournaments").where(filter=FieldFilter("creator_id", "==", admin_id)).stream()
    data = [_serialize_tournament(doc) for doc in query]
    return jsonify(data), 200


@tournaments_bp.route("/<tournament_id>/details", methods=["GET"])
def get_tournament_detailed(tournament_id):
    tourn_ref = db.collection("tournaments").document(tournament_id)
    tourn_doc = tourn_ref.get()

    if not tourn_doc.exists:
        return jsonify({"message": "Tournament not found"}), 404

    detailed_data = _serialize_tournament(tourn_doc)
    team_ids = detailed_data.get("registered_team_ids", [])
    category = detailed_data.get("category", "General")

    registered_teams = []
    teams_dictionary = {}

    for team_id in team_ids:
        team_doc = db.collection("teams").document(team_id).get()
        if not team_doc.exists:
            continue

        team_data = _serialize_team_doc(team_doc)
        registered_teams.append(team_data)
        teams_dictionary[team_id] = team_data.get("name", "Unknown team")

    matches_query = db.collection("matches").where(
        filter=FieldFilter("tournament_id", "==", tournament_id)
    ).stream()

    matches_list = []
    for match in matches_query:
        match_dict = match.to_dict() or {}
        match_dict["id"] = match.id
        matches_list.append(match_dict)

    try:
        start_date = _parse_iso_datetime(detailed_data.get('start_date'))
        now = datetime.now()

        if start_date and start_date <= now and len(matches_list) == 0 and len(team_ids) > 0:
            shuffled_teams = team_ids.copy()
            random.shuffle(shuffled_teams)

            for index in range(0, len(shuffled_teams), 2):
                team_a = shuffled_teams[index]
                team_b = shuffled_teams[index + 1] if (index + 1) < len(shuffled_teams) else None

                new_match = {
                    "tournament_id": tournament_id,
                    "team_a_id": team_a,
                    "team_b_id": team_b,
                    "category": category,
                    "status": "scheduled",
                    "winner_id": None,
                    "round": 1
                }

                _, doc_ref = db.collection("matches").add(new_match)
                new_match["id"] = doc_ref.id
                matches_list.append(new_match)

            if detailed_data.get("status") == "scheduled":
                tourn_ref.update({"status": "current"})
                detailed_data["status"] = "current"

    except Exception as error:
        print("Error generating matches:", error)

    for match_dict in matches_list:
        team_a_id = match_dict.get("team_a_id")
        team_b_id = match_dict.get("team_b_id")

        if team_a_id and team_a_id not in teams_dictionary:
            team_doc = db.collection("teams").document(team_a_id).get()
            if team_doc.exists:
                team_data = _serialize_team_doc(team_doc)
                teams_dictionary[team_a_id] = team_data.get("name", "TBD")
            else:
                teams_dictionary[team_a_id] = "TBD"

        if team_b_id and team_b_id not in teams_dictionary:
            team_doc = db.collection("teams").document(team_b_id).get()
            if team_doc.exists:
                team_data = _serialize_team_doc(team_doc)
                teams_dictionary[team_b_id] = team_data.get("name", "TBD")
            else:
                teams_dictionary[team_b_id] = "TBD"

        match_dict["team_a_name"] = teams_dictionary.get(team_a_id, "TBD")
        match_dict["team_b_name"] = teams_dictionary.get(team_b_id, "TBD") if team_b_id else "BYE (Advances to next round)"

        if match_dict.get("status") not in ("scheduled", "current", "past"):
            match_dict["status"] = "scheduled"

    detailed_data["registered_teams"] = registered_teams
    detailed_data["matches"] = matches_list
    detailed_data["teams_involved"] = {
        team["id"]: team.get("name", "Unknown team") for team in registered_teams
    }

    return jsonify(detailed_data), 200


@tournaments_bp.route('/<tournament_id>/join', methods=['POST'])
def join_tournament(tournament_id):
    data = request.get_json()

    if not data or 'team_id' not in data:
        return jsonify({"message": "The request lacks the team_id field"}), 400

    team_id = data['team_id']

    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()

    if not tourn_doc.exists:
        return jsonify({"message": "Tournament not found"}), 404

    tourn_data = tourn_doc.to_dict() or {}

    team_ref = db.collection('teams').document(team_id)
    team_doc = team_ref.get()

    if not team_doc.exists:
        return jsonify({"message": "Team not found"}), 404

    team_data = team_doc.to_dict() or {}

    tourn_cat = str(tourn_data.get('category', '')).strip().lower()
    team_cat = str(team_data.get('category', '')).strip().lower()

    if tourn_cat != team_cat:
        return jsonify({
            "message": f"Category incompatibility. Tournament category is {tourn_data.get('category')}, but team category is {team_data.get('category')}."
        }), 400

    registered_teams = tourn_data.get('registered_team_ids', [])
    max_participants = 16

    if len(registered_teams) >= max_participants:
        return jsonify({"message": "Tournament has already reached it's maximum capacity."}), 400

    if team_id in registered_teams:
        return jsonify({"message": "Team is already enrolled in the tournament."}), 400

    participant_data = {
        "id": team_id,
        "name": team_data.get('name', 'Unknown team')
    }

    tourn_ref.update({
        "registered_team_ids": firestore.ArrayUnion([team_id]),
        "participants": firestore.ArrayUnion([participant_data])
    })

    return jsonify({"message": f"Team {team_data.get('name')} has joined the tournament successfully."}), 200


@tournaments_bp.route('/<tournament_id>', methods=['PUT'])
def update_tournament(tournament_id):
    data = request.get_json()
    if not data:
        return jsonify({"message": "No data provided"}), 400

    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()

    if not tourn_doc.exists:
        return jsonify({"message": "Tournament not found"}), 404

    existing_data = tourn_doc.to_dict() or {}

    new_name = data.get('name', existing_data.get('name'))
    start_date_str = data.get('start_date', existing_data.get('start_date'))
    end_date_str = data.get('end_date', existing_data.get('end_date'))

    if _parse_iso_datetime(start_date_str) is None:
        return jsonify({"message": "start_date must be in YYYY-MM-DDTHH:MM format"}), 400

    if end_date_str and _parse_iso_datetime(end_date_str) is None:
        return jsonify({"message": "end_date must be in YYYY-MM-DDTHH:MM format"}), 400

    update_data = {
        "name": new_name,
        "start_date": start_date_str,
        "end_date": end_date_str,
        "status": _compute_status(start_date_str, end_date_str)
    }

    tourn_ref.update(update_data)

    updated_doc = tourn_ref.get()
    return jsonify(_serialize_tournament(updated_doc)), 200


@tournaments_bp.route('/<tournament_id>/participants/<team_id>', methods=['DELETE'])
def remove_team_from_tournament(tournament_id, team_id):
    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()

    if not tourn_doc.exists:
        return jsonify({"message": "Tournament not found"}), 404

    tourn_data = tourn_doc.to_dict() or {}

    registered_teams = tourn_data.get('registered_team_ids', [])
    if team_id not in registered_teams:
        return jsonify({"message": "The team is not registered in this tournament"}), 400

    updated_team_ids = [current_id for current_id in registered_teams if current_id != team_id]
    participants = tourn_data.get('participants', [])
    updated_participants = [participant for participant in participants if participant.get('id') != team_id]

    tourn_ref.update({
        "registered_team_ids": updated_team_ids,
        "participants": updated_participants
    })

    return jsonify({"message": "Team removed from tournament successfully"}), 200


@tournaments_bp.route('/user/<user_id>', methods=['GET'])
def get_user_tournaments(user_id):
    teams_ref = db.collection('teams')
    pilot_teams = teams_ref.where(filter=FieldFilter('pilot_id', '==', user_id)).stream()
    copilot_teams = teams_ref.where(filter=FieldFilter('copilot_id', '==', user_id)).stream()

    team_ids = set()
    for team in pilot_teams:
        team_ids.add(team.id)
    for team in copilot_teams:
        team_ids.add(team.id)

    if not team_ids:
        return jsonify({"past": [], "scheduled": []}), 200

    all_tournaments = db.collection('tournaments').stream()

    past_tournaments = []
    scheduled_tournaments = []

    for tourn in all_tournaments:
        tournament_data = tourn.to_dict() or {}
        registered = set(tournament_data.get('registered_team_ids', []))

        if team_ids.intersection(registered):
            serialized = _serialize_tournament(tourn)

            if serialized.get('status') == 'past':
                past_tournaments.append(serialized)
            else:
                scheduled_tournaments.append(serialized)

    return jsonify({
        "past": past_tournaments,
        "scheduled": scheduled_tournaments
    }), 200
