from datetime import datetime

from flask import Blueprint, jsonify, request
from backend.app.db import db
from backend.app.models.tournament import Tournament


tournaments_bp = Blueprint('tournaments', __name__)

def serialize_firestore(doc):
    item = doc.to_dict()

    for key, value in item.items():
        if isinstance(value, datetime):
            item[key] = value.isoformat()

    item["id"] = doc.id
    return item


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


@tournaments_bp.route('/', methods=['POST'])
def create_tournament():
    data = request.get_json()
    if not data or not 'name' in data or not 'start_date' in data:
        return jsonify({"message": "Missing name or start_date"}), 400
    
    try:
        start_date = datetime.strptime(data['start_date'], "%Y-%m-%d")  # formato YYYY-MM-DD
    except ValueError:
        return jsonify({"message": "start_date must be a valid date in YYYY-MM-DD format"}), 400

    # Validar end_date si existe
    end_date_str = data.get('end_date')
    end_date = None
    if end_date_str:
        try:
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
        except ValueError:
            return jsonify({"message": "end_date must be a valid date in YYYY-MM-DD format"}), 400


    now = datetime.now()

    # Determinar status
    if start_date > now:
        status = "scheduled"
    else:
        # start_date pasado o hoy
        if not end_date or end_date >= now:
            status = "current"
        else:
            status = "past"

    tournament = Tournament(
        name=data['name'],
        start_date=data['start_date'],
        end_date=data.get('end_date'),
        status=status
    )

    # Add the new tournament to Firestore
    # The add method returns a tuple with a timestamp and the document reference
    _, doc_ref = db.collection('tournaments').add(tournament.to_dict())

    # Get the created tournament document and return it
    created_tournament = doc_ref.get()
    return jsonify(serialize_firestore(created_tournament)), 201