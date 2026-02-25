from sqlalchemy import create_engine, text
import os

# Database configuration (same as in run_local.sh)
DB_USER = "bosquebd"
DB_PASS = "BosqueDB2026!"
DB_HOST = "127.0.0.1"
DB_PORT = "3306"
DB_NAME = "bosquebd"

engine = create_engine(f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}")

def check_data():
    with engine.connect() as conn:
        print("--- Conteo actual de Planta vacía ---")
        q = text("""
            SELECT Tipo_planta, COUNT(*) as count 
            FROM BPosicion 
            WHERE Planta IS NULL OR Planta = '' 
            GROUP BY Tipo_planta
        """)
        rows = conn.execute(q).mappings().all()
        for r in rows:
            print(f"Tipo_planta: {r['Tipo_planta']} | Count: {r['count']}")

if __name__ == "__main__":
    try:
        check_data()
    except Exception as e:
        print(f"Error: {e}")
