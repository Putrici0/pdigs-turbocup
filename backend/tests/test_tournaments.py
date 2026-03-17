import sys
import os

# 1. Calculamos la ruta a la raíz de tu proyecto (pdigs-turbocup)
# __file__ es este archivo. Subimos dos niveles: tests -> backend -> pdigs-turbocup
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))

# 2. Obligamos a Python a incluir esa carpeta en su radar de búsquedas
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# 3. Ahora ya podemos importar sin que Python entre en pánico
import unittest
from backend.app import create_app

class TestTournamentsAPI(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.testing = True
        self.client = self.app.test_client()

    def test_get_current_tournaments(self):
        response = self.client.get('/api/tournaments/current')
        self.assertEqual(response.status_code, 200, "El endpoint debería devolver un código 200")

        data = response.get_json()
        self.assertIsInstance(data, list, "La respuesta debe ser una lista JSON")

        for tournament in data:
            self.assertEqual(
                tournament.get("status"),
                "current",
                f"Fallo en el filtro: se coló un torneo con status {tournament.get('status')}"
            )

if __name__ == '__main__':
    unittest.main()