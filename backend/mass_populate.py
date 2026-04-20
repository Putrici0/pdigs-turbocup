import random
from datetime import datetime, timedelta, timezone
from faker import Faker
from backend.app.db import db
from backend.app.models.racing_category import racing_category
from backend.app.logic.simulator import resolve_match_mechanics, update_participant_stats

fake = Faker()
CATEGORIES = [cat.value for cat in racing_category]
LARGE_BRACKET_SIZE = 16
BASE_BRACKET_SIZE = 8

def get_existing_data():
    """Optimized: Builds O(1) cache from existing Firestore data."""
    print("Fetching existing data...")
    users = [doc.id for doc in db.collection("users").select([]).stream()]
    teams_dict = {}
    for doc in db.collection("teams").stream():
        data = doc.to_dict()
        teams_dict[doc.id] = {
            "id": doc.id, "category": data.get("category"), "name": data.get("name"),
            "pilot_id": data.get("pilot_id"), "copilot_id": data.get("copilot_id")
        }
    return teams_dict, users

def run_iteration_1(user_count=60):
    """Generates initial Users, Participants, and Teams."""
    print(f"--- Generating {user_count} Users and Teams ---")
    batch = db.batch()
    user_ids = []
    for _ in range(user_count):
        uid = fake.uuid4()
        first, last = fake.first_name(), fake.last_name()
        batch.set(db.collection("users").document(uid), {
            "email": fake.email(), "fullName": f"{first} {last}", "username": fake.user_name(), "createdAt": datetime.now(timezone.utc)
        })
        batch.set(db.collection("participants").document(uid), {
            "name": first, "last_name": last, "user_id": uid,
            "dob": fake.date_of_birth(minimum_age=18).isoformat(),
            "license": f"TC-{fake.random_number(digits=7)}",
            "stats": {"win": 0, "loss": 0, "matchesPlayed": 0},
            "created_at": datetime.now(timezone.utc)
        })
        user_ids.append(uid)
    
    random.shuffle(user_ids)
    team_info = {}
    for i in range(0, len(user_ids) - 1, 2):
        cat = random.choice(CATEGORIES)
        name = f"{fake.last_name()} Racing"
        t_ref = db.collection("teams").document()
        p_id, cp_id = user_ids[i], user_ids[i+1]
        batch.set(t_ref, {"name": name, "pilot_id": p_id, "copilot_id": cp_id, "category": cat})
        team_info[t_ref.id] = {"id": t_ref.id, "category": cat, "name": name, "pilot_id": p_id, "copilot_id": cp_id}
    
    batch.commit()
    return team_info, user_ids

def simulate_season(year, count, teams_dict, user_ids):
    """VITAL: Simulates full brackets using centralized logic."""
    print(f"--- Simulating Season {year} ({count} Brackets) ---")
    batch = db.batch()
    ops = 0
    all_teams = list(teams_dict.values())

    for i in range(count):
        cat = random.choice(CATEGORIES)
        eligible = [t for t in all_teams if t["category"] == cat]
        if len(eligible) < BASE_BRACKET_SIZE:
            continue

        num_p = LARGE_BRACKET_SIZE if len(eligible) >= LARGE_BRACKET_SIZE else BASE_BRACKET_SIZE
        current_round_teams = random.sample(eligible, num_p)
        start_date = datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(days=i * (360//count))
        
        t_ref = db.collection("tournaments").document()
        batch.set(t_ref, {
            "name": f"{year} {cat.capitalize()} Trophy", "category": cat, "status": "past",
            "start_date": start_date.isoformat(), "registered_team_ids": [t["id"] for t in current_round_teams],
            "participants": [{"id": t["id"], "name": t["name"]} for t in current_round_teams],
            "creator_id": random.choice(user_ids)
        })

        round_num = 1
        while len(current_round_teams) >= 2:
            winners = []
            for j in range(0, len(current_round_teams) - 1, 2):
                t_a, t_b = current_round_teams[j], current_round_teams[j+1]
                
                # USE CENTRALIZED SIMULATOR
                res = resolve_match_mechanics(t_a, t_b)
                win_id = res["winner_id"]
                winners.append(t_a if win_id == t_a["id"] else t_b)
                
                m_ref = db.collection("matches").document()
                batch.set(m_ref, {
                    "tournament_id": t_ref.id, "category": cat, "status": "past",
                    "team_a_id": t_a["id"], "team_a_name": t_a["name"],
                    "team_b_id": t_b["id"], "team_b_name": t_b["name"],
                    "winner_id": win_id, "winner_name": res["winner_name"],
                    "round": round_num, "created_at": start_date.isoformat()
                })
                
                for tid in [t_a["id"], t_b["id"]]:
                    tel = res["telemetry"][tid]
                    batch.set(db.collection("match_stats").document(), {
                        "match_id": m_ref.id, "team_id": tid,
                        "average_speed": tel["average_speed"], "section_times": tel["section_times"]
                    })
                    update_participant_stats(batch, db, teams_dict[tid], win_id)
                    ops += 3
                
                if ops >= 400: batch.commit(); batch = db.batch(); ops = 0
            
            current_round_teams = winners
            round_num += 1
            start_date += timedelta(hours=12)

    batch.commit()

if __name__ == "__main__":
    # To run: $env:PYTHONPATH='.'; python backend/mass_populate.py
    teams, users = get_existing_data()
    if not teams:
        teams, users = run_iteration_1(80)
    
    simulate_season(2024, 8, teams, users)
    simulate_season(2025, 12, teams, users)
