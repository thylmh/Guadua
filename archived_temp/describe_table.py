import os
import sqlalchemy
from sqlalchemy import text

# Env vars from run_local.sh logic
os.environ["USE_TCP_CONNECTION"] = "true"
os.environ["DB_HOST"] = "127.0.0.1"
os.environ["DB_PORT"] = "3306"
os.environ["DB_USER"] = "bosquebd"
os.environ["DB_PASS"] = "BosqueDB2026!"
os.environ["DB_NAME"] = "bosquebd"

db_url = f"mysql+pymysql://{os.environ['DB_USER']}:{os.environ['DB_PASS']}@{os.environ['DB_HOST']}:{os.environ['DB_PORT']}/{os.environ['DB_NAME']}"
engine = sqlalchemy.create_engine(db_url)

with engine.connect() as conn:
    result = conn.execute(text("DESCRIBE BFinanciacion"))
    print(f"{'Field':<25} | {'Type':<20}")
    print("-" * 50)
    for row in result:
        print(f"{row[0]:<25} | {row[1]:<20}")
