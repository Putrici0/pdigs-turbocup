from flask import Blueprint, jsonify

tournaments_bp = Blueprint('tournaments', __name__)

@tournaments_bp.route('/', methods=['GET'])
def get_tournaments():
    return jsonify({"message": "GET tournaments working"}), 200

@tournaments_bp.route('/', methods=['POST'])
def create_tournament():
    return jsonify({"message": "POST tournament working"}), 201