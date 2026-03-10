from flask import Flask

def create_app():
    app = Flask(__name__)

    @app.route('/health', methods=['GET'])
    def health_check():
        return {"status": "ok", "message": "API scaffolding successful for Racing App"}

    return app