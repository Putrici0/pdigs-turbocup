from flask import Flask

from backend.app.api.matches import matches_bp
from backend.app.api.stats import stats_bp
from backend.app.api.teams import teams_bp
from backend.app.api.tournaments import tournaments_bp


def create_app():
    app = Flask(__name__)

    @app.route('/health', methods=['GET'])
    def health_check():
        return {"status": "ok", "message": "API scaffolding successful for TurboCup"}

    app.register_blueprint(tournaments_bp, url_prefix='/api/tournaments')
    app.register_blueprint(teams_bp, url_prefix='/api/teams')
    app.register_blueprint(matches_bp, url_prefix='/api/matches')
    app.register_blueprint(stats_bp, url_prefix='/api/stats')


    return app