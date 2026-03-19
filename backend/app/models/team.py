class Team:
    def __init__(self, name, driver_id, co_pilot_id, category):
        self.name = name
        self.driver_id = driver_id # A participant can join as a driver
        self.co_pilot_id = co_pilot_id # A participant can join as a co-pilot
        self.category = category

    def to_dict(self):
        return {
            "name": self.name,
            "driver_id": self.driver_id,
            "co_pilot_id": self.co_pilot_id,
            "category": self.category
        }