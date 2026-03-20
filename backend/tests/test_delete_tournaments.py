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
        mock_data = {
            "name": "Temporal tournament",
            "start_date": "2026-10-01",
            "end_date": "2026-10-05"
        }
        create_response = self.client.post('/api/tournaments/', json=mock_data)

        self.assertEqual(create_response.status_code, 201)
        tournament_id = create_response.get_json()['id']

        delete_response = self.client.delete(f'/api/tournaments/{tournament_id}')

        self.assertEqual(delete_response.status_code, 200, "Server must return 200")

        delete_again_response = self.client.delete(f'/api/tournaments/{tournament_id}')

        self.assertEqual(delete_again_response.status_code, 404, "Server must return 404")

    def test_delete_nonexistent_tournament(self):
        response = self.client.delete('/api/tournaments/random_ID_999')
        self.assertEqual(response.status_code, 404, "Server must return 404")

if __name__ == '__main__':
    unittest.main()