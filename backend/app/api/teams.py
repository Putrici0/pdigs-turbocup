from flask import Blueprint, request, jsonify
from backend.app.db import db
from backend.app.utils import serialize_firestore

teams_bp = Blueprint('teams', __name__)

# Definimos las categorías permitidas (las mismas que en los torneos)
ALLOWED_CATEGORIES = ["Formula", "Rally", "GT Racing", "Touring Car", "Karting", "Stock Car"]

@teams_bp.route('/', methods=['POST'])
def create_team():
    data = request.get_json()

    # 1. Validación de campos obligatorios
    if not data or not all(key in data for key in ("name", "pilot_id", "copilot_id", "category")):
        return jsonify({"message": "Missing required fields: name, pilot_id, copilot_id, or category"}), 400

    # 2. Validación de la categoría
    if data['category'] not in ALLOWED_CATEGORIES:
        return jsonify({
            "message": f"Invalid category. Must be one of: {', '.join(ALLOWED_CATEGORIES)}"
        }), 400

    # 3. Construimos el diccionario con los datos limpios
    team_data = {
        "name": data['name'],
        "pilot_id": data['pilot_id'],
        "copilot_id": data['copilot_id'],
        "category": data['category']
    }

    try:
        # 4. Guardamos en Firebase (colección 'teams')
        _, doc_ref = db.collection('teams').add(team_data)

        # 5. Recuperamos el documento recién creado para devolverlo con su ID
        created_team = doc_ref.get()
        return jsonify(serialize_firestore(created_team)), 201

    except Exception as e:
        return jsonify({"message": f"Error creating team: {str(e)}"}), 500