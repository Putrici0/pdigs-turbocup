from faker import Faker
import random
import json
from datetime import datetime

from backend.app.models.tournament import Tournament

fake = Faker("en_US")

statuses = ["scheduled", "current", "past"]
categories = ["Formula", "Rally", "GT Racing", "Touring Car", "Karting", "Stock Car"]

def generate_random_tournament():
    start = fake.date_time_this_year(after_now=True) # generate Scheduled tournaments
    end = fake.date_time_between(start_date=start)

    tournament = Tournament(
        name=fake.catch_phrase(),
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        category=random.choice(categories)
    )