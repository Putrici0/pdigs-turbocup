import random
from google.cloud import firestore

def resolve_match_mechanics(team_a_data, team_b_data):

    stats_a = {
        "sector_1": round(random.uniform(28.0, 32.0), 3),
        "sector_2": round(random.uniform(42.0, 48.0), 3),
        "sector_3": round(random.uniform(26.0, 30.0), 3)
    }
    stats_b = {
        "sector_1": round(random.uniform(28.0, 32.0), 3),
        "sector_2": round(random.uniform(42.0, 48.0), 3),
        "sector_3": round(random.uniform(26.0, 30.0), 3)
    }
    
    total_a = sum(stats_a.values())
    total_b = sum(stats_b.values())
    
    # 2. Determine winner
    if total_a < total_b:
        winner_id = team_a_data["id"]
        winner_name = team_a_data["name"]
    else:
        winner_id = team_b_data["id"]
        winner_name = team_b_data["name"]
        
    return {
        "winner_id": winner_id,
        "winner_name": winner_name,
        "telemetry": {
            team_a_data["id"]: {
                "average_speed": round(random.uniform(210, 310), 2), 
                "section_times": stats_a,
                "total_time": round(total_a, 3)
            },
            team_b_data["id"]: {
                "average_speed": round(random.uniform(210, 310), 2), 
                "section_times": stats_b,
                "total_time": round(total_b, 3)
            }
        }
    }

def update_participant_stats(batch, db, team_data, winner_id):
    for role in ["pilot_id", "copilot_id"]:
        uid = team_data.get(role)
        if uid:
            is_win = (team_data["id"] == winner_id)
            batch.update(db.collection("participants").document(uid), {
                "stats.matchesPlayed": firestore.Increment(1),
                "stats.win": firestore.Increment(1 if is_win else 0),
                "stats.loss": firestore.Increment(0 if is_win else 1)
            })
