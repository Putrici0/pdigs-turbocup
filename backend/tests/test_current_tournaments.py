import sys
import os

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))

if project_root not in sys.path:
    sys.path.insert(0, project_root)

import unittest
from backend.app import create_app

class TestTournamentsAPI(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.testing = True
        self.client = self.app.test_client()

    def test_get_current_tournaments(self):
        response = self.client.get('/api/tournaments/current')
        self.assertEqual(response.status_code, 200, "Endpoint must return 200")

        data = response.get_json()
        self.assertIsInstance(data, list, "Response muste be a Json list")

        for tournament in data:
            self.assertEqual(
                tournament.get("status"),
                "current",
                f"Filer failure: A tournament with {tournament.get('status')} status appeared"
            )

if __name__ == '__main__':
    unittest.main()