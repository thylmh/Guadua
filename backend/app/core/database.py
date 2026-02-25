from sqlalchemy import create_engine
import os
from app.core.config import settings
from sqlalchemy.orm import sessionmaker

# Database credentials and config
db_host = os.environ.get("DB_HOST", "127.0.0.1")
db_port = os.environ.get("DB_PORT", "3306")
db_user = os.environ.get("DB_USER", settings.DB_USER)
db_pass = os.environ.get("DB_PASS", settings.DB_PASS)
db_name = os.environ.get("DB_NAME", settings.DB_NAME)

# Lazy Connector initialization to avoid DefaultCredentialsError
_connector = None

def getconn():
    """ 
    Used by SQLAlchemy creator when connecting via Google Cloud SQL Connector.
    Note: In local TCP mode, this function is NOT usually called by the engine,
    but it must exist because other modules import it.
    """
    global _connector
    try:
        from google.cloud.sql.connector import Connector
        if _connector is None:
            _connector = Connector()
        
        return _connector.connect(
            settings.CLOUDSQL_CONNECTION_NAME,
            "pymysql",
            user=db_user,
            password=db_pass,
            db=db_name,
        )
    except Exception as e:
        # Fallback or re-raise if someone explicitly called this expecting a cloud connection
        print(f"Error in getconn (Cloud SQL Connector): {e}")
        raise

# Determine connection strategy
if os.environ.get("USE_TCP_CONNECTION") or not settings.CLOUDSQL_CONNECTION_NAME:
    # Standard TCP (Local Proxy or Direct DB)
    db_url = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    print(f"DEBUG: Connecting via TCP to {db_host}:{db_port}")
    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )
else:
    # Google Cloud SQL Connector (Cloud Run / Prod)
    print(f"DEBUG: Connecting via Cloud SQL Connector: {settings.CLOUDSQL_CONNECTION_NAME}")
    engine = create_engine(
        "mysql+pymysql://",
        creator=getconn,
        pool_size=5,
        max_overflow=10,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def disconnect():
    global _connector
    if _connector:
        try:
            _connector.close()
        except:
            pass
