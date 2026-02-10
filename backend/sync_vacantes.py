from app.core.database import engine
from sqlalchemy import text

def sync_posicion_states():
    with engine.begin() as conn:
        print("--- INICIANDO SINCRONIZACIÓN DE ESTADOS ---")
        
        # 1. First, set everything with an active contract to 'Activo'
        q_activo = text("""
            UPDATE BPosicion
            SET Estado = 'Activo'
            WHERE IDPosicion IN (
                SELECT DISTINCT posicion 
                FROM BContrato 
                WHERE UPPER(estado) LIKE 'ACTIVO%'
            )
        """)
        res_activo = conn.execute(q_activo)
        print(f"Posiciones actualizadas a 'Activo': {res_activo.rowcount}")
        
        # 2. Set everything WITHOUT an active contract to 'Vacante'
        # According to user: "La posiciones que no esten Activo en BPosicion ponerlas en estado Vacante"
        # and "el valor real es del BContrato".
        q_vacante = text("""
            UPDATE BPosicion
            SET Estado = 'Vacante'
            WHERE IDPosicion NOT IN (
                SELECT DISTINCT posicion 
                FROM BContrato 
                WHERE UPPER(estado) LIKE 'ACTIVO%'
            )
        """)
        res_vacante = conn.execute(q_vacante)
        print(f"Posiciones actualizadas a 'Vacante': {res_vacante.rowcount}")
        
        print("Sincronización completada.")

if __name__ == "__main__":
    sync_posicion_states()
