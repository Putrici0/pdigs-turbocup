from datetime import datetime

from flask import Blueprint, jsonify, request
from unicodedata import category

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

    # Añadimos 'category' a la validación
    if not data or 'name' not in data or 'start_date' not in data or 'category' not in data:
        return jsonify({"message": "Missing name, start_date, or category"}), 400

    try:
        start_date = datetime.strptime(data['start_date'], "%Y-%m-%d")
    except ValueError:
        return jsonify({"message": "start_date must be a valid date in YYYY-MM-DD format"}), 400

    end_date_str = data.get('end_date')
    end_date = None
    if end_date_str:
        try:
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
        except ValueError:
            return jsonify({"message": "end_date must be a valid date in YYYY-MM-DD format"}), 400

    now = datetime.now()

    if start_date > now:
        status = "scheduled"
    else:
        if not end_date or end_date >= now:
            status = "current"
        else:
            status = "past"

    # En tu modelo Tournament (si lo tienes definido con clases), deberás asegurarte
    # de que acepta este nuevo parámetro. Si usas diccionarios directos, sería así:
    tournament_data = {
        "name": data['name'],
        "category": data['category'],  # <-- NUEVO CAMPO AÑADIDO
        "start_date": data['start_date'],
        "end_date": data.get('end_date'),
        "max_participants": data.get('max_participants', 0),
        "statistics_url": data.get('statistics_url', ""),
        "status": status,
        "participants": [] # Inicializamos la lista de participantes vacía para el futuro
    }

    _, doc_ref = db.collection('tournaments').add(tournament_data)
    created_tournament = doc_ref.get()

    return jsonify(serialize_firestore(created_tournament)), 201

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

@tournaments_bp.route("/admin/<admin_id>", methods=["GET"])
def get_admin_tournaments(admin_id):
    query = db.collection("tournaments").where("creator_id", "==", admin_id).stream()

    data = [serialize_firestore(doc) for doc in query]

    return jsonify(data), 200

@tournaments_bp.route("/<tournament_id>/details", methods=["GET"])
def get_tournament_detailed(tournament_id):

    tourn_ref = db.collection("tournaments").document(tournament_id).get()
    if not tourn_ref.exists:
        return jsonify({"message": "Torneo no encontrado"}), 404

    detailed_data = serialize_firestore(tourn_ref)

    matches_query = db.collection("matches").where("tournament_id", "==", tournament_id).stream()

    matches_list = []
    team_ids = set()

    for match in matches_query:
        match_dict = match.to_dict()
        match_dict["id"] = match.id
        matches_list.append(match_dict)

        if match_dict.get("team_a_id"):
            team_ids.add(match_dict["team_a_id"])
        if match_dict.get("team_b_id"):
            team_ids.add(match_dict["team_b_id"])

    # 3. resolucón de IDs de los equipos
    teams_dict = {}
    for t_id in team_ids:
        t_ref = db.collection("teams").document(t_id).get()
        if t_ref.exists:
            # Se guarda el nombre en un diccionario usando la ID como llave
            teams_dict[t_id] = t_ref.to_dict().get("name", "Equipo Desconocido")

    # 4. Se inyectan los nombres reales dentro de cada match para facilitar el frontend
    for match in matches_list:
        match["team_a_name"] = teams_dict.get(match.get("team_a_id"), "TBD (Por definir)")
        match["team_b_name"] = teams_dict.get(match.get("team_b_id"), "TBD (Por definir)")

    detailed_data["matches"] = matches_list

    # Se manda el diccionario de equipos a Angular por si fuera necesario para pintar una tabla
    detailed_data["teams_involved"] = teams_dict

    return jsonify(detailed_data), 200