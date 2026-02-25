from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.security import get_current_user, require_role
from app.core.database import get_db, engine
from app.services.audit_service import AuditService
from pydantic import BaseModel

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
    justificacion: Optional[str] = None

# ──────────────────────────────────────────────────────────────
# GET  /maestra/financiacion
# ──────────────────────────────────────────────────────────────
@router.get("/maestra/financiacion")
def get_maestra_financiacion(
    search: Optional[str] = None,
    user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtiene todos los registros de BFinanciacion para la tabla maestra. Solo admin."""
    require_role(user, ["admin"])
    try:
        # BUG FIX: Always use parameterized queries — never f-string a WHERE clause
        if search:
            query = text("""
                SELECT f.*,
                       CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) as nombre_completo,
                       p.Cargo as cargo_posicion
                FROM BFinanciacion f
                LEFT JOIN BData d ON f.cedula = d.cedula
                LEFT JOIN BPosicion p ON f.posicion = p.IDPosicion
                WHERE f.cedula LIKE :s OR f.id_proyecto LIKE :s
                   OR d.p_nombre LIKE :s OR d.p_apellido LIKE :s
                ORDER BY f.fecha_modificacion DESC
                LIMIT 2000
            """)
            params = {"s": f"%{search}%"}
        else:
            query = text("""
                SELECT f.*,
                       CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) as nombre_completo,
                       p.Cargo as cargo_posicion
                FROM BFinanciacion f
                LEFT JOIN BData d ON f.cedula = d.cedula
                LEFT JOIN BPosicion p ON f.posicion = p.IDPosicion
                ORDER BY f.fecha_modificacion DESC
                LIMIT 2000
            """)
            params = {}

        result = db.execute(query, params).mappings().all()
        return [dict(r) for r in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────
# PUT  /maestra/financiacion/{id_financiacion}
# ──────────────────────────────────────────────────────────────
@router.put("/maestra/financiacion/{id_financiacion}")
def update_maestra_financiacion(
    id_financiacion: str,
    item: MaestraFinanciacionItem,
    user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Actualiza un registro de BFinanciacion directamente. Solo admin."""
    require_role(user, ["admin"])
    audit_svc = AuditService(db)

    try:
        # 1. Leer estado anterior
        old_row = db.execute(
            text("SELECT * FROM BFinanciacion WHERE id_financiacion = :id"),
            {"id": id_financiacion}
        ).mappings().first()
        if not old_row:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        # 2. Preparar UPDATE con whitelist de columnas
        allowed_cols = [
            "cedula", "id_contrato", "posicion", "fecha_inicio", "fecha_fin",
            "salario_base", "salario_t", "id_proyecto", "rubro", "id_fuente",
            "id_componente", "id_subcomponente", "id_categoria", "id_responsable",
            "justificacion"
        ]

        set_clauses = []
        params = {"id_fin": id_financiacion, "user_mod": user["email"]}

        item_dict = item.dict(exclude_unset=True)
        for col in allowed_cols:
            if col in item_dict:
                set_clauses.append(f"{col} = :{col}")
                params[col] = item_dict[col]

        if not set_clauses:
            raise HTTPException(status_code=400, detail="No hay campos válidos para actualizar")

        set_clauses.append("fecha_modificacion = CONVERT_TZ(NOW(), '+00:00', '-05:00')")
        set_clauses.append("modifico = :user_mod")

        db.execute(
            text(f"UPDATE BFinanciacion SET {', '.join(set_clauses)} WHERE id_financiacion = :id_fin"),
            params
        )
        db.commit()

        # 3. Auditoría con firma correcta del servicio
        audit_svc.log_event(
            actor_email=user["email"],
            module="TablaMaestra",
            action="UPDATE",
            resource_id=id_financiacion,
            old_values=dict(old_row),
            new_values=item_dict,
            details=f"Edición directa en Tabla Maestra. Justificación: {item_dict.get('justificacion', 'N/A')}"
        )

        return {"ok": True, "message": "Registro actualizado"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────
# DELETE  /maestra/financiacion/{id_financiacion}
# ──────────────────────────────────────────────────────────────
@router.delete("/maestra/financiacion/{id_financiacion}")
def delete_maestra_financiacion(
    id_financiacion: str,
    user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Elimina un registro de BFinanciacion directamente. Solo admin."""
    require_role(user, ["admin"])
    audit_svc = AuditService(db)

    try:
        old_row = db.execute(
            text("SELECT * FROM BFinanciacion WHERE id_financiacion = :id"),
            {"id": id_financiacion}
        ).mappings().first()
        if not old_row:
            raise HTTPException(status_code=404, detail="Registro no encontrado")

        db.execute(
            text("DELETE FROM BFinanciacion WHERE id_financiacion = :id"),
            {"id": id_financiacion}
        )
        db.commit()

        audit_svc.log_event(
            actor_email=user["email"],
            module="TablaMaestra",
            action="DELETE",
            resource_id=id_financiacion,
            old_values=dict(old_row),
            new_values=None,
            details="Eliminación directa en Tabla Maestra por administrador"
        )

        return {"ok": True, "message": "Registro eliminado"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────
# POST  /maestra/financiacion
# ──────────────────────────────────────────────────────────────
@router.post("/maestra/financiacion")
def create_maestra_financiacion(
    item: MaestraFinanciacionItem,
    user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Crea un nuevo registro de BFinanciacion directamente. Solo admin."""
    require_role(user, ["admin"])
    audit_svc = AuditService(db)

    try:
        # Generar siguiente ID correlativo — use FOR UPDATE to avoid race conditions
        q_max = text(
            "SELECT MAX(CAST(SUBSTRING(id_financiacion, 7) AS UNSIGNED)) "
            "FROM BFinanciacion WHERE id_financiacion LIKE 'IHFIN_%' FOR UPDATE"
        )
        max_val = db.execute(q_max).scalar()
        next_num = (int(max_val) + 1) if max_val is not None else 1
        new_id = f"IHFIN_{next_num:05d}"

        allowed_cols = [
            "cedula", "id_contrato", "posicion", "fecha_inicio", "fecha_fin",
            "salario_base", "salario_t", "id_proyecto", "rubro", "id_fuente",
            "id_componente", "id_subcomponente", "id_categoria", "id_responsable",
            "justificacion"  # BUG FIX: was missing from CREATE, present in UPDATE
        ]

        cols = ["id_financiacion", "fecha_modificacion", "modifico"]
        vals = [":id_new", "CONVERT_TZ(NOW(), '+00:00', '-05:00')", ":user_mod"]
        params = {"id_new": new_id, "user_mod": user["email"]}

        item_dict = item.dict(exclude_unset=True)
        for col in allowed_cols:
            if col in item_dict:
                cols.append(col)
                vals.append(f":{col}")
                params[col] = item_dict[col]

        db.execute(
            text(f"INSERT INTO BFinanciacion ({', '.join(cols)}) VALUES ({', '.join(vals)})"),
            params
        )
        db.commit()

        audit_svc.log_event(
            actor_email=user["email"],
            module="TablaMaestra",
            action="CREATE",
            resource_id=new_id,
            old_values=None,
            new_values=item_dict,
            details="Creación directa en Tabla Maestra por administrador"
        )

        return {"ok": True, "id": new_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────
# GET  /maestra/catalogos-nombres
# ──────────────────────────────────────────────────────────────
@router.get("/maestra/catalogos-nombres")
def get_catalogos_nombres(
    user: Any = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Obtiene diccionarios de códigos a nombres para todos los catálogos financieros.
    Solo admin. Usa la sesión db existente para eficiencia.
    """
    require_role(user, ["admin"])
    try:
        def safe_fetch(query_str: str) -> dict:
            """Ejecuta una query y devuelve dict {codigo: nombre}. Silencia errores si la tabla no existe."""
            try:
                rows = db.execute(text(query_str)).fetchall()
                return {r[0]: r[1] for r in rows if r[0]}
            except Exception:
                return {}

        catalogos = {
            "id_proyecto":      safe_fetch("SELECT codigo, nombre FROM dim_proyectos UNION SELECT codigo, nombre FROM dim_proyectos_otros"),
            "id_fuente":        safe_fetch("SELECT codigo, nombre FROM dim_fuentes"),
            "id_componente":    safe_fetch("SELECT codigo, nombre FROM dim_componentes"),
            "id_subcomponente": safe_fetch("SELECT codigo, nombre FROM dim_subcomponentes"),
            "id_categoria":     safe_fetch("SELECT codigo, nombre FROM dim_categorias"),
            "id_responsable":   safe_fetch("SELECT codigo, nombre FROM dim_responsables"),
        }

        return {"ok": True, "catalogos": catalogos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
