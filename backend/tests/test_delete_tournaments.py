import sys
import os

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import unittest
from backend.app import create_app

class TestDeleteTournamentAPI(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.testing = True
        self.client = self.app.test_client()

    def test_delete_existing_tournament(self):
        # 1. Creación de un torneo temporal
        mock_data = {
            "name": "Torneo Temporal a Borrar",
            "start_date": "2026-10-01",
            "end_date": "2026-10-05"
        }
        create_response = self.client.post('/api/tournaments/', json=mock_data)

        # Si se ha creado correctamente, se extrae el ID
        self.assertEqual(create_response.status_code, 201)
        tournament_id = create_response.get_json()['id']

        # 2. Se borra el torneo mediante el ID obtenido
        delete_response = self.client.delete(f'/api/tournaments/{tournament_id}')

        self.assertEqual(delete_response.status_code, 200, "El servidor debería devolver 200 al borrar")

        # 3. Se intenta borrar el torneo borrado
        delete_again_response = self.client.delete(f'/api/tournaments/{tournament_id}')

        self.assertEqual(delete_again_response.status_code, 404, "El servidor debería devolver 404 si el torneo ya no existe")

    def test_delete_nonexistent_tournament(self):
        response = self.client.delete('/api/tournaments/random_ID_999')
        self.assertEqual(response.status_code, 404, "El servidor debe devolver 404 para IDs que no existen")

if __name__ == '__main__':
    unittest.main()