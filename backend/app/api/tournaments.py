from datetime import datetime

from flask import Blueprint, jsonify, request

from backend.app.db import db
from google.cloud.firestore_v1.base_query import FieldFilter
from google.cloud import firestore

from backend.app.utils import serialize_firestore

tournaments_bp = Blueprint('tournaments', __name__)


@tournaments_bp.route("/", methods=["GET"])
def get_tournaments():
    tournaments = db.collection("tournaments").stream()
    data = [serialize_firestore(doc) for doc in tournaments]

    return jsonify(data), 200

@tournaments_bp.route("/current", methods=["GET"])
def get_current_tournaments():
    query = db.collection("tournaments").where("status", "==", "current").stream()

    data = [serialize_firestore(doc) for doc in query]

    return jsonify(data), 200

@tournaments_bp.route("/past", methods=["GET"])
def get_past_tournaments():
    query = db.collection("tournaments").where("status", "==", "past").stream()
    data = [serialize_firestore(doc) for doc in query]

    data.sort(key=lambda x: x.get("end_date", ""), reverse=True)

    return jsonify(data), 200


@tournaments_bp.route('/', methods=['POST'])
def create_tournament():
    data = request.get_json()

    if not data or 'name' not in data or 'start_date' not in data or 'category' not in data:
        return jsonify({"message": "Missing name, start_date, or category"}), 400

    try:
        start_date = datetime.fromisoformat(data['start_date'])
    except ValueError:
        return jsonify({"message": "start_date must be a valid datetime in YYYY-MM-DDTHH:MM format"}), 400

    end_date_str = data.get('end_date')
    end_date = None
    if end_date_str:
        try:
            end_date = datetime.fromisoformat(end_date_str)
        except ValueError:
            return jsonify({"message": "end_date must be a valid datetime in YYYY-MM-DDTHH:MM format"}), 400

    now = datetime.now()

    if start_date > now:
        status = "scheduled"
    else:
        if not end_date or end_date >= now:
            status = "current"
        else:
            status = "past"

    tournament_data = {
        "name": data['name'],
        "category": data['category'],
        "start_date": data['start_date'],
        "end_date": data.get('end_date'),
        "max_participants": data.get('max_participants', 0),
        "statistics_url": data.get('statistics_url', ""),
        "status": status,
        "participants": []
    }

    _, doc_ref = db.collection('tournaments').add(tournament_data)
    created_tournament = doc_ref.get()

    return jsonify(serialize_firestore(created_tournament)), 201

@tournaments_bp.route('/<tournament_id>', methods=['DELETE'])
def delete_tournament(tournament_id):
    doc_ref = db.collection('tournaments').document(tournament_id)

    doc = doc_ref.get()
    if not doc.exists:
        return jsonify({"message": f"No tournament with id {tournament_id} was found"}), 404

    doc_ref.delete()

    return jsonify({"message": f"Tournament {tournament_id} was deleted successfully"}), 200


@tournaments_bp.route('/<tournament_id>', methods=['PUT'])
def update_tournament(tournament_id):
    data = request.get_json()
    if not data or 'name' not in data or 'start_date' not in data:
        return jsonify({"message": "Missing name or start_date"}), 400

    doc_ref = db.collection('tournaments').document(tournament_id)
    doc = doc_ref.get()
    if not doc.exists:
        return jsonify({"message": f"No tournament with id {tournament_id} was found"}), 404

    try:
        start_date = datetime.fromisoformat(data['start_date'])
    except ValueError:
        return jsonify({"message": "start_date must be a valid datetime in YYYY-MM-DDTHH:MM format"}), 400

    end_date_str = data.get('end_date')
    end_date = None
    if end_date_str:
        try:
            end_date = datetime.fromisoformat(end_date_str)
        except ValueError:
            return jsonify({"message": "end_date must be a valid datetime in YYYY-MM-DDTHH:MM format"}), 400

    now = datetime.now()
    if start_date > now:
        status = "scheduled"
    else:
        if not end_date or end_date >= now:
            status = "current"
        else:
            status = "past"

    update_data = {
        "name": data['name'],
        "start_date": data['start_date'],
        "end_date": data.get('end_date'),
        "status": status
    }

    doc_ref.update(update_data)
    updated_tournament = doc_ref.get()
    return jsonify(serialize_firestore(updated_tournament)), 200

@tournaments_bp.route("/admin/<admin_id>", methods=["GET"])
def get_admin_tournaments(admin_id):
    query = db.collection("tournaments").where("creator_id", "==", admin_id).stream()

    data = [serialize_firestore(doc) for doc in query]

    return jsonify(data), 200

@tournaments_bp.route("/<tournament_id>/details", methods=["GET"])
def get_tournament_detailed(tournament_id):

    tourn_ref = db.collection("tournaments").document(tournament_id).get()
    if not tourn_ref.exists:
        return jsonify({"message": "Tournament not found"}), 404

    detailed_data = serialize_firestore(tourn_ref)

    team_ids = detailed_data.get("registered_team_ids", [])

    registered_teams = []
    teams_dictionary = {}

    for t_id in team_ids:
        t_doc = db.collection("teams").document(t_id).get()
        if t_doc.exists:
            t_data = t_doc.to_dict()
            t_data["id"] = t_doc.id
            registered_teams.append(t_data)
            teams_dictionary[t_id] = t_data.get("name", "Unknown Team")

    matches_query = db.collection("matches").where(filter=FieldFilter("tournament_id", "==", tournament_id)).stream()

    matches_list = []
    for match in matches_query:
        match_dict = match.to_dict()
        match_dict["id"] = match.id
        match_dict["team_a_name"] = teams_dictionary.get(match_dict.get("team_a_id"), "TBD")
        match_dict["team_b_name"] = teams_dictionary.get(match_dict.get("team_b_id"), "TBD")
        matches_list.append(match_dict)

    detailed_data["registered_teams"] = registered_teams
    detailed_data["matches"] = matches_list

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

    tourn_data = tourn_doc.to_dict()

    team_ref = db.collection('teams').document(team_id)
    team_doc = team_ref.get()

    if not team_doc.exists:
        return jsonify({"message": "Team not found"}), 404

    team_data = team_doc.to_dict()

    if tourn_data.get('category') != team_data.get('category'):
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

    return jsonify({"message": f"Team  {team_data.get('name')} has joined the tournament successfully."}), 200
