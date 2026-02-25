from sqlalchemy import create_engine, text
import os

# Database configuration (same as in run_local.sh)
DB_USER = "bosquebd"
DB_PASS = "BosqueDB2026!"
DB_HOST = "127.0.0.1"
DB_PORT = "3306"
DB_NAME = "bosquebd"

engine = create_engine(f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}")

def update_planta():
    with engine.begin() as conn:
        print("--- Ejecutando actualización masiva de Planta ---")
        
        # 1. Operacional N1 -> Planta Minima
        q1 = text("""
            UPDATE BPosicion 
            SET Planta = 'Planta Minima' 
            WHERE (Planta IS NULL OR Planta = '') 
              AND Tipo_planta = 'Operacional N1'
        """)
        res1 = conn.execute(q1)
        print(f"Registros actualizados a 'Planta Minima': {res1.rowcount}")
        
        # 2. Otros -> Proyectos
        q2 = text("""
            UPDATE BPosicion 
            SET Planta = 'Proyectos' 
            WHERE (Planta IS NULL OR Planta = '') 
              AND (Tipo_planta != 'Operacional N1' OR Tipo_planta IS NULL)
        """)
        res2 = conn.execute(q2)
        print(f"Registros actualizados a 'Proyectos': {res2.rowcount}")

if __name__ == "__main__":
    try:
        update_planta()
        print("Actualización completada exitosamente.")
    except Exception as e:
        print(f"Error: {e}")
