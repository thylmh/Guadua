from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.core.constants import PAGO_EXPR
from pydantic import BaseModel
import datetime
import json
from app.services.audit_service import AuditService
from app.services.payroll_service_optimized import mensualizar_base_30_optimized as mensualizar_base_30, calculate_yearly_projections
from app.core.utils import to_date

router = APIRouter()

# --- SCHEMAS ---
class SnapshotCreate(BaseModel):
    nombre_version: str
    descripcion: Optional[str] = None

class SolicitudCreate(BaseModel):
    id_financiacion: str
    cedula: Optional[str] = None
    tipo_solicitud: str = "MODIFICACION" # MODIFICACION, CREACION, ELIMINACION
    campo: str # Ej: valor_mensual
    valor_nuevo: Any
    justificacion: str

class SnapshotResponse(BaseModel):
    version_id: int
    tramos_copiados: int
    mensaje: str

class SolicitudCambioBase(BaseModel):
    tipo_solicitud: str # 'MODIFICAR', 'CREAR', 'ELIMINAR'
    cedula: str
    id_financiacion_afectado: Optional[str] = None
    justificacion: str
    datos_nuevos: str # JSON String

# --- ENDPOINTS ---

@router.post("/congelar", response_model=SnapshotResponse)
def crear_snapshot(
    snapshot_in: SnapshotCreate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user), # Admin Only ideally
):
    """
    Toma una fotografía inmutable de BFinanciacion.
    Esta operación puede tardar unos segundos dependiendo del volumen de datos.
    """
    # 1. Crear el registro de la versión
    try:
        # Insert Version
        result = db.execute(text("""
            INSERT INTO Presupuesto_Versiones (nombre_version, descripcion, creado_por, fecha_creacion, bloqueada)
            VALUES (:nom, :desc, :user, NOW(), 1)
        """), {
            "nom": snapshot_in.nombre_version,
            "desc": snapshot_in.descripcion,
            "user": getattr(current_user, "email", "admin")
        })
        db.commit()
        
        # Get the new ID (MySQL Way)
        # Using separate query to be safe across drivers or relying on result.lastrowid
        # SQLAlchemy returns result.lastrowid for simple inserts usually
        version_id = result.lastrowid
        if not version_id:
             # Fallback explicit fetch
             version_id = db.execute(text("SELECT MAX(id) FROM Presupuesto_Versiones")).scalar()

        # 2. Copia Masiva (Bulk Insert)
        # Mapeamos columnas de BFinanciacion a Snapshot
        # Asumimos que BFinanciacion tiene columnas compatibles.
        # Ajustaremos la query según el esquema real que inferimos.
        
        query_snapshot = text(f"""
            INSERT INTO BFinanciacion_Snapshot (
                version_id,
                original_id_financiacion,
                cedula,
                id_proyecto,
                id_contrato,
                cod_proyecto,
                cod_fuente,
                cod_componente,
                cod_subcomponente,
                cod_rubro,
                cod_categoria,
                cod_responsable,
                posicion,
                valor_mensual,
                salario_t,
                pago_proyectado,
                fecha_inicio,
                fecha_fin
            )
            SELECT 
                :ver_id,
                BF.id_financiacion,
                BF.cedula,
                BF.id_proyecto,
                BF.id_contrato,
                BF.id_proyecto, -- Usamos ID como Codigo por ahora
                BF.id_fuente,
                BF.id_componente,
                BF.id_subcomponente,
                BF.rubro,
                BF.id_categoria,
                BF.id_responsable,
                BF.posicion,
                BF.salario_base,
                BF.salario_t,
                BF.pago_proyectado,
                BF.fecha_inicio,
                BF.fecha_fin
            FROM BFinanciacion BF
        """)
        
        result_copy = db.execute(query_snapshot, {"ver_id": version_id})
        rows_copied = result_copy.rowcount
        db.commit()

        # 3. Log Audit
        # Reusing BAuditoria if exists, or just log to print for now in MVP
        # db.execute("INSERT INTO BAuditoria ...") 

        return {
            "version_id": version_id,
            "tramos_copiados": rows_copied,
            "mensaje": f"Snapshot '{snapshot_in.nombre_version}' creado exitosamente con {rows_copied} registros."
        }

    except Exception as e:
        db.rollback()
        print(f"Error creating snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/versiones/{version_id}")
def eliminar_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user), # Admin Only
):
    """ Elimina una versión y todos sus datos históricos asociados """
    try:
        # 1. Borrar detalle (Snapshot data)
        db.execute(text("DELETE FROM BFinanciacion_Snapshot WHERE version_id = :vid"), {"vid": version_id})
        
        # 2. Borrar cabecera
        result = db.execute(text("DELETE FROM Presupuesto_Versiones WHERE id = :vid"), {"vid": version_id})
        db.commit()
        
        if result.rowcount == 0:
             raise HTTPException(status_code=404, detail="Versión no encontrada")
             
        return {"message": "Versión eliminada correctamente"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/comparar/{version_id}")
def comparar_presupuesto(version_id: int, anio: Optional[int] = None, db: Session = Depends(get_db)):
    """ 
    Compara una versión congelada vs el estado actual de BFinanciacion
    Calcula desviaciones y KPIs de impacto.
    """
    try:
        target_year = anio if anio else datetime.datetime.now().year
        
        # 1. Fetch Necessaries (Increments & Metadata)
        incs_rows = db.execute(text("SELECT * FROM BIncremento")).mappings().all()
        incrementos = {int(r["anio"]): dict(r) for r in incs_rows}
        
        proy_names = {r["codigo"]: r["nombre"] for r in db.execute(text("SELECT codigo, nombre FROM dim_proyectos UNION SELECT codigo, nombre FROM dim_proyectos_otros")).mappings().all()}

        # 2. Obtener datos de la Foto (Join con contrato para ATEP/Gerencia necesario en calculo)
        # Nota: Usamos datos de contrato actuales ya que no se guardaron en el snapshot original.
        q_snap = text("""
            SELECT s.*, c.atep, c.gerencia, c.estado, c.fecha_terminacion_real,
                   p.cargo, p.banda, p.familia, p.IDPosicion AS posicion_c,
                   p.Direccion, p.Planta,
                   CONCAT_WS(' ', d.p_nombre, d.p_apellido) as nombre_completo,
                   1 AS is_snapshot
            FROM BFinanciacion_Snapshot s
            LEFT JOIN BContrato c ON s.id_contrato = c.id_contrato
            LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
            LEFT JOIN BData d ON s.cedula = d.cedula
            WHERE s.version_id = :vid
              AND s.fecha_inicio <= :y_end AND s.fecha_fin >= :y_start
        """)
        snap_rows = db.execute(q_snap, {
            "vid": version_id, 
            "y_start": f"{target_year}-01-01", 
            "y_end": f"{target_year}-12-31"
        }).mappings().all()

        # 3. Obtener datos Actuales
        q_live = text("""
            SELECT f.*, c.atep, c.gerencia, c.estado, c.fecha_terminacion_real,
                   p.cargo, p.banda, p.familia, p.IDPosicion AS posicion_c,
                   p.Direccion, p.Planta,
                   CONCAT_WS(' ', d.p_nombre, d.p_apellido) as nombre_completo
            FROM BFinanciacion f
            JOIN BContrato c ON f.id_contrato = c.id_contrato
            LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
            LEFT JOIN BData d ON f.cedula = d.cedula
            WHERE f.fecha_inicio <= :y_end AND f.fecha_fin >= :y_start
        """)
        live_rows = db.execute(q_live, {
            "y_start": f"{target_year}-01-01", 
            "y_end": f"{target_year}-12-31"
        }).mappings().all()

        # 5. Calculate both sides using the Unified Projection Engine
        snap_proj_full = calculate_yearly_projections(snap_rows, incrementos, target_year)
        live_proj_full = calculate_yearly_projections(live_rows, incrementos, target_year)
        
        # Extract results for comparison logic
        snap_total = snap_proj_full["total"]
        snap_head = snap_proj_full["headcount"]
        # Map matrix list to internal dict for merge
        snap_proj = { p["codigo"]: {"total": p["total"], "headcount": p["headcount"]} for p in snap_proj_full["matrix_proyectos"] }

        live_total = live_proj_full["total"]
        live_head = live_proj_full["headcount"]
        live_proj = { p["codigo"]: {"total": p["total"], "headcount": p["headcount"]} for p in live_proj_full["matrix_proyectos"] }

        # 6. Merge into comparison
        proyectos = {}
        # Union of project IDs
        all_pids = set(snap_proj.keys()) | set(live_proj.keys())
        for pid in all_pids:
            s = snap_proj.get(pid, {"total": 0.0, "headcount": 0})
            l = live_proj.get(pid, {"total": 0.0, "headcount": 0})
            pnombre = proy_names.get(pid, pid).strip()
            
            proyectos[pid] = {
                "proyecto": pnombre,
                "codigo": pid,
                "base": s["total"],
                "actual": l["total"],
                "diff": l["total"] - s["total"],
                "head_base": s["headcount"],
                "head_live": l["headcount"]
            }

        # 7. Analysis of discrete changes (Tramos added/removed)
        q_nuevos = text("""
            SELECT COUNT(*) FROM BFinanciacion 
            WHERE id_financiacion NOT IN (SELECT original_id_financiacion FROM BFinanciacion_Snapshot WHERE version_id = :vid)
              AND fecha_inicio <= :y_end AND fecha_fin >= :y_start
        """)
        nuevos_count = db.execute(q_nuevos, {"vid": version_id, "y_start": f"{target_year}-01-01", "y_end": f"{target_year}-12-31"}).scalar()

        q_removidos = text("""
            SELECT COUNT(*) FROM BFinanciacion_Snapshot 
            WHERE version_id = :vid AND original_id_financiacion NOT IN (SELECT id_financiacion FROM BFinanciacion)
              AND fecha_inicio <= :y_end AND fecha_fin >= :y_start
        """)
        removidos_count = db.execute(q_removidos, {"vid": version_id, "y_start": f"{target_year}-01-01", "y_end": f"{target_year}-12-31"}).scalar()

        return {
            "version_id": version_id,
            "anio": target_year,
            "kpis": {
                "total_base": snap_total,
                "total_actual": live_total,
                "variacion_neta": live_total - snap_total,
                "porcentaje_variacion": ( (live_total / snap_total) - 1 ) * 100 if snap_total > 0 else 0,
                "headcount_base": snap_head,
                "headcount_actual": live_head,
                "tramos_nuevos": nuevos_count,
                "tramos_eliminados": removidos_count
            },
            "proyectos": sorted(proyectos.values(), key=lambda x: x["actual"], reverse=True),
            "detalle_cambios": {
                "nuevos": [dict(r) for r in db.execute(text(f"""
                    SELECT b.id_financiacion, b.cedula, COALESCE(dp.nombre, dpo.nombre, b.id_proyecto) as id_proyecto, b.salario_t, 
                           CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) as nombre
                    FROM BFinanciacion b
                    JOIN BData d ON b.cedula = d.cedula
                    LEFT JOIN dim_proyectos dp ON b.id_proyecto = dp.codigo
                    LEFT JOIN dim_proyectos_otros dpo ON b.id_proyecto = dpo.codigo
                    WHERE b.id_financiacion NOT IN (SELECT original_id_financiacion FROM BFinanciacion_Snapshot WHERE version_id = :vid)
                      AND b.fecha_inicio <= :y_end AND b.fecha_fin >= :y_start
                """), {"vid": version_id, "y_start": f"{target_year}-01-01", "y_end": f"{target_year}-12-31"}).mappings().all()],
                "eliminados": [dict(r) for r in db.execute(text(f"""
                    SELECT s.original_id_financiacion as id_financiacion, s.cedula, COALESCE(dp.nombre, dpo.nombre, s.id_proyecto) as id_proyecto, s.salario_t,
                           CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) as nombre
                    FROM BFinanciacion_Snapshot s
                    LEFT JOIN BData d ON s.cedula = d.cedula
                    LEFT JOIN dim_proyectos dp ON s.id_proyecto = dp.codigo
                    LEFT JOIN dim_proyectos_otros dpo ON s.id_proyecto = dpo.codigo
                    WHERE s.version_id = :vid AND s.original_id_financiacion NOT IN (SELECT id_financiacion FROM BFinanciacion)
                      AND s.fecha_inicio <= :y_end AND s.fecha_fin >= :y_start
                """), {"vid": version_id, "y_start": f"{target_year}-01-01", "y_end": f"{target_year}-12-31"}).mappings().all()],
                "modificados": [dict(r) for r in db.execute(text(f"""
                    SELECT b.id_financiacion, b.cedula, COALESCE(dp.nombre, dpo.nombre, b.id_proyecto) as id_proyecto, 
                           b.salario_t as valor_actual, s.salario_t as valor_base,
                           (b.salario_t - s.salario_t) as diff,
                           CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) as nombre
                    FROM BFinanciacion b
                    JOIN BFinanciacion_Snapshot s ON b.id_financiacion = s.original_id_financiacion
                    JOIN BData d ON b.cedula = d.cedula
                    LEFT JOIN dim_proyectos dp ON b.id_proyecto = dp.codigo
                    LEFT JOIN dim_proyectos_otros dpo ON b.id_proyecto = dpo.codigo
                    WHERE s.version_id = :vid AND ABS(b.salario_t - s.salario_t) > 1
                      AND b.fecha_inicio <= :y_end AND b.fecha_fin >= :y_start
                """), {"vid": version_id, "y_start": f"{target_year}-01-01", "y_end": f"{target_year}-12-31"}).mappings().all()]
            }
        }
    except Exception as e:
        print(f"Error en comparativa: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/versiones", response_model=List[dict])
def listar_versiones(db: Session = Depends(get_db)):
    """ Listar historial de fotos tomadas """
    res = db.execute(text("SELECT id, nombre_version, fecha_creacion, descripcion FROM Presupuesto_Versiones ORDER BY id DESC")).fetchall()
    return [{"id": r[0], "nombre": r[1], "fecha": r[2], "desc": r[3]} for r in res]

@router.post("/solicitudes")
def crear_solicitud(
    sol: SolicitudCreate,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_user)
):
    """ Registra una solicitud de cambio para aprobación """
    try:
        # 1. Validar existencia y obtener valor actual
        # Sanitización MUY básica para el nombre del campo, idealmente validar contra una lista blanca
        allowed_fields = ['valor_mensual', 'fecha_inicio', 'fecha_fin', 'id_proyecto', 'id_contrato', 'rubro', 'posicion']
        if sol.campo not in allowed_fields:
             raise HTTPException(status_code=400, detail=f"Campo '{sol.campo}' no permitido para edición")

        query_check = text(f"SELECT {sol.campo} FROM BFinanciacion WHERE id_financiacion = :fid")
        current_val_row = db.execute(query_check, {"fid": sol.id_financiacion}).fetchone()

        if not current_val_row:
            raise HTTPException(status_code=404, detail="Financiación no encontrada")
            
        current_val = current_val_row[0]
        
        # 2. Preparar Payloads
        old_data = {sol.campo: str(current_val) if current_val is not None else ""}
        new_data = {sol.campo: str(sol.valor_nuevo)}

        # 3. Insertar Solicitud
        stmt = text("""
            INSERT INTO BSolicitud_Cambio (
                tipo_solicitud, id_financiacion_afectado, cedula, 
                datos_anteriores, datos_nuevos, justificacion, solicitante, fecha_solicitud, estado, aprobador
            ) VALUES (
                :tipo, :id_afec, :ced,
                :old, :new, :just,
                :user, CONVERT_TZ(NOW(), '+00:00', '-05:00'), 'PENDIENTE', NULL
            )
        """)
        
        db.execute(stmt, {
            "tipo": sol.tipo_solicitud,
            "id_afec": sol.id_financiacion,
            "ced": sol.cedula or 'N/A',
            "old": json.dumps(old_data),
            "new": json.dumps(new_data),
            "just": sol.justificacion,
            "user": getattr(current_user, 'email', 'unknown')
        })
        db.commit()
        
        return {"status": "ok", "message": "Solicitud enviada a aprobación"}

    except Exception as e:
        db.rollback()
        print(f"Error creating request: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/solicitudes")
def listar_solicitudes(db: Session = Depends(get_db)):
    """ Listar solicitudes de cambio pendientes """
    stmt = text("""
        SELECT id, tipo_solicitud, id_financiacion_afectado, cedula, 
               datos_anteriores, datos_nuevos, justificacion, estado, 
               fecha_solicitud, solicitante 
        FROM BSolicitud_Cambio 
        ORDER BY fecha_solicitud ASC
    """)
    res = db.execute(stmt).fetchall()
    return [
        {
            "id": r[0], 
            "tipo_solicitud": r[1], 
            "id_financiacion_afectado": r[2],
            "cedula": r[3],
            "datos_anteriores": r[4], 
            "datos_nuevos": r[5],
            "justificacion": r[6], 
            "estado": r[7], 
            "fecha_solicitud": r[8].isoformat() if r[8] else None,
            "solicitante": r[9]
        } 
        for r in res
    ]

@router.post("/solicitudes/{req_id}/aprobar")
def aprobar_solicitud(req_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """ Aprueba una solicitud y aplica los cambios a BFinanciacion """
    require_role(user, ["admin"])
    try:
        with db.bind.begin() as conn:
            # 1. Obtener Solicitud
            q_req = text("SELECT * FROM BSolicitud_Cambio WHERE id = :id FOR UPDATE")
            req = conn.execute(q_req, {"id": req_id}).mappings().first()
            
            if not req:
                raise HTTPException(status_code=404, detail="Solicitud no encontrada")
            if req['estado'] != 'PENDIENTE':
                raise HTTPException(status_code=400, detail=f"La solicitud está en estado {req['estado']}")

            datos_nuevos = json.loads(req['datos_nuevos']) if req['datos_nuevos'] else {}
            tipo = req['tipo_solicitud']
            
            # 2. Aplicar Cambio
            if tipo == 'ELIMINACION':
                # DELETE
                sql_apply = text("DELETE FROM BFinanciacion WHERE id_financiacion = :id")
                conn.execute(sql_apply, {"id": req['id_financiacion_afectado']})
                
            elif tipo == 'MODIFICACION':
                # UPDATE
                # Construir Query Dinámica
                set_clauses = []
                params = {"id_financiacion": req['id_financiacion_afectado']}
                
                # Campos permitidos para update (evitar inyeccion o errores)
                allowed_cols = [
                    "fecha_inicio", "fecha_fin", "salario_base", "salario_t", 
                    "id_proyecto", "rubro", "id_fuente", "id_componente", 
                    "id_subcomponente", "id_categoria", "id_responsable", 
                    "modifico", "id_contrato", "posicion"
                ]
                
                for k, v in datos_nuevos.items():
                    if k in allowed_cols:
                        set_clauses.append(f"{k} = :{k}")
                        params[k] = v
                
                # Agregar campos automaticos
                set_clauses.append(f"pago_proyectado = {PAGO_EXPR.replace('f.', '')}")
                set_clauses.append("fecha_modificacion = CONVERT_TZ(NOW(), '+00:00', '-05:00')")
                set_clauses.append("modifico = :user_mod")
                params["user_mod"] = user['email']

                sql_apply = text(f"UPDATE BFinanciacion SET {', '.join(set_clauses)} WHERE id_financiacion = :id_financiacion")
                conn.execute(sql_apply, params)

            elif tipo == 'CREACION':
                # INSERT
                try:
                    q_max = text("SELECT MAX(CAST(SUBSTRING(id_financiacion, 7) AS UNSIGNED)) FROM BFinanciacion WHERE id_financiacion LIKE 'IHFIN_%'")
                    max_val = conn.execute(q_max).scalar()
                    next_num = (int(max_val) + 1) if max_val is not None else 1
                except:
                    next_num = 1
                new_id = f"IHFIN_{next_num:05d}"
                
                # Campos
                cols = ["id_financiacion", "cedula", "pago_proyectado", "fecha_modificacion", "modifico"]
                vals = [":id_new", ":cedula", PAGO_EXPR.replace('f.', ''), "CONVERT_TZ(NOW(), '+00:00', '-05:00')", ":user_mod"]
                
                params = {
                    "id_new": new_id,
                    "cedula": datos_nuevos.get('cedula'),
                    "user_mod": user['email']
                }
                
                allowed_cols = [
                    "fecha_inicio", "fecha_fin", "salario_base", "salario_t", 
                    "id_proyecto", "rubro", "id_fuente", "id_componente", 
                    "id_subcomponente", "id_categoria", "id_responsable", 
                    "id_contrato", "posicion"
                ]

                # Mapear del JSON
                for k, v in datos_nuevos.items():
                    if k in allowed_cols:
                        cols.append(k)
                        vals.append(f":{k}")
                        params[k] = v
                
                sql_apply = text(f"INSERT INTO BFinanciacion ({', '.join(cols)}) VALUES ({', '.join(vals)})")
                conn.execute(sql_apply, params)
                
                # Actualizar el ID afectado en la solicitud (ahora ya no es NUEVO, es el real)
                conn.execute(text("UPDATE BSolicitud_Cambio SET id_financiacion_afectado = :real_id WHERE id = :rid"), {"real_id": new_id, "rid": req_id})

            # 3. Actualizar Estado Solicitud
            conn.execute(text("UPDATE BSolicitud_Cambio SET estado = 'APROBADO', aprobador = :ap, fecha_aprobacion = CONVERT_TZ(NOW(), '+00:00', '-05:00') WHERE id = :rid"), 
                         {"ap": user['email'], "rid": req_id})
            
            # 5. Notificar al solicitante
            conn.execute(text("""
                INSERT INTO BNotificaciones (usuario_email, mensaje, solicitud_id, tipo)
                VALUES (:email, :msg, :rid, 'SUCCESS')
            """), {
                "email": req['solicitante'],
                "msg": f"Tu solicitud de {tipo} para la cédula {req.get('cedula')} ha sido APROBADA.",
                "rid": req_id
            })

        return {"ok": True, "message": "Cambios aplicados exitosamente"}

    except Exception as e:
        print(f"Error approval: {e}")
        raise HTTPException(status_code=500, detail=f"Error al aprobar: {str(e)}")

@router.post("/solicitudes/{req_id}/rechazar")
def rechazar_solicitud(req_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """ Rechaza una solicitud """
    require_role(user, ["admin"])
    try:
        with db.bind.begin() as conn:
            # Obtener datos para la notificación
            req = conn.execute(text("SELECT solicitante, tipo_solicitud, cedula FROM BSolicitud_Cambio WHERE id = :id"), {"id": req_id}).mappings().first()
            
            conn.execute(text("UPDATE BSolicitud_Cambio SET estado = 'RECHAZADO', aprobador = :ap, fecha_aprobacion = CONVERT_TZ(NOW(), '+00:00', '-05:00') WHERE id = :rid"),
                         {"ap": user['email'], "rid": req_id})
            
            if req:
                conn.execute(text("""
                    INSERT INTO BNotificaciones (usuario_email, mensaje, solicitud_id, tipo)
                    VALUES (:email, :msg, :rid, 'ERROR')
                """), {
                    "email": req['solicitante'],
                    "msg": f"Tu solicitud de {req['tipo_solicitud']} para la cédula {req['cedula']} ha sido RECHAZADA.",
                    "rid": req_id
                })
        return {"ok": True, "message": "Solicitud rechazada"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/solicitudes/limpiar/todo")
def limpiar_solicitudes(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """ (Solo Admin) Limpia todas las solicitudes de la tabla """
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="No autorizado")
    
    try:
        with db.bind.begin() as conn:
            conn.execute(text("TRUNCATE TABLE BSolicitud_Cambio"))
        return {"ok": True, "message": "Historial de solicitudes limpiado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
