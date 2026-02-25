from sqlalchemy import Column, String, Text, DateTime, BigInteger, JSON
from sqlalchemy.sql import func
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class BAuditoria(Base):
    __tablename__ = "BAuditoria"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Actor Context
    actor_email = Column(String(255), index=True, nullable=False)
    actor_ip = Column(String(45), nullable=True)  # IPv6 support
    
    # Event Context
    module = Column(String(50), index=True, nullable=False)  # e.g., 'Vacantes', 'Usuarios'
    action = Column(String(50), index=True, nullable=False)  # e.g., 'CREATE', 'UPDATE', 'DELETE'
    resource_id = Column(String(255), index=True, nullable=True)
    
    # Data Changes (Snapshots)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    
    # Human Readable Summary
    details = Column(Text, nullable=True)
