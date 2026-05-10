import random
from datetime import datetime, timedelta, timezone
from faker import Faker
from backend.app.db import db
from backend.app.models.racing_category import racing_category
from backend.app.logic.simulator import resolve_match_mechanics, update_participant_stats

fake = Faker()
CATEGORIES = [cat.value for cat in racing_category]

def clear_all_data():
    """Wipes the database for a truly fresh start."""
    print("!!! Wiping existing data !!!")
    for col in ["users", "participants", "teams", "tournaments", "matches", "match_stats", "notifications", "predictions"]:
        docs = db.collection(col).stream()
        for doc in docs:
            doc.reference.delete()
    print("Database cleared.")

def run_setup(user_count=120):
    """Creates the foundation: Users, Participants, and Teams."""
    print(f"--- Creating {user_count} Users and corresponding Teams ---")
    batch = db.batch()
    user_ids = []
    
    for _ in range(user_count):
        uid = fake.uuid4()
        first, last = fake.first_name(), fake.last_name()
        batch.set(db.collection("users").document(uid), {
            "email": fake.email(), 
            "fullName": f"{first} {last}", 
            "username": fake.user_name(), 
            "createdAt": datetime.now(timezone.utc)
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
    teams_dict = {}
    for i in range(0, len(user_ids) - 1, 2):
        cat = random.choice(CATEGORIES)
        t_ref = db.collection("teams").document()
        p_id, cp_id = user_ids[i], user_ids[i+1]
        team_data = {
            "name": f"{fake.last_name()} {random.choice(['Racing', 'Motorsport', 'Team', 'GP'])}",
            "pilot_id": p_id, 
            "copilot_id": cp_id, 
            "category": cat
        }
        batch.set(t_ref, team_data)
        teams_dict[t_ref.id] = {**team_data, "id": t_ref.id}
    
    batch.commit()
    return teams_dict, user_ids

def create_tournament_bracket(tournament_name, category, status, teams_pool, creator_id, base_date):
    """
    Refactored Core engine: Ensures winners advance and matches are created for all rounds.
    """
    # Use 16, 8, 4 or 2 teams
    available = len(teams_pool)
    if available >= 16: size = 16
    elif available >= 8: size = 8
    elif available >= 4: size = 4
    elif available >= 2: size = 2
    else: return
    
    current_round_teams = random.sample(teams_pool, size)
    end_date = base_date + timedelta(days=3)
    
    t_ref = db.collection("tournaments").document()
    db.collection("tournaments").document(t_ref.id).set({
        "name": tournament_name, "category": category, "status": status,
        "start_date": base_date.isoformat(), "end_date": end_date.isoformat(),
        "registered_team_ids": [t["id"] for t in current_round_teams],
        "participants": [{"id": t["id"], "name": t["name"]} for t in current_round_teams],
        "creator_id": creator_id, "max_participants": 16
    })

    print(f"  > Tournament: {tournament_name} ({size} teams)")
    round_num = 1
    match_date = base_date
    
    while len(current_round_teams) >= 2:
        winners = []
        # Simulate matches for this round
        # Past: all rounds. Current: Round 1 and 2. Scheduled: None.
        should_simulate = (status == "past") or (status == "current" and round_num <= 2)
        
        print(f"    - Round {round_num}: {len(current_round_teams)} teams -> {len(current_round_teams)//2} matches")
        
        for j in range(0, len(current_round_teams) - 1, 2):
            t_a, t_b = current_round_teams[j], current_round_teams[j+1]
            
            # If t_a or t_b are "TBD" (empty id), we can't simulate
            if not t_a.get("id") or not t_b.get("id"):
                match_status = "scheduled"
                sim_this_match = False
            else:
                match_status = "past" if should_simulate else "scheduled"
                sim_this_match = should_simulate
            
            winner_id, winner_name = None, "TBD"
            team_a_time, team_b_time = None, None
            res = None
            
            if sim_this_match:
                res = resolve_match_mechanics(t_a, t_b)
                winner_id, winner_name = res["winner_id"], res["winner_name"]
                team_a_time = res["telemetry"][t_a["id"]]["total_time"]
                team_b_time = res["telemetry"][t_b["id"]]["total_time"]
                winners.append(t_a if winner_id == t_a["id"] else t_b)
            else:
                winners.append({"id": "", "name": "TBD"})

            m_ref = db.collection("matches").document()
            db.collection("matches").document(m_ref.id).set({
                "tournament_id": t_ref.id, "category": category, "status": match_status,
                "team_a_id": t_a.get("id", ""), "team_a_name": t_a.get("name", "TBD"),
                "team_b_id": t_b.get("id", ""), "team_b_name": t_b.get("name", "TBD"),
                "team_a_time": team_a_time, "team_b_time": team_b_time,
                "winner_id": winner_id, "winner_name": winner_name,
                "round": round_num, "created_at": match_date.isoformat()
            })

            if sim_this_match and res:
                batch = db.batch()
                for tid in [t_a["id"], t_b["id"]]:
                    tel = res["telemetry"][tid]
                    db.collection("match_stats").add({
                        "match_id": m_ref.id, "team_id": tid,
                        "average_speed": tel["average_speed"], "section_times": tel["section_times"]
                    })
                    update_participant_stats(batch, db, t_a if tid == t_a["id"] else t_b, winner_id)
                batch.commit()
            
        current_round_teams = winners
        round_num += 1
        match_date += timedelta(hours=12)

def populate_realistic_world():
    clear_all_data()
    teams_dict, user_ids = run_setup(120)
    all_teams = list(teams_dict.values())
    now = datetime.now(timezone.utc)
    
    # 1. Past Tournaments (2024 - 2025)
    print("--- Simulating History ---")
    for year in [2024, 2025]:
        for i in range(4):
            cat = random.choice(CATEGORIES)
            pool = [t for t in all_teams if t["category"] == cat]
            base_date = datetime(year, random.randint(1,12), random.randint(1,28), tzinfo=timezone.utc)
            if base_date > now: base_date = now - timedelta(days=60)
            create_tournament_bracket(f"{year} {cat.upper()} Cup {fake.city()}", cat, "past", pool, random.choice(user_ids), base_date)

    # 2. Current Tournaments
    print("--- Simulating Live Events ---")
    for cat in CATEGORIES:
        pool = [t for t in all_teams if t["category"] == cat]
        base_date = now - timedelta(days=1)
        create_tournament_bracket(f"Live {cat.upper()} Pro Series", cat, "current", pool, random.choice(user_ids), base_date)
        
    # 3. Scheduled Tournaments
    print("--- Simulating Upcoming Events ---")
    for _ in range(3):
        cat = random.choice(CATEGORIES)
        pool = [t for t in all_teams if t["category"] == cat]
        base_date = now + timedelta(days=10)
        create_tournament_bracket(f"Upcoming {cat.upper()} Trophy", cat, "scheduled", pool, random.choice(user_ids), base_date)

if __name__ == "__main__":
    populate_realistic_world()
    
    print("\n--- Training AI Prediction Model ---")
    try:
        from backend.train_model import main as train_main
        train_main()
    except Exception as e:
        print(f"Warning: Could not train AI model automatically: {e}")
        
    print("\n!!! ALL DATA GENERATED AND AI TRAINED SUCCESSFULLY !!!")
