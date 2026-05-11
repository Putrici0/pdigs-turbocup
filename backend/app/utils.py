def serialize_firestore(doc):
    if not doc or not doc.exists:
        return None

    data = doc.to_dict()
    data['id'] = doc.id

    return data