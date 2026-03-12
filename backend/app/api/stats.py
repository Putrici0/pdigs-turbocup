from flask import Blueprint, jsonify

stats_bp = Blueprint('stats', __name__)

@stats_bp.route('/<match_id>', methods=['GET'])
def get_match_stats(match_id):
    return jsonify({"message": f"GET stats for match {match_id} working"}), 200