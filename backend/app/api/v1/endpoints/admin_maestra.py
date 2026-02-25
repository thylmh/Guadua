from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.security import get_current_user, require_role
from app.core.database import get_db, engine
from app.services.audit_service import AuditService
from pydantic import BaseModel, Field

router = APIRouter()

class MaestraFinanciacionItem(BaseModel):
    id_financiacion: Optional[str] = None
    cedula: str
    id_contrato: str
    posicion: Optional[str] = None
    fecha_inicio: str
    fecha_fin: str
    salario_base: float
    salario_t: Optional[float] = 0.0
    id_proyecto: str
    rubro: Optional[str] = None
    id_fuente: Optional[str] = None
    id_componente: Optional[str] = None
    id_subcomponente: Optional[str] = None
    id_categoria: Optional[str] = None
    id_responsable: Optional[str] = None

@router.get("/maestra/financiacion")
def get_maestra_financiacion(
    search: Optional[str] = None,
    user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ Obtiene todos los registros de BFinanciacion para la tabla maestra """
    require_role(user, ["admin"])
    try:
        where_clause = ""
        params = {}
        if search:
            where_clause = "WHERE f.cedula LIKE :s OR f.id_proyecto LIKE :s OR d.p_nombre LIKE :s OR d.p_apellido LIKE :s"
            params["s"] = f"%{search}%"

        query = text(f"""
            SELECT f.*, 
                   CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) as nombre_completo,
                   p.Cargo as cargo_posicion
            FROM BFinanciacion f
            LEFT JOIN BData d ON f.cedula = d.cedula
            LEFT JOIN BPosicion p ON f.posicion = p.IDPosicion
            {where_clause}
            ORDER BY f.fecha_modificacion DESC
            LIMIT 2000
        """)
        
        result = db.execute(query, params).mappings().all()
        return [dict(r) for r in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/maestra/financiacion/{id_financiacion}")
def update_maestra_financiacion(
    id_financiacion: str,
    item: MaestraFinanciacionItem,
    user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ Actualiza un registro de BFinanciacion directamente """
    require_role(user, ["admin"])
    audit_svc = AuditService(db)
    
    try:
        # 1. Obtener estado anterior para auditoria
        old_row = db.execute(text("SELECT * FROM BFinanciacion WHERE id_financiacion = :id"), {"id": id_financiacion}).mappings().first()
        if not old_row:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        # 2. Preparar actualización
        allowed_cols = [
            "cedula", "id_contrato", "posicion", "fecha_inicio", "fecha_fin",
            "salario_base", "salario_t", "id_proyecto", "rubro", "id_fuente",
            "id_componente", "id_subcomponente", "id_categoria", "id_responsable"
        ]
        
        set_clauses = []
        params = {"id_fin": id_financiacion, "user_mod": user['email']}
        
        item_dict = item.dict(exclude_unset=True)
        for col in allowed_cols:
            if col in item_dict:
                set_clauses.append(f"{col} = :{col}")
                params[col] = item_dict[col]

        set_clauses.append("fecha_modificacion = CONVERT_TZ(NOW(), '+00:00', '-05:00')")
        set_clauses.append("modifico = :user_mod")

        query = text(f"UPDATE BFinanciacion SET {', '.join(set_clauses)} WHERE id_financiacion = :id_fin")
        db.execute(query, params)
        db.commit()

        # 3. Auditoria
        audit_svc.log_event(
            user_email=user['email'],
            event_type="MAESTRA_UPDATE",
            table_name="BFinanciacion",
            record_id=id_financiacion,
            old_value=str(dict(old_row)),
            new_value=str(item_dict),
            description=f"Edición directa en Tabla Maestra por administrador"
        )

        return {"ok": True, "message": "Registro actualizado"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/maestra/financiacion/{id_financiacion}")
def delete_maestra_financiacion(
    id_financiacion: str,
    user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ Elimina un registro de BFinanciacion directamente """
    require_role(user, ["admin"])
    audit_svc = AuditService(db)
    
    try:
        old_row = db.execute(text("SELECT * FROM BFinanciacion WHERE id_financiacion = :id"), {"id": id_financiacion}).mappings().first()
        if not old_row:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        db.execute(text("DELETE FROM BFinanciacion WHERE id_financiacion = :id"), {"id": id_financiacion})
        db.commit()

        # Auditoria
        audit_svc.log_event(
            user_email=user['email'],
            event_type="MAESTRA_DELETE",
            table_name="BFinanciacion",
            record_id=id_financiacion,
            old_value=str(dict(old_row)),
            new_value=None,
            description=f"Eliminación directa en Tabla Maestra por administrador"
        )

        return {"ok": True, "message": "Registro eliminado"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/maestra/financiacion")
def create_maestra_financiacion(
    item: MaestraFinanciacionItem,
    user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ Crea un nuevo registro de BFinanciacion directamente """
    require_role(user, ["admin"])
    audit_svc = AuditService(db)
    
    try:
        # Generar ID
        q_max = text("SELECT MAX(CAST(SUBSTRING(id_financiacion, 7) AS UNSIGNED)) FROM BFinanciacion WHERE id_financiacion LIKE 'IHFIN_%'")
        max_val = db.execute(q_max).scalar()
        next_num = (int(max_val) + 1) if max_val is not None else 1
        new_id = f"IHFIN_{next_num:05d}"

        allowed_cols = [
            "cedula", "id_contrato", "posicion", "fecha_inicio", "fecha_fin",
            "salario_base", "salario_t", "id_proyecto", "rubro", "id_fuente",
            "id_componente", "id_subcomponente", "id_categoria", "id_responsable"
        ]
        
        cols = ["id_financiacion", "fecha_modificacion", "modifico"]
        vals = [":id_new", "CONVERT_TZ(NOW(), '+00:00', '-05:00')", ":user_mod"]
        params = {"id_new": new_id, "user_mod": user['email']}
        
        item_dict = item.dict(exclude_unset=True)
        for col in allowed_cols:
            if col in item_dict:
                cols.append(col)
                vals.append(f":{col}")
                params[col] = item_dict[col]

        query = text(f"INSERT INTO BFinanciacion ({', '.join(cols)}) VALUES ({', '.join(vals)})")
        db.execute(query, params)
        db.commit()

        # Auditoria
        audit_svc.log_event(
            user_email=user['email'],
            event_type="MAESTRA_CREATE",
            table_name="BFinanciacion",
            record_id=new_id,
            old_value=None,
            new_value=str(item_dict),
            description=f"Creación directa en Tabla Maestra por administrador"
        )

        return {"ok": True, "id": new_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
