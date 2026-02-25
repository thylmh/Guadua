from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user
from app.core.database import engine
from sqlalchemy import text
from app.models.schemas import TramoFinanciacion
from app.services.payroll_service_optimized import mensualizar_base_30_optimized as mensualizar_base_30
from app.core.mock_data import MOCK_VACANTES, MOCK_INCREMENTOS, MOCK_FINANCIACION_VACANTES
import uuid

router = APIRouter()

@router.get("/dashboard")
def get_vacantes_dashboard(user: Dict[str, Any] = Depends(get_current_user)):
    """
    Calcula el costo proyectado de las vacantes.
    Intenta leer de la DB, si falla usa Mock Data.
    """
    try:
        # 1. Intentar obtener incrementos reales
        with engine.connect() as conn:
            incs_rows = conn.execute(text("SELECT * FROM BIncremento")).mappings().all()
            incrementos = {int(r["anio"]): dict(r) for r in incs_rows}
            if not incrementos:
                incrementos = MOCK_INCREMENTOS
        
        # 2. Intentar obtener posiciones vacantes reales
        # Una posición es vacante si no tiene un contrato activo asociado
        q_vacantes = text("""
            SELECT p.IDPosicion as id_financiacion, p.Cargo as cargo, p.Banda as banda, p.Familia as familia, 
                   p.Direccion, p.Planta, p.Salario as salario_base, p.P_Jefe, 
                   '2026-01-01' as fecha_inicio, '2026-12-31' as fecha_fin,
                   'VACANTE' as cedula, 'VACANTE' as id_contrato,
                   0.00522 as atep, 'VACANTE' as id_proyecto,
                   p.IDPosicion as posicion_c
            FROM BPosicion p
            LEFT JOIN BContrato c ON p.IDPosicion = c.posicion AND UPPER(c.estado) LIKE 'ACTIVO%'
            WHERE c.id_contrato IS NULL AND UPPER(p.Estado) = 'VACANTE'
        """)
        
        tramos = []
        try:
            with engine.connect() as conn:
                tramos_rows = conn.execute(q_vacantes).mappings().all()
                tramos = [dict(r) for r in tramos_rows]
                # Convert values to float for payroll service
                for t in tramos:
                    if t.get("salario_base") is not None: t["salario_base"] = float(t["salario_base"])
                    if t.get("atep") is not None: t["atep"] = float(t["atep"])
        except Exception:
            tramos = []
            for v in MOCK_VACANTES:
                tramos.append({
                    "id_financiacion": v["id_posicion"],
                    "cedula": "VACANTE",
                    "nombre_completo": f"VANCE: {v['cargo']}",
                    "salario_base": v["salario_presupuestado"],
                    "fecha_inicio": v["fecha_inicio_estimada"],
                    "fecha_fin": v["fecha_fin_estimada"],
                    "id_contrato": "VAC-" + v["id_posicion"],
                    "id_proyecto": v["proyecto"],
                    "atep": v["atep"],
                    "cargo": v["cargo"],
                    "banda": v["banda"],
                    "familia": v["familia"],
                    "Direccion": v["direccion"],
                    "Planta": v["planta"],
                    "posicion_c": v["id_posicion"]
                })

        if not tramos:
            return {"ok": True, "resumen": {"total_vacantes": 0, "costo_total": 0}, "detalle": []}

        # 3. Calcular mensualización
        mensualizado = mensualizar_base_30(tramos, incrementos)
        
        # 4. Consolidar resultados
        costo_total = sum(m["total"] for m in mensualizado)
        
        return {
            "ok": True,
            "resumen": {
                "total_vacantes": len(tramos),
                "costo_total": costo_total,
                "anio": datetime.now().year
            },
            "distribucion_mensual": [{"mes": m["anioMes"], "total": m["total"]} for m in mensualizado],
            "detalle": mensualizado
        }

    except Exception as e:
        return {"ok": False, "error": str(e)}

@router.get("/consulta/{id_posicion}")
def get_individual_vacante(id_posicion: str, user: Dict[str, Any] = Depends(get_current_user)):
    """
    Obtiene el detalle de una vacante y su financiación proyectada.
    """
    try:
        # 1. Buscar cabecera de la posición
        with engine.connect() as conn:
            q_pos = text("SELECT * FROM BPosicion WHERE IDPosicion = :id")
            pos_row = conn.execute(q_pos, {"id": id_posicion}).mappings().first()
            pos = dict(pos_row) if pos_row else None
            
            incs_rows = conn.execute(text("SELECT * FROM BIncremento")).mappings().all()
            incrementos = {int(r["anio"]): dict(r) for r in incs_rows}
        
        # Fallback Mock if no DB or not found
        if not pos:
            mock_v = next((v for v in MOCK_VACANTES if v["id_posicion"] == id_posicion), None)
            if not mock_v:
                raise HTTPException(status_code=404, detail="Posición no encontrada")
            
            pos = {
                "IDPosicion": mock_v["id_posicion"],
                "Cargo": mock_v["cargo"],
                "Banda": mock_v["banda"],
                "Familia": mock_v["familia"],
                "Direccion": mock_v["direccion"],
                "Planta": mock_v["planta"],
                "Salario": mock_v["salario_presupuestado"],
                "atep": mock_v["atep"],
                "P_Jefe": mock_v.get("p_jefe")
            }
            if not incrementos:
                incrementos = MOCK_INCREMENTOS

        # 2. Buscar tramos de financiación
        tramos = []
        try:
            with engine.connect() as conn:
                q_tramos = text("SELECT * FROM BFinanciacion WHERE posicion = :id AND cedula = 'VACANTE'")
                tramos_rows = conn.execute(q_tramos, {"id": id_posicion}).mappings().all()
                tramos = [dict(r) for r in tramos_rows]
        except Exception:
            tramos = [t for t in MOCK_FINANCIACION_VACANTES if t["posicion_c"] == id_posicion]

        # Sync tramos with necessary fields for calculation
        for t in tramos:
            t.update({
                "cargo": pos.get("Cargo") or pos.get("cargo"),
                "banda": pos.get("Banda") or pos.get("banda"),
                "familia": pos.get("Familia") or pos.get("familia"),
                "salario_base": float(pos.get("Salario") or 0),
                "atep": float(pos.get("atep") or 0.00522),
                "posicion_c": id_posicion
            })

        mensualizado = mensualizar_base_30(tramos, incrementos) if tramos else []

        return {
            "ok": True,
            "posicion": pos,
            "tramos": tramos,
            "months": mensualizado
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/guardar")
def save_tramo_vacante(dato: TramoFinanciacion, user: Dict[str, Any] = Depends(get_current_user)):
    """
    Guarda un tramo de financiación para una vacante.
    """
    try:
        # En modo mock, guardamos en la lista global
        new_tramo = {
            "id_financiacion": str(uuid.uuid4())[:8] if not dato.id else dato.id,
            "cedula": "VACANTE",
            "posicion_c": dato.cedula, # Usamos cedula como IDPosicion en el schema
            "fecha_inicio": dato.fechaInicio.isoformat(),
            "fecha_fin": dato.fechaFin.isoformat(),
            "salario_base": float(dato.salario),
            "id_proyecto": dato.proyecto,
            "rubro": dato.rubro,
            "id_fuente": dato.fuente,
            "id_componente": dato.componente,
            "id_subcomponente": dato.subcomponente,
            "id_categoria": dato.categoria,
            "id_responsable": dato.responsable
        }

        # Intentar insertar en DB si es posible
        try:
            query = text("""
                INSERT INTO BFinanciacion (id_financiacion, cedula, posicion, fecha_inicio, fecha_fin, salario_base, id_proyecto, rubro, id_fuente, id_componente, id_subcomponente, id_categoria, id_responsable)
                VALUES (:id, :cedula, :pos, :inicio, :fin, :sal, :proy, :rubro, :fuente, :comp, :subcomp, :cat, :resp)
                ON DUPLICATE KEY UPDATE fecha_inicio=:inicio, fecha_fin=:fin, salario_base=:sal, id_proyecto=:proy, rubro=:rubro, id_fuente=:fuente, id_componente=:comp, id_subcomponente=:subcomp, id_categoria=:cat, id_responsable=:resp
            """)
            with engine.begin() as conn:
                conn.execute(query, {
                    "id": new_tramo["id_financiacion"],
                    "cedula": "VACANTE",
                    "pos": new_tramo["posicion_c"],
                    "inicio": new_tramo["fecha_inicio"],
                    "fin": new_tramo["fecha_fin"],
                    "sal": new_tramo["salario_base"],
                    "proy": new_tramo["id_proyecto"],
                    "rubro": new_tramo["rubro"],
                    "fuente": new_tramo["id_fuente"],
                    "comp": new_tramo["id_componente"],
                    "subcomp": new_tramo["id_subcomponente"],
                    "cat": new_tramo["id_categoria"],
                    "resp": new_tramo["id_responsable"]
                })
        except Exception:
            pass  # Si falla la inserción en DB, el tramo queda solo en memoria Mock

        # Manejo Mock
        if dato.id:
            global MOCK_FINANCIACION_VACANTES
            MOCK_FINANCIACION_VACANTES = [t if t["id_financiacion"] != dato.id else new_tramo for t in MOCK_FINANCIACION_VACANTES]
        else:
            MOCK_FINANCIACION_VACANTES.append(new_tramo)

        return {"ok": True, "mensaje": "Tramo de vacante guardado"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
