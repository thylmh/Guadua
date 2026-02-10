from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.core.security import get_current_user, require_role
from app.core.database import engine, get_db
from app.models.schemas import Incremento
from app.services.audit_service import AuditService
from sqlalchemy.orm import Session

router = APIRouter()

@router.get("/incrementos")
def get_incrementos(user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin"])
    try:
        query = text("SELECT * FROM BIncrementoPar ORDER BY anio DESC")
        with engine.connect() as conn:
            rows = conn.execute(query).mappings().all()
        return [dict(r) for r in rows]
    except Exception as e:
        # Fallback for local
        if user.get("source") == "local_debug":
            return [{"anio": 2024, "smlv": 1300000, "transporte": 162000, "dotacion": 10000, "porcentaje_aumento": 12.0}]
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/incrementos")
def upsert_incremento(data: Incremento, user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_role(user, ["admin"])
    audit = AuditService(db)
    try:
        old_values = None
        action = "CREATE"
        resource_id = str(data.anio)
        
        # Check if exists for Audit Context
        with engine.connect() as conn:
            q_check = text("SELECT * FROM BIncrementoPar WHERE anio = :anio")
            existing = conn.execute(q_check, {"anio": data.anio}).mappings().first()
            if existing:
                old_values = dict(existing)
                action = "UPDATE"
        
        query = text("""
            INSERT INTO BIncrementoPar (anio, smlv, transporte, dotacion, porcentaje_aumento)
            VALUES (:anio, :smlv, :transporte, :dotacion, :porcentaje_aumento)
            ON DUPLICATE KEY UPDATE
                smlv = :smlv,
                transporte = :transporte,
                dotacion = :dotacion,
                porcentaje_aumento = :porcentaje_aumento
        """)
        
        new_values = data.model_dump()
        
        with engine.begin() as conn:
            conn.execute(query, new_values)
            
        audit.log_event(
            actor_email=user['email'],
            module='Incrementos',
            action=action,
            resource_id=resource_id,
            old_values=old_values,
            new_values=new_values,
            details=f"{action} Parámetros Año {data.anio}"
        )

        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/incrementos/{anio}")
def delete_incremento(anio: int, user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_role(user, ["admin"])
    audit = AuditService(db)
    try:
        with engine.connect() as conn:
            q_check = text("SELECT * FROM BIncrementoPar WHERE anio = :anio")
            existing = conn.execute(q_check, {"anio": anio}).mappings().first()
            if not existing:
                raise HTTPException(status_code=404, detail="Año no encontrado")
            old_values = dict(existing)
            
        query = text("DELETE FROM BIncrementoPar WHERE anio = :anio")
        with engine.begin() as conn:
            conn.execute(query, {"anio": anio})
            
        audit.log_event(
            actor_email=user['email'],
            module='Incrementos',
            action='DELETE',
            resource_id=str(anio),
            old_values=old_values,
            details=f"DELETE Parámetros Año {anio}"
        )

        return {"ok": True}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
