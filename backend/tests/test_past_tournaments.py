import sys
import os

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import unittest
from backend.app import create_app

class TestPastTournamentsAPI(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.testing = True
        self.client = self.app.test_client()

    def test_get_past_tournaments(self):
        # 1. Se hace la petición a la nueva ruta
        response = self.client.get('/api/tournaments/past')

        # 2. Esto sale si es correcto
        self.assertEqual(response.status_code, 200, "El endpoint debe devolver un código 200")

        # 3. Se extraen los datos
        data = response.get_json()
        self.assertIsInstance(data, list, "La respuesta debe ser una lista JSON")

        # 4. Solo los de estado "past"
        for tournament in data:
            self.assertEqual(
                tournament.get("status"),
                "past",
                f"Error: Se coló un torneo con estado {tournament.get('status')}"
            )

        # 5. Verificacion orden cronológico
        if len(data) > 1:
            for i in range(len(data) - 1):
                self.assertGreaterEqual(
                    data[i].get("end_date", ""),
                    data[i+1].get("end_date", ""),
                    "Los torneos no están ordenados del más reciente al más antiguo"
                )

if __name__ == '__main__':
    unittest.main()