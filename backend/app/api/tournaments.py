from datetime import datetime

from flask import Blueprint, jsonify, request
from unicodedata import category

from backend.app.db import db
from backend.app.models.tournament import Tournament
from google.cloud.firestore_v1.base_query import FieldFilter
from google.cloud import firestore


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
    """Devuelve el torneo, los equipos inscritos y los matches generados"""

    # 1. Buscamos el torneo base
    tourn_ref = db.collection("tournaments").document(tournament_id).get()
    if not tourn_ref.exists:
        return jsonify({"message": "Torneo no encontrado"}), 404

    detailed_data = serialize_firestore(tourn_ref)

    # --- NUEVA LÓGICA: EQUIPOS INDEPENDIENTES ---
    # 2. Obtenemos los equipos que ya se han unido (asumiendo que guardaremos sus IDs en un array)
    # Si el torneo es nuevo y no tiene el campo, usamos una lista vacía por defecto
    team_ids = detailed_data.get("registered_team_ids", [])

    registered_teams = []
    teams_dictionary = {} # Lo usaremos luego para traducir IDs a nombres rápido

    # Buscamos los detalles de cada equipo inscrito
    for t_id in team_ids:
        t_doc = db.collection("teams").document(t_id).get()
        if t_doc.exists:
            t_data = t_doc.to_dict()
            t_data["id"] = t_doc.id
            registered_teams.append(t_data)
            # Guardamos el nombre para usarlo en los matches
            teams_dictionary[t_id] = t_data.get("name", "Equipo Desconocido")

    # 3. Buscamos los enfrentamientos (matches)
    matches_query = db.collection("matches").where(filter=FieldFilter("tournament_id", "==", tournament_id)).stream()

    matches_list = []
    for match in matches_query:
        match_dict = match.to_dict()
        match_dict["id"] = match.id
        # Como ya tenemos el diccionario de equipos inscritos, traducimos los nombres directamente
        match_dict["team_a_name"] = teams_dictionary.get(match_dict.get("team_a_id"), "TBD (Por definir)")
        match_dict["team_b_name"] = teams_dictionary.get(match_dict.get("team_b_id"), "TBD (Por definir)")
        matches_list.append(match_dict)

    detailed_data["registered_teams"] = registered_teams
    detailed_data["matches"] = matches_list

    return jsonify(detailed_data), 200

@tournaments_bp.route('/<tournament_id>/join', methods=['POST'])
def join_tournament(tournament_id):
    data = request.get_json()

    # 1. Comprobamos que nos envían la ID del equipo
    if not data or 'team_id' not in data:
        return jsonify({"message": "Falta el team_id en la petición"}), 400

    team_id = data['team_id']

    # 2. Buscamos el Torneo en la base de datos
    tourn_ref = db.collection('tournaments').document(tournament_id)
    tourn_doc = tourn_ref.get()

    if not tourn_doc.exists:
        return jsonify({"message": "Torneo no encontrado"}), 404

    tourn_data = tourn_doc.to_dict()

    # 3. Buscamos el Equipo en la base de datos
    team_ref = db.collection('teams').document(team_id)
    team_doc = team_ref.get()

    if not team_doc.exists:
        return jsonify({"message": "Equipo no encontrado"}), 404

    team_data = team_doc.to_dict()

    # 4. REGLA DE NEGOCIO: ¿Coinciden las categorías?
    if tourn_data.get('category') != team_data.get('category'):
        return jsonify({
            "message": f"Incompatibilidad de categoría. El torneo es de {tourn_data.get('category')}, pero el equipo es de {team_data.get('category')}."
        }), 400

    # 5. REGLA DE NEGOCIO: ¿El torneo está lleno?
    registered_teams = tourn_data.get('registered_team_ids', [])
    max_participants = 32

    if len(registered_teams) >= max_participants:
        return jsonify({"message": "El torneo ya ha alcanzado el límite máximo de participantes."}), 400

    # 6. REGLA DE NEGOCIO: ¿El equipo ya estaba inscrito?
    if team_id in registered_teams:
        return jsonify({"message": "El equipo ya está inscrito en este torneo."}), 400

    # 7. Preparamos el objeto del participante para el frontend
    participant_data = {
        "id": team_id,
        "name": team_data.get('name', 'Equipo Desconocido')
    }

    # 8. Si pasa todas las pruebas, lo inscribimos usando ArrayUnion
    # Actualizamos TANTO la lista de IDs (para la lógica) COMO la de participantes (para la vista HTML)
    tourn_ref.update({
        "registered_team_ids": firestore.ArrayUnion([team_id]),
        "participants": firestore.ArrayUnion([participant_data])
    })

    return jsonify({"message": f"El equipo {team_data.get('name')} se ha unido al torneo con éxito."}), 200