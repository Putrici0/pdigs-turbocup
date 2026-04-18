import random
from datetime import datetime, timedelta
from faker import Faker
from backend.app.db import db
from backend.app.models.racing_category import racing_category
from google.cloud import firestore

fake = Faker()
CATEGORIES = [cat.value for cat in racing_category]

def clear_collection(collection_name):
    """Helper to delete all documents in a collection (use with caution)."""
    docs = db.collection(collection_name).stream()
    for doc in docs:
        doc.reference.delete()
    print(f"Cleared collection: {collection_name}")

def generate_users_and_participants(count=20):
    """Iteration 1: Create Users and their corresponding Participant profiles."""
    user_ids = []
    print(f"Generating {count} users and participants...")
    
    for _ in range(count):
        first_name = fake.first_name()
        last_name = fake.last_name()
        email = fake.email()
        uid = fake.uuid4() 
        
        user_data = {
            "email": email,
            "fullName": f"{first_name} {last_name}",
            "username": fake.user_name(),
            "createdAt": datetime.utcnow()
        }
        db.collection("users").document(uid).set(user_data)
        
        participant_data = {
            "name": first_name,
            "last_name": last_name,
            "dob": fake.date_of_birth(minimum_age=18, maximum_age=50).isoformat(),
            "license": f"LIC-{fake.random_number(digits=8)}",
            "licenseExpedition": (datetime.now() - timedelta(days=fake.random_int(100, 1000))).isoformat(),
            "user_id": uid,
            "stats": {
                "win": 0,
                "loss": 0,
                "matchesPlayed": 0
            },
            "created_at": datetime.utcnow()
        }
        db.collection("participants").document(uid).set(participant_data)
        user_ids.append(uid)
    
    print(f"Successfully generated {len(user_ids)} users.")
    return user_ids

def generate_teams(user_ids):
    """Iteration 2a: Create teams by pairing users."""
    team_ids = []
    random.shuffle(user_ids)
    
    print(f"Generating teams from {len(user_ids)} users...")
    
    for i in range(0, len(user_ids) - 1, 2):
        pilot_id = user_ids[i]
        copilot_id = user_ids[i+1]
        category = random.choice(CATEGORIES)
        
        team_data = {
            "name": f"{fake.company()} Racing Team",
            "pilot_id": pilot_id,
            "copilot_id": copilot_id,
            "category": category
        }
        
        _, doc_ref = db.collection("teams").add(team_data)
        team_ids.append((doc_ref.id, category))
        
    print(f"Generated {len(team_ids)} teams.")
    return team_ids

def generate_tournaments(team_info, user_ids, count=5):
    """Iteration 2b: Create tournaments and enroll teams of the same category."""
    tournament_ids = []
    states = ["past", "current", "scheduled"]
    
    print(f"Generating {count} tournaments...")
    
    for _ in range(count):
        state = random.choice(states)
        category = random.choice(CATEGORIES)
        
        eligible_teams = [t[0] for t in team_info if t[1] == category]
        if not eligible_teams:
            continue
            
        enrolled_teams = random.sample(eligible_teams, min(len(eligible_teams), 8))
        
        start_date = fake.date_time_this_year()
        if state == "past":
            end_date = start_date + timedelta(days=2)
        elif state == "current":
            start_date = datetime.now() - timedelta(days=1)
            end_date = datetime.now() + timedelta(days=1)
        else:
            start_date = datetime.now() + timedelta(days=10)
            end_date = start_date + timedelta(days=2)

        tournament_data = {
            "name": f"Grand Prix {category.capitalize()} {fake.city()}",
            "category": category,
            "status": state,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "registered_team_ids": enrolled_teams,
            "participants": [{"id": tid, "name": "Team " + tid[:4]} for tid in enrolled_teams],
            "max_participants": 16,
            "creator_id": random.choice(user_ids) if user_ids else "admin"
        }
        
        _, doc_ref = db.collection("tournaments").add(tournament_data)
        tournament_ids.append(doc_ref.id)
        
    print(f"Generated {len(tournament_ids)} tournaments.")
    return tournament_ids

def generate_matches_and_stats(tournament_ids):
    """Iteration 3: Create matches for tournaments and performance telemetry."""
    print("Generating matches and telemetry...")
    
    for t_id in tournament_ids:
        t_doc = db.collection("tournaments").document(t_id).get()
        t_data = t_doc.to_dict()
        team_ids = t_data.get("registered_team_ids", [])
        status = t_data.get("status")
        category = t_data.get("category")
        
        if not team_ids or len(team_ids) < 2:
            continue
            
        for i in range(0, len(team_ids) - 1, 2):
            team_a = team_ids[i]
            team_b = team_ids[i+1]
            
            winner_id = None
            match_status = "scheduled"
            
            if status == "past":
                winner_id = random.choice([team_a, team_b])
                match_status = "past"
            elif status == "current":
                match_status = "current"
                
            match_data = {
                "tournament_id": t_id,
                "team_a_id": team_a,
                "team_b_id": team_b,
                "category": category,
                "status": match_status,
                "winner_id": winner_id,
                "round": 1
            }
            
            _, match_ref = db.collection("matches").add(match_data)
            
            for tid in [team_a, team_b]:
                stats_data = {
                    "match_id": match_ref.id,
                    "team_id": tid,
                    "average_speed": round(random.uniform(150, 320), 2),
                    "section_times": {
                        "sector_1": round(random.uniform(20, 40), 3),
                        "sector_2": round(random.uniform(30, 60), 3),
                        "sector_3": round(random.uniform(20, 40), 3)
                    }
                }
                db.collection("match_stats").add(stats_data)
                
                if status == "past":
                    team_doc = db.collection("teams").document(tid).get().to_dict()
                    for role_key in ["pilot_id", "copilot_id"]:
                        uid = team_doc.get(role_key)
                        if uid:
                            p_ref = db.collection("participants").document(uid)
                            is_winner = (tid == winner_id)
                            p_ref.update({
                                "stats.matchesPlayed": firestore.Increment(1),
                                "stats.win": firestore.Increment(1) if is_winner else firestore.Increment(0),
                                "stats.loss": firestore.Increment(0) if is_winner else firestore.Increment(1)
                            })

    print("Generation complete!")

if __name__ == "__main__":
    # Change to True if you want to clear collections first
    if False:
        clear_collection("users")
        clear_collection("participants")
        clear_collection("teams")
        clear_collection("tournaments")
        clear_collection("matches")
        clear_collection("match_stats")
    
    uids = generate_users_and_participants(40)
    teams = generate_teams(uids)
    tournament_ids = generate_tournaments(teams, uids, 8)
    generate_matches_and_stats(tournament_ids)
