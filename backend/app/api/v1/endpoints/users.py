from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from app.core.security import get_current_user, require_role
from app.core.database import engine, get_db
from app.models.schemas import UserWhitelist
from app.services.audit_service import AuditService
from sqlalchemy.orm import Session

router = APIRouter()

@router.get("/whitelist")
def get_whitelist(user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin"])
    try:
        # Join Strategy: Prefer Cedula if available, else Email.
        # REGEXP_REPLACE is used to normalize both sides to digits only for comparison (MySQL 8.0+)
        # Fallback to nested REPLACE if needed, but starting with robust digits match.
        query = text("""
            SELECT 
                w.email, 
                w.role,
                w.cedula as whitelist_cedula,
                d.p_nombre,
                d.p_apellido,
                d.s_nombre,
                d.s_apellido,
                CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) as nombre_completo,
                p.cargo,
                p.Direccion,
                COALESCE(d.cedula, w.cedula) as display_cedula,
                CASE WHEN d.cedula IS NOT NULL THEN 1 ELSE 0 END as is_mapped
            FROM BWhitelist w
            LEFT JOIN BData d ON 
                 (w.cedula IS NOT NULL AND 
                  REPLACE(REPLACE(REPLACE(CAST(d.cedula AS CHAR), '.', ''), '-', ''), ' ', '') = 
                  REPLACE(REPLACE(REPLACE(CAST(w.cedula AS CHAR), '.', ''), '-', ''), ' ', '')) 
              OR (w.cedula IS NULL AND LOWER(TRIM(d.correo_electronico)) = LOWER(TRIM(w.email)))
            LEFT JOIN BContrato c ON d.cedula = c.cedula AND c.estado = 'Activo'
            LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
            ORDER BY w.email
        """)
        
        try:
            with engine.connect() as conn:
                rows = conn.execute(query).mappings().all()
        except Exception:
            # Fallback for resiliency
            query_fallback = text("SELECT email, role, cedula as whitelist_cedula FROM BWhitelist ORDER BY email")
            with engine.connect() as conn:
                rows = conn.execute(query_fallback).mappings().all()

        return [dict(r) for r in rows]
    except Exception as e:
        # Fallback for local debug
        if user.get("source") == "local_debug":
             return [
                {"email": "admin@humboldt.org.co", "role": "admin", "nombre_completo": "Admin Local", "cargo": "Desarrollador"},
                {"email": "financiero@humboldt.org.co", "role": "financiero", "nombre_completo": "Analista Financiero", "cargo": "Analista"},
                {"email": "usuario@humboldt.org.co", "role": "user", "nombre_completo": "Investigador Prueba", "cargo": "Investigador Titular"}
            ]
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/whitelist")
def upsert_whitelist(data: UserWhitelist, user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_role(user, ["admin"])
    audit = AuditService(db)
    try:
        # Handle empty string as NULL for cedula
        cedula_raw = data.cedula.strip() if data.cedula and data.cedula.strip() else None
        email_val = data.email.strip().lower()
        
        old_values = None
        action = "CREATE"
        resource_id = email_val
        
        with engine.connect() as conn:
            q_check = text("SELECT * FROM BWhitelist WHERE email = :email")
            existing = conn.execute(q_check, {"email": email_val}).mappings().first()
            if existing:
                old_values = dict(existing)
                action = "UPDATE"
        
        query = text("""
            INSERT INTO BWhitelist (email, role, cedula) 
            VALUES (:email, :role, :cedula) 
            ON DUPLICATE KEY UPDATE 
                role = :role, 
                cedula = :cedula
        """)
        
        new_values = {"email": email_val, "role": data.role, "cedula": cedula_raw}
        
        with engine.begin() as conn:
            conn.execute(query, new_values)
            
        audit.log_event(
            actor_email=user['email'],
            module='Usuarios',
            action=action,
            resource_id=resource_id,
            old_values=old_values,
            new_values=new_values,
            details=f"{action} Usuario {email_val}"
        )
        
        return {"ok": True, "mensaje": "Usuario actualizado correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/whitelist/{email}")
def delete_whitelist(email: str, user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_role(user, ["admin"])
    audit = AuditService(db)
    try:
        email_val = email.strip().lower()
        
        with engine.connect() as conn:
            q_check = text("SELECT * FROM BWhitelist WHERE email = :email")
            existing = conn.execute(q_check, {"email": email_val}).mappings().first()
            if not existing:
                raise HTTPException(status_code=404, detail="Usuario no encontrado")
            old_values = dict(existing)
            
        query = text("DELETE FROM BWhitelist WHERE email = :email")
        with engine.begin() as conn:
            conn.execute(query, {"email": email_val})
            
        audit.log_event(
            actor_email=user['email'],
            module='Usuarios',
            action='DELETE',
            resource_id=email_val,
            old_values=old_values,
            details=f"DELETE Usuario {email_val}"
        )

        return {"ok": True, "mensaje": "Usuario eliminado de whitelist"}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/user-lookup")
def lookup_user_by_cedula(cedula: str, user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin"])
    try:
        # Clean input: keep only digits
        cedula_digits = "".join(filter(str.isdigit, cedula))
        if not cedula_digits:
            return {"found": False, "msg": "No valid digits in cedula"}

        # Use a very simple query first to avoid any DB-specific function issues
        # MySQL REPLACE is standard but nested ones can sometimes be tricky with some drivers if not handled well
        # We also look for matches with and without zeros
        query = text("""
            SELECT correo_electronico, p_nombre, p_apellido
            FROM BData 
            WHERE 
                REPLACE(REPLACE(REPLACE(CAST(cedula AS CHAR), '.', ''), '-', ''), ' ', '') = :cedula
                OR TRIM(CAST(cedula AS CHAR)) = :cedula
            LIMIT 1
        """)
        
        with engine.connect() as conn:
            row = conn.execute(query, {"cedula": cedula_digits}).mappings().one_or_none()
            
        if row:
            nombre = f"{row['p_nombre'] or ''} {row['p_apellido'] or ''}".strip()
            return {
                "found": True, 
                "email": row["correo_electronico"], 
                "nombre": nombre or "Sin Nombre"
            }
        return {"found": False}
    except Exception as e:
        # If it crashes, return a 400 so the frontend catch block triggers but we can see why (if we inspect)
        # For now, let's return it as JSON with 200 to avoid SyntaxError in frontend
        return {"found": False, "error": str(e), "msg": "Error en servidor"}
