from backend.app.models.racing_category import racing_category


class Team:
    def __init__(self, name, pilot_id, copilot_id, category: racing_category):
        self.name = name
        self.pilot_id = pilot_id
        self.copilot_id = copilot_id
        self.category = category

    def to_dict(self):
        return {
            "name": self.name,
            "pilot_id": self.pilot_id,
            "copilot_id": self.copilot_id,
            "category": self.category.value if isinstance(self.category, racing_category) else self.category
        }