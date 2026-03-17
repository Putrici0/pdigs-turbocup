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

@tournaments_bp.route("/past", methods=["GET"])
def get_past_tournaments():
    # 1. Obtenemos solo los torneos pasados desde Firebase
    query = db.collection("tournaments").where("status", "==", "past").stream()
    data = [serialize_firestore(doc) for doc in query]

    # De más reciente a más antiguo
    data.sort(key=lambda x: x.get("end_date", ""), reverse=True)

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

#TODO configurar la función de crear torneos para que solo puedan usarla los administradores(cuando tengamos los roles de administradores)

@tournaments_bp.route('/<tournament_id>', methods=['DELETE'])
def delete_tournament(tournament_id):
    # 1. Creamos una referencia exacta al documento usando su ID
    doc_ref = db.collection('tournaments').document(tournament_id)

    # 2. Se comprueba si existe antes de borrarlo
    doc = doc_ref.get()
    if not doc.exists:
        return jsonify({"message": f"No se encontró ningún torneo con el ID {tournament_id}"}), 404

    # 3. Si existe, se borra de Firestore
    doc_ref.delete()

    # 4. Se devuelve el código 200, confirmando la destrucción
    return jsonify({"message": f"Torneo {tournament_id} borrado con éxito"}), 200