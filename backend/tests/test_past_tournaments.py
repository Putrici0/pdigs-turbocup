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
        response = self.client.get('/api/tournaments/past')

        self.assertEqual(response.status_code, 200, "Endpoint must return code 200")

        data = response.get_json()
        self.assertIsInstance(data, list, "Response must be a Json list")

        for tournament in data:
            self.assertEqual(
                tournament.get("status"),
                "past",
                f"Error: A tournament with {tournament.get('status')} appeared"
            )

        if len(data) > 1:
            for i in range(len(data) - 1):
                self.assertGreaterEqual(
                    data[i].get("end_date", ""),
                    data[i+1].get("end_date", ""),
                    "Tournaments must be sorted in chronological order"
                )

if __name__ == '__main__':
    unittest.main()