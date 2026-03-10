class Team:
    def __init__(self, name, driver, co_pilot, stats=None):
        self.name = name
        self.driver = driver
        self.co_pilot = co_pilot
        self.stats = stats or {
            "wins": 0,
            "losses": 0,
            "total_races": 0
        }

    def to_dict(self):
        """Convierte el objeto a un diccionario para guardarlo en Firebase"""
        return {
            "name": self.name,
            "driver": self.driver,
            "co_pilot": self.co_pilot,
            "stats": self.stats
        }