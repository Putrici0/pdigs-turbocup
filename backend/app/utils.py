def serialize_firestore(doc):
    """
    Toma un documento devuelto por Firestore y lo convierte en un diccionario
    estándar de Python, inyectándole además su ID para poder enviarlo como JSON.
    """
    if not doc or not doc.exists:
        return None

    data = doc.to_dict()
    data['id'] = doc.id  # Sacamos la ID del documento y la metemos dentro de los datos

    return data