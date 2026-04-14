from backend.app.models.team_category import racing_category


class Team:
    def __init__(self, name, driver_id, co_pilot_id, team_category: racing_category):
        self.name = name
        self.driver_id = driver_id
        self.co_pilot_id = co_pilot_id
        self.team_category = team_category

    def to_dict(self):
        return {
            "name": self.name,
            "driver_id": self.driver_id,
            "co_pilot_id": self.co_pilot_id,
            "team_category": self.team_category
        }