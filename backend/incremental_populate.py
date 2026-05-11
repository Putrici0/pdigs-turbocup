import random
from datetime import datetime, timedelta, timezone
from backend.app.db import db
from backend.app.models.racing_category import racing_category
from backend.app.logic.simulator import resolve_match_mechanics, update_participant_stats

# This script ADDS data to your existing database instead of clearing it.
# It reuses existing teams to save Firestore quota.

CATEGORIES = [cat.value for cat in racing_category]

def get_existing_teams():
    """Fetches already created teams from Firestore."""
    teams = []
    docs = db.collection("teams").stream()
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        teams.append(data)
    return teams

def get_admin_user():
    """Finds or creates a default admin ID."""
    users = list(db.collection("users").limit(1).stream())
    if users:
        return users[0].id
    return "admin_default"

def add_single_tournament(name, category, status, all_teams, creator_id):
    """Creates one tournament with its full bracket using existing teams."""
    # Filter teams by category
    eligible = [t for t in all_teams if t.get("category") == category]
    
    # Select bracket size (8 or 16)
    if len(eligible) >= 16: size = 16
    elif len(eligible) >= 8: size = 8
    elif len(eligible) >= 4: size = 4
    else:
        print(f"Skipping {name}: Not enough teams in category {category} (found {len(eligible)})")
        return

    current_round_teams = random.sample(eligible, size)
    base_date = datetime.now(timezone.utc)
    if status == "past": base_date -= timedelta(days=30)
    elif status == "scheduled": base_date += timedelta(days=5)

    # 1. Create Tournament
    t_ref = db.collection("tournaments").document()
    t_ref.set({
        "name": name,
        "category": category,
        "status": status,
        "start_date": base_date.isoformat(),
        "end_date": (base_date + timedelta(days=2)).isoformat(),
        "registered_team_ids": [t["id"] for t in current_round_teams],
        "participants": [{"id": t["id"], "name": t["name"]} for t in current_round_teams],
        "creator_id": creator_id
    })
    
    print(f"Added Tournament: {name} ({size} teams)")

    # 2. Build Bracket
    round_num = 1
    match_date = base_date
    while len(current_round_teams) >= 2:
        winners = []
        should_simulate = (status == "past")
        
        for i in range(0, len(current_round_teams) - 1, 2):
            t_a, t_b = current_round_teams[i], current_round_teams[i+1]
            
            winner_id, winner_name = None, "TBD"
            match_status = "past" if should_simulate else "scheduled"
            
            res = None
            if should_simulate:
                res = resolve_match_mechanics(t_a, t_b)
                winner_id, winner_name = res["winner_id"], res["winner_name"]
                winners.append(t_a if winner_id == t_a["id"] else t_b)
            else:
                winners.append({"id": "", "name": "TBD"})

            m_ref = db.collection("matches").document()
            m_ref.set({
                "tournament_id": t_ref.id,
                "category": category,
                "status": match_status,
                "team_a_id": t_a.get("id", ""),
                "team_a_name": t_a.get("name", "TBD"),
                "team_b_id": t_b.get("id", ""),
                "team_b_name": t_b.get("name", "TBD"),
                "winner_id": winner_id,
                "winner_name": winner_name,
                "round": round_num,
                "created_at": match_date.isoformat()
            })

            if should_simulate and res:
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
        match_date += timedelta(hours=6)

def smart_populate():
    print("--- Starting Incremental Populate (Quota Friendly) ---")
    teams = get_existing_teams()
    if not teams:
        print("No existing teams found. Please run mass_populate.py at least once first.")
        return
        
    admin_id = get_admin_user()
    
    # Variant: Create only 2 high-quality tournaments
    cat1 = random.choice(CATEGORIES)
    cat2 = random.choice(CATEGORIES)
    
    add_single_tournament(f"Extra {cat1.upper()} Masters", cat1, "past", teams, admin_id)
    add_single_tournament(f"New {cat2.upper()} Challenger", cat2, "scheduled", teams, admin_id)
    
    print("--- Done! Added new data without wiping the old one. ---")

if __name__ == "__main__":
    smart_populate()
