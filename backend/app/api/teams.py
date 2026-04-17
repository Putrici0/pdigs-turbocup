from flask import Blueprint, request, jsonify
from firebase_admin import auth
from google.cloud.firestore_v1.base_query import FieldFilter

from backend.app.db import db
from backend.app.models.racing_category import racing_category
from backend.app.utils import serialize_firestore

teams_bp = Blueprint('teams', __name__)

ALLOWED_CATEGORIES = [item.value for item in racing_category]


def _resolve_user_name(user_id: str) -> str:
    if not user_id:
        return ''

    try:
        user_doc = db.collection('users').document(user_id).get()
        if user_doc.exists:
            user_data = user_doc.to_dict() or {}
            full_name = (user_data.get('fullName') or '').strip()
            name = (user_data.get('name') or '').strip()
            surname = (user_data.get('surname') or '').strip()
            composed_name = f"{name} {surname}".strip()
            username = (user_data.get('username') or '').strip()
            email = (user_data.get('email') or '').strip()

            if full_name:
                return full_name
            if composed_name:
                return composed_name
            if username:
                return username
            if email:
                return email
    except Exception:
        pass

    try:
        firebase_user = auth.get_user(user_id)
        display_name = (firebase_user.display_name or '').strip()
        email = (firebase_user.email or '').strip()
        if display_name:
            return display_name
        if email:
            return email
    except Exception:
        pass

    return ''


def _serialize_team(doc):
    data = serialize_firestore(doc)

    pilot_id = data.get('pilot_id', '')
    copilot_id = data.get('copilot_id', '')

    data['pilot_name'] = _resolve_user_name(pilot_id) if pilot_id else ''
    data['copilot_name'] = _resolve_user_name(copilot_id) if copilot_id else ''
    data['member_count'] = int(bool(pilot_id)) + int(bool(copilot_id))

    return data


@teams_bp.route('/categories', methods=['GET'])
def list_categories():
    return jsonify({"categories": ALLOWED_CATEGORIES}), 200


@teams_bp.route('/', methods=['GET'])
def list_teams():
    teams = db.collection('teams').stream()
    data = [_serialize_team(doc) for doc in teams]
    data.sort(key=lambda item: item.get('name', '').lower())
    return jsonify(data), 200


@teams_bp.route('/<team_id>', methods=['GET'])
def get_team(team_id):
    doc = db.collection('teams').document(team_id).get()

    if not doc.exists:
        return jsonify({"message": "Team not found"}), 404

    return jsonify(_serialize_team(doc)), 200


@teams_bp.route('/', methods=['POST'])
def create_team():
    data = request.get_json()

    if not data or not all(key in data for key in ("name", "pilot_id", "copilot_id", "category")):
        return jsonify({"message": "Missing required fields: name, pilot_id, copilot_id, or category"}), 400

    if data['category'] not in ALLOWED_CATEGORIES:
        return jsonify({
            "message": f"Invalid category. Must be one of: {', '.join(ALLOWED_CATEGORIES)}"
        }), 400

    pilot_id = data['pilot_id']
    category = data['category'].strip().lower()

    existing_teams = db.collection('teams').where(
        filter=FieldFilter('pilot_id', '==', pilot_id)
    ).stream()

    for team_doc in existing_teams:
        team_data = team_doc.to_dict() or {}
        existing_cat = str(team_data.get('category', '')).strip().lower()
        if existing_cat == category:
            return jsonify({
                "message": f"You are already the pilot of a '{category}' team. You cannot create another one."
            }), 409

    team_data = {
        "name": data['name'],
        "pilot_id": pilot_id,
        "copilot_id": data['copilot_id'],
        "category": data['category']
    }

    try:
        _, doc_ref = db.collection('teams').add(team_data)
        created_team = doc_ref.get()
        return jsonify(_serialize_team(created_team)), 201

    except Exception as e:
        return jsonify({"message": f"Error creating team: {str(e)}"}), 500


@teams_bp.route('/<team_id>/join', methods=['POST'])
def join_team(team_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or '').strip()
    role = (data.get('role') or '').strip()

    if not user_id:
        return jsonify({"message": "Missing required field: user_id"}), 400

    if role != 'participant_copilot':
        return jsonify({"message": "Only users with the Co-pilot role can join a team."}), 403

    team_ref = db.collection('teams').document(team_id)
    team_doc = team_ref.get()

    if not team_doc.exists:
        return jsonify({"message": "Team not found"}), 404

    team_data = team_doc.to_dict() or {}
    pilot_id = (team_data.get('pilot_id') or '').strip()
    copilot_id = (team_data.get('copilot_id') or '').strip()
    team_category = str(team_data.get('category') or '').strip().lower()

    if pilot_id == user_id:
        return jsonify({"message": "You are already the pilot of this team."}), 409

    if copilot_id == user_id:
        return jsonify({"message": "You are already the co-pilot of this team."}), 409

    if copilot_id:
        return jsonify({"message": "This team already has a co-pilot."}), 409

    existing_as_copilot = db.collection('teams').where(
        filter=FieldFilter('copilot_id', '==', user_id)
    ).stream()

    for existing_doc in existing_as_copilot:
        existing_data = existing_doc.to_dict() or {}
        existing_category = str(existing_data.get('category') or '').strip().lower()
        if existing_category == team_category:
            return jsonify({
                "message": "You are already a co-pilot in a team of this category."
            }), 409

    try:
        team_ref.update({'copilot_id': user_id})
        updated_team = team_ref.get()
        return jsonify(_serialize_team(updated_team)), 200
    except Exception as error:
        return jsonify({"message": f"Error joining team: {str(error)}"}), 500


@teams_bp.route('/<team_id>/leave', methods=['POST'])
def leave_team(team_id):
    data = request.get_json() or {}
    user_id = (data.get('user_id') or '').strip()
    role = (data.get('role') or '').strip()

    if not user_id:
        return jsonify({"message": "Missing required field: user_id"}), 400

    if role != 'participant_copilot':
        return jsonify({"message": "Only users with the Co-pilot role can leave a team from this action."}), 403

    team_ref = db.collection('teams').document(team_id)
    team_doc = team_ref.get()

    if not team_doc.exists:
        return jsonify({"message": "Team not found"}), 404

    team_data = team_doc.to_dict() or {}
    copilot_id = (team_data.get('copilot_id') or '').strip()

    if copilot_id != user_id:
        return jsonify({"message": "You are not the co-pilot of this team."}), 409

    try:
        team_ref.update({'copilot_id': ''})
        updated_team = team_ref.get()
        return jsonify(_serialize_team(updated_team)), 200
    except Exception as error:
        return jsonify({"message": f"Error leaving team: {str(error)}"}), 500
