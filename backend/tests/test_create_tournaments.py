import sys
import os

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import unittest
from backend.app import create_app

class TestCreateTournamentAPI(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.testing = True
        self.client = self.app.test_client()

    def test_create_valid_tournament(self):
        # 1. JSON de ejemplo. No pasa naa por ejecutar varias veces el test porque se creará el mismo con otro ID
        mock_data = {
            "name": "Test Turbo Cup 2026",
            "start_date": "2026-06-01",
            "end_date": "2026-06-05"
        }

        # 2. petición POST
        response = self.client.post(
            '/api/tournaments/',
            json=mock_data
        )

        # 3. Verificación de la creación
        self.assertEqual(response.status_code, 201, f"El endpoint falló. Código devuelto: {response.status_code}")

        # 4. Se recupera la respuesta
        data = response.get_json()
        self.assertIn("id", data, "La respuesta debe contener el ID generado por Firestore")
        self.assertEqual(data["name"], "Test Turbo Cup 2026", "El nombre guardado no coincide")

        # 5. Verificamos que la lógica de fechas le asignó el estado correcto (futuro = scheduled)
        self.assertEqual(data["status"], "scheduled", "El torneo futuro debería tener estado 'scheduled'")

    def test_create_tournament_missing_data(self):
        bad_data = {
            "name": "Torneo Roto"
        }
        response = self.client.post('/api/tournaments/', json=bad_data)

        self.assertEqual(response.status_code, 400, "El servidor debería rechazar peticiones sin start_date")

if __name__ == '__main__':
    unittest.main()