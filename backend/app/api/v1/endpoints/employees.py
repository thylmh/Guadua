import math
import json
import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from app.core.security import get_current_user
from app.core.database import engine
from app.core.constants import PAGO_EXPR
from app.models.schemas import TramoFinanciacion
from app.core.utils import to_date
from app.services.payroll_service_optimized import mensualizar_base_30_optimized as mensualizar_base_30
from app.services.audit_service import AuditService
from app.core.database import get_db
from sqlalchemy.orm import Session

router = APIRouter()

@router.get("/me")
def check_session(user: Dict[str, Any] = Depends(get_current_user)):
    # Try to find name in BData if not already provided or if NOT local debug
    nombre = user.get("nombre", "Servidor")
    
    if user.get("source") != "local_debug":
        try:
            query = text("SELECT p_nombre, p_apellido FROM BData WHERE correo_electronico = :email LIMIT 1")
            with engine.connect() as conn:
                row = conn.execute(query, {"email": user["email"]}).mappings().first()
                if row:
                    nombre = f"{row['p_nombre']} {row['p_apellido']}".strip()
        except:
            pass

    return {
        "ok": True, 
        "user": {
            "email": user["email"], 
            "role": user["role"], 
            "nombre": nombre,
            "source": user["source"]
        }
    }

@router.get("/me/notifications")
def get_my_notifications(user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    """ Retorna las notificaciones para el usuario autenticado """
    try:
        query = text("""
            SELECT id, mensaje, leido, fecha_creacion, tipo, solicitud_id
            FROM BNotificaciones
            WHERE usuario_email = :email
            ORDER BY fecha_creacion DESC
            LIMIT 50
        """)
        res = db.execute(query, {"email": user["email"]}).mappings().all()
        
        output = []
        for r in res:
            d = dict(r)
            if d['fecha_creacion']:
                d['fecha_creacion'] = d['fecha_creacion'].isoformat()
            output.append(d)
        return output
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/me/notifications/read-all")
def mark_all_notifications_as_read(user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    """ Marca todas las notificaciones como leídas """
    try:
        db.execute(text("UPDATE BNotificaciones SET leido = 1 WHERE usuario_email = :email"), {"email": user["email"]})
        db.commit()
        return {"ok": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/financiacion/{cedula}")
def obtener_financiacion(cedula: str, _user: Dict[str, Any] = Depends(get_current_user)):
    query = text(f"""
    WITH CalculosBase AS (
        SELECT 
            f.id_financiacion, f.id_contrato, f.cedula,
            f.fecha_inicio, f.fecha_fin, f.id_proyecto,
            f.salario_base,
            {PAGO_EXPR} AS pago,
            f.rubro, f.id_fuente, f.id_componente, f.id_subcomponente, f.id_categoria, f.id_responsable,
            p.cargo, p.banda, p.familia, p.IDPosicion AS posicion_c, c.atep,
            i.anio, i.smlv, i.transporte, i.porcentaje_aumento, i.dotacion AS i_dotacion,

            CEILING(f.salario_base * (CASE WHEN COALESCE(i.porcentaje_aumento, 0) > 0 THEN i.porcentaje_aumento / 100 ELSE 1 END) / 1000) * 1000 AS salario_calc
        FROM BFinanciacion f
        LEFT JOIN BContrato c ON f.id_contrato = c.id_contrato
        LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
        LEFT JOIN BIncremento i ON YEAR(f.fecha_inicio) = i.anio
        WHERE f.cedula = :cedula
    ),
    CalculosPrestacionales AS (
        SELECT 
            *,
            CASE 
                WHEN cargo <> 'Lectiva' AND salario_calc <= (2 * COALESCE(smlv, 0)) THEN COALESCE(transporte, 0)
                ELSE 0 
            END AS aux_transporte,
            CASE
                WHEN cargo = 'Lectiva' OR salario_calc > (COALESCE(smlv, 0) * 2) THEN 0
                ELSE CEILING(COALESCE(i_dotacion, 0) / 12)
            END AS dotacion
        FROM CalculosBase
    ),
    CalculosFinales AS (
        SELECT 
            *,
            CASE WHEN cargo = 'Lectiva' THEN 0 WHEN banda = 'B01' THEN 0 ELSE FLOOR((salario_calc + aux_transporte) * 0.0834) END AS primas,
            CASE WHEN cargo = 'Lectiva' THEN 0 ELSE FLOOR(salario_calc * 0.0417) END AS s_vacaciones,
            CASE WHEN cargo = 'Lectiva' THEN 0 ELSE FLOOR(salario_calc * 0.0417) END AS sueldo_vacaciones,
            CASE WHEN cargo = 'Lectiva' THEN 0 WHEN banda = 'B01' THEN 0 ELSE FLOOR((salario_calc + aux_transporte) * 0.0834) END AS cesantias,
            CASE WHEN cargo = 'Lectiva' THEN 0 WHEN banda = 'B01' THEN 0 ELSE FLOOR((salario_calc + aux_transporte) * 0.01) END AS i_cesantias,
            CASE 
                WHEN cargo = 'Lectiva' THEN (ROUND((COALESCE(smlv, 0) * 0.125) / 100) * 100) 
                WHEN banda = 'B01' THEN (ROUND(((salario_calc * 0.7) * 0.125) / 100) * 100 - FLOOR((salario_calc * 0.7) * 0.04))
                ELSE (ROUND((salario_calc * 0.125) / 100) * 100) - FLOOR(salario_calc * 0.04) 
            END AS salud,
            CASE
                WHEN cargo = 'Lectiva' OR posicion_c IN ('IHPO_119', 'IHPO_6ac') THEN 0
                WHEN banda = 'B01' THEN (ROUND(((salario_calc * 0.7) * 0.16) / 100) * 100) - FLOOR((salario_calc * 0.7) * 0.04)
                ELSE (ROUND((salario_calc * 0.16) / 100) * 100) - FLOOR(salario_calc * 0.04)
            END AS pension,
            CASE WHEN cargo = 'Lectiva' THEN 0 WHEN banda = 'B01' THEN ROUND((salario_calc * 0.7 * 0.04)/100)*100 ELSE ROUND((salario_calc * 0.04)/100)*100 END AS ccf,
            CASE WHEN familia = 'Aprendiz' THEN 0 WHEN banda = 'B01' THEN ROUND((salario_calc * 0.7 * 0.02)/100)*100 ELSE ROUND((salario_calc * 0.02)/100)*100 END AS sena,
            CASE WHEN familia = 'Aprendiz' THEN 0 WHEN banda = 'B01' THEN ROUND((salario_calc * 0.7 * 0.03)/100)*100 ELSE ROUND((salario_calc * 0.03)/100)*100 END AS icbf,
            CASE 
                WHEN familia = 'Aprendiz' OR cargo = 'Lectiva' THEN ROUND((COALESCE(smlv, 0) * COALESCE(atep, 0)) / 100) * 100
                WHEN banda = 'B01' THEN ROUND(((salario_calc * 0.7) * COALESCE(atep, 0)) / 100) * 100
                ELSE ROUND((salario_calc * COALESCE(atep, 0)) / 100) * 100
            END AS arl
        FROM CalculosPrestacionales
    )
    SELECT 
        *,
        -- Override stored value with real-time calculation to ensure consistency
        (salario_calc + aux_transporte + dotacion + primas + s_vacaciones + sueldo_vacaciones + 
         cesantias + i_cesantias + salud + pension + arl + ccf + sena + icbf) AS salario_t,
         
        (salario_calc + aux_transporte + dotacion + primas + s_vacaciones + sueldo_vacaciones + 
         cesantias + i_cesantias + salud + pension + arl + ccf + sena + icbf) AS salario_final_calculado
    FROM CalculosFinales;
    """)

    with engine.connect() as conn:
        result = conn.execute(query, {"cedula": cedula})
        rows = result.mappings().all()

    tramos = []
    for row in rows:
        d = dict(row)
        for k, v in d.items():
            if hasattr(v, '__float__') and v is not None:
                d[k] = float(v)
        tramos.append(d)

    return {"ok": True, "tramos": tramos}

@router.get("/consulta/{cedula}")
def obtener_consulta_individual(
    cedula: str,
    anio: Optional[int] = None,
    _user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)  # NOTE: get_db is just a dependency, audit service uses its own engine connect
):
    audit = AuditService(db)
    # Log READ Access to Financial Detail
    try:
        audit.log_event(
            actor_email=_user['email'],
            module='Consulta',
            action='READ',
            resource_id=cedula,
            details=f"Acceso a Detalle Financiero de {cedula}"
        )
    except: pass # Don't block read if audit fails (though it shouldn't now)

    try:
        empleado_query = text("SELECT cedula, p_nombre, s_nombre, p_apellido, s_apellido, correo_electronico FROM BData WHERE cedula = :cedula LIMIT 1")
        contrato_query = text("""
            SELECT c.id_contrato, c.posicion, p.Cargo as cargo, p.Rol as rol, p.Banda as banda, c.salario, c.nivel_riesgo, c.atep,
                   p.Direccion as direccion, p.Gerencia as gerencia, p.Area as area, p.Subarea as subarea, p.Planta as planta,
                   p.Tipo_planta as tipo_planta, c.num_contrato, c.fecha_ingreso, c.fecha_terminacion, c.fecha_terminacion_real, c.prorrogas_fecha, c.estado, p.Base_Fuente as base_fuente
            FROM BContrato c
            LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
            WHERE c.cedula = :cedula
            ORDER BY CASE WHEN c.estado IS NOT NULL AND LOWER(c.estado) LIKE 'activo' THEN 0 ELSE 1 END, c.fecha_ingreso DESC
            LIMIT 1
        """)
        tramos_query = text(f"""
        WITH CalculosBase AS (
            SELECT f.id_financiacion, f.id_contrato, f.cedula, f.fecha_inicio, f.fecha_fin, f.id_proyecto, f.salario_base,
                   {PAGO_EXPR} AS pago, f.rubro, f.id_fuente, f.id_componente, f.id_subcomponente, f.id_categoria, f.id_responsable,
                   p.cargo, p.banda, p.familia, p.IDPosicion AS posicion_c, c.atep, c.estado, c.fecha_terminacion_real,
                   i.anio, i.smlv, i.transporte, i.porcentaje_aumento, i.dotacion AS i_dotacion,
                   CEILING(f.salario_base * (CASE WHEN COALESCE(i.porcentaje_aumento, 0) > 0 THEN i.porcentaje_aumento / 100 ELSE 1 END) / 1000) * 1000 AS salario_calc
            FROM BFinanciacion f
            LEFT JOIN BContrato c ON f.id_contrato = c.id_contrato
            LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
            LEFT JOIN BIncremento i ON YEAR(f.fecha_inicio) = i.anio
            WHERE f.cedula = :cedula
        ),
        CalculosPrestacionales AS (
            SELECT *,
                CASE WHEN cargo <> 'Lectiva' AND salario_calc <= (2 * COALESCE(smlv, 0)) THEN COALESCE(transporte, 0) ELSE 0 END AS aux_transporte,
                CASE WHEN cargo = 'Lectiva' OR salario_calc > (COALESCE(smlv, 0) * 2) THEN 0 ELSE CEILING(COALESCE(i_dotacion, 0) / 12) END AS dotacion
            FROM CalculosBase
        ),
        CalculosFinales AS (
            SELECT *,
                CASE WHEN cargo = 'Lectiva' THEN 0 WHEN banda = 'B01' THEN 0 ELSE FLOOR((salario_calc + aux_transporte) * 0.0834) END AS primas,
                CASE WHEN cargo = 'Lectiva' THEN 0 ELSE FLOOR(salario_calc * 0.0417) END AS s_vacaciones,
                CASE WHEN cargo = 'Lectiva' THEN 0 ELSE FLOOR(salario_calc * 0.0417) END AS sueldo_vacaciones,
                CASE WHEN cargo = 'Lectiva' THEN 0 WHEN banda = 'B01' THEN 0 ELSE FLOOR((salario_calc + aux_transporte) * 0.0834) END AS cesantias,
                CASE WHEN cargo = 'Lectiva' THEN 0 WHEN banda = 'B01' THEN 0 ELSE FLOOR((salario_calc + aux_transporte) * 0.01) END AS i_cesantias,
                CASE WHEN cargo = 'Lectiva' THEN (ROUND((COALESCE(smlv, 0) * 0.125) / 100) * 100) 
                     WHEN banda = 'B01' THEN (ROUND(((salario_calc * 0.7) * 0.125) / 100) * 100 - FLOOR((salario_calc * 0.7) * 0.04))
                     ELSE (ROUND((salario_calc * 0.125) / 100) * 100 - FLOOR(salario_calc * 0.04)) END AS salud,
                CASE WHEN cargo = 'Lectiva' OR posicion_c IN ('IHPO_119', 'IHPO_6ac') THEN 0
                     WHEN banda = 'B01' THEN (ROUND(((salario_calc * 0.7) * 0.16) / 100) * 100 - FLOOR((salario_calc * 0.7) * 0.04))
                     ELSE (ROUND((salario_calc * 0.16) / 100) * 100 - FLOOR(salario_calc * 0.04)) END AS pension,
                CASE WHEN cargo = 'Lectiva' THEN 0 WHEN banda = 'B01' THEN ROUND((salario_calc * 0.7 * 0.04)/100)*100 ELSE ROUND((salario_calc * 0.04)/100)*100 END AS ccf,
                CASE WHEN familia = 'Aprendiz' THEN 0 WHEN banda = 'B01' THEN ROUND((salario_calc * 0.7 * 0.02)/100)*100 ELSE ROUND((salario_calc * 0.02)/100)*100 END AS sena,
                CASE WHEN familia = 'Aprendiz' THEN 0 
                     WHEN banda = 'B01' THEN ROUND((salario_calc * 0.7 * 0.03)/100)*100 
                     ELSE ROUND((salario_calc * 0.03)/100)*100 END AS icbf,
                CASE WHEN familia = 'Aprendiz' THEN ROUND(COALESCE(smlv, 0) * 1.0 * COALESCE(atep, 0) / 100) * 100
                     WHEN banda = 'B01' THEN ROUND(((salario_calc * 0.7) * 1.0 * COALESCE(atep, 0)) / 100) * 100
                     ELSE ROUND(salario_calc * 1.0 * COALESCE(atep, 0) / 100) * 100 END AS arl
            FROM CalculosPrestacionales
        )
        SELECT *,
            (salario_calc + aux_transporte + dotacion + primas + s_vacaciones + sueldo_vacaciones + 
             cesantias + i_cesantias + salud + pension + arl + ccf + sena + icbf) AS salario_t
        FROM CalculosFinales
        ORDER BY fecha_inicio ASC;
        """)

        inc_query = text("SELECT * FROM BIncremento")
        with engine.connect() as conn:
            incs = conn.execute(inc_query).mappings().all()
            incrementos = {int(r["anio"]): dict(r) for r in incs}
            empleado = conn.execute(empleado_query, {"cedula": cedula}).mappings().first()
            if not empleado:
                raise HTTPException(status_code=404, detail="No se encontró el trabajador.")
            contrato = conn.execute(contrato_query, {"cedula": cedula}).mappings().first()
            tramos_rows = conn.execute(tramos_query, {"cedula": cedula}).mappings().all()
            
            # Fetch Component & Project Names for Breakdown
            comp_lookup = {}
            proj_lookup = {}
            try:
                c_rows = conn.execute(text("SELECT codigo, nombre FROM dim_componentes")).fetchall()
                comp_lookup = {r[0]: r[1] for r in c_rows}
                
                p_rows = conn.execute(text("SELECT Codigo, Nombre FROM dim_proyectos")).fetchall()
                proj_lookup = {r[0]: r[1] for r in p_rows}
            except: pass

        nombre_parts = [empleado.get("p_nombre"), empleado.get("s_nombre"), empleado.get("p_apellido"), empleado.get("s_apellido")]
        nombre = " ".join(part for part in nombre_parts if part).strip()

        tramos_data = []
        for row in tramos_rows:
            d = dict(row)
            est = (d.get("estado") or "").upper()
            term_real = to_date(d.get("fecha_terminacion_real"))
            if "ACTIVO" not in est and term_real:
                tr_fin = to_date(d["fecha_fin"])
                if tr_fin > term_real:
                    d["fecha_fin"] = term_real
            for k, v in d.items():
                if hasattr(v, '__float__') and v is not None: d[k] = float(v)
            tramos_data.append(d)

        mensualizado = mensualizar_base_30(tramos_data, incrementos)
        
        # available_years based on tramos
        years_set = set()
        for t in tramos_data:
            f_ini = t.get("fecha_inicio")
            f_fin = t.get("fecha_fin")
            if f_ini and hasattr(f_ini, "year"):
                start_y = f_ini.year
                end_y = f_fin.year if (f_fin and hasattr(f_fin, "year")) else start_y
                for y in range(start_y, end_y + 1):
                    years_set.add(y)
        available_years = sorted(list(years_set))
        if not available_years:
            available_years = [datetime.datetime.now().year]

        # Filter mensualizado if anio is provided
        if anio:
            mensualizado = [m for m in mensualizado if m["anioMes"].startswith(str(anio))]

        # --- Aggregation: Project & Component Breakdown ---
        resumen_dict = {} 
        for m in mensualizado:
            for item in m["detalle"]:
                pid = item.get("id_proyecto") or "SIN_PROYECTO"
                pname = proj_lookup.get(pid) or item.get("proyecto") or pid # Priority: Lookup > Item Name > ID
                cid = item.get("componente") or "SIN_COMPONENTE"
                cname = comp_lookup.get(cid, cid) # Map name if available
                val = item.get("valor", 0.0)
                
                if pid not in resumen_dict:
                    resumen_dict[pid] = {
                        "id": pid, "nombre": pname, "total": 0.0, "componentes": {}
                    }
                
                resumen_dict[pid]["total"] += val
                
                if cid not in resumen_dict[pid]["componentes"]:
                    resumen_dict[pid]["componentes"][cid] = {"nombre": cname, "total": 0.0}
                resumen_dict[pid]["componentes"][cid]["total"] += val
        
        resumen_final = []
        for pid, data in resumen_dict.items():
            comps = list(data["componentes"].values())
            comps.sort(key=lambda x: x["total"], reverse=True)
            resumen_final.append({
                "nombre": data["nombre"],
                "total": round(data["total"]),
                "componentes": comps
            })
        resumen_final.sort(key=lambda x: x["total"], reverse=True)
        # --------------------------------------------------

        cabecera = None
        alerta_inactivo = None
        if contrato:
            # Convert to dict with lowercase keys to be 100% sure
            c_dict = {k.lower(): v for k, v in dict(contrato).items()}
            
            estado_val = c_dict.get("estado") or ""
            est = str(estado_val).upper()
            if not est.startswith("ACTIVO"):
                term_real = to_date(c_dict.get("fecha_terminacion_real"))
                alerta_inactivo = f"Trabajador Inactivo desde {term_real}" if term_real else "Trabajador Inactivo"

            # Float conversion
            for k, v in c_dict.items():
                if hasattr(v, '__float__') and v is not None: c_dict[k] = float(v)
            
            cabecera = {
                "CEDULA": cedula, "IDCONTRATO": c_dict.get("id_contrato"), "POSICION": c_dict.get("posicion"),
                "NOMBRE": nombre, "CARGO": c_dict.get("cargo"), "ROL": c_dict.get("rol"), "BANDA": c_dict.get("banda"),
                "SALARIO": c_dict.get("salario"), "NIVEL_RIESGO": c_dict.get("nivel_riesgo"), "ATEP": c_dict.get("atep"),
                "DIRECCION": c_dict.get("direccion"), "GERENCIA": c_dict.get("gerencia"), "AREA": c_dict.get("area"),
                "SUBAREA": c_dict.get("subarea"), "PLANTA": c_dict.get("planta"), "TPLANTA": c_dict.get("tipo_planta"),
                "NUM_CONTRATO": c_dict.get("num_contrato"), "FECHA_INGRESO": c_dict.get("fecha_ingreso"),
                "F_TERMINACION": c_dict.get("fecha_terminacion"), "F_TERMINACION_REAL": c_dict.get("fecha_terminacion_real"),
                "PRORROGAS": c_dict.get("prorrogas_fecha"), "ESTADO": estado_val or "Desconocido", "FUEN_FINAN": c_dict.get("base_fuente")
            }

            # --- CALCULO CARGA SALARIAL BASADA EN CONTRATO (Mandatory Request) ---
            # Utilizamos el salario del contrato, no del tramo, para el KPI de cabecera
            sal_base_con = float(c_dict.get("salario") or 0)
            # Fetch increment for current year to be precise in "Estimated" cost
            current_year = datetime.datetime.now().year
            inc_con = incrementos.get(current_year) or {}
            porc_c = float(inc_con.get("porcentaje_aumento") or 0)
            smlv_c = float(inc_con.get("smlv") or 0)
            trans_c = float(inc_con.get("transporte") or 0)
            dot_c_val = float(inc_con.get("dotacion") or 0)

            sal_calc_c = sal_base_con * (porc_c / 100.0 if porc_c > 0 else 1.0)
            sal_calc_c = float(int(sal_calc_c / 1000 + 0.999) * 1000)
            
            aux_t_c = trans_c if (sal_calc_c <= 2 * smlv_c and c_dict.get("cargo") != "Lectiva") else 0
            dot_c = 0 if (c_dict.get("cargo") == "Lectiva" or sal_calc_c > (smlv_c * 2)) else int(dot_c_val / 12)
            
            # Simplified Logic for Header KPI (1 Month) - RESTORED ORIGINAL
            is_l = (c_dict.get("cargo") == "Lectiva")
            is_b = (c_dict.get("banda") == "B01")
            
            primas_c = 0 if (is_l or is_b) else int((sal_calc_c + aux_t_c) * 0.0834)
            s_vac_c = 0 if is_l else int(sal_calc_c * 0.0417)
            ces_c = 0 if (is_l or is_b) else int((sal_calc_c + aux_t_c) * 0.0834)
            i_ces_c = 0 if (is_l or is_b) else int((sal_calc_c + aux_t_c) * 0.01)
            
            # Salud
            if is_l:
                salud_c = (int(sal_calc_c * 0.125 / 100.0 + 0.5) * 100.0)
            elif is_b:
                base_i = sal_calc_c * 0.7
                total_s = (int(base_i * 0.125 / 100.0 + 0.5) * 100.0)
                emp_s = int(base_i * 0.04)
                salud_c = total_s - emp_s
            else:
                total_s = (int(sal_calc_c * 0.125 / 100.0 + 0.5) * 100.0)
                emp_s = int(sal_calc_c * 0.04)
                salud_c = total_s - emp_s

            pension_c = 0
            if not(is_l or c_dict.get("posicion") in ("IHPO_119", "IHPO_6ac")):
                base_p = sal_calc_c * 0.7 if is_b else sal_calc_c
                total_p = (int(base_p * 0.16 / 100.0 + 0.5) * 100.0)
                emp_p = int(base_p * 0.04)
                pension_c = total_p - emp_p
            
            ccf_c = 0 if is_l else int((sal_calc_c * (0.7 if is_b else 1.0) * 0.04 / 100.0 + 0.5)) * 100.0
            sena_c = 0 if (c_dict.get("familia") == "Aprendiz") else int((sal_calc_c * (0.7 if is_b else 1.0) * 0.02 / 100.0 + 0.5)) * 100.0
            icbf_c = 0 if (c_dict.get("familia") == "Aprendiz") else int((sal_calc_c * (0.7 if is_b else 1.0) * 0.03 / 100.0 + 0.5)) * 100.0
            arl_c = int((sal_calc_c * (0.7 if is_b else 1.0) * (c_dict.get("atep") or 0) / 100.0 / 100.0 + 0.5)) * 100.0
            
            total_carga_con = (sal_calc_c + aux_t_c + dot_c + primas_c + (s_vac_c * 2) + ces_c + i_ces_c + salud_c + pension_c + arl_c + ccf_c + sena_c + icbf_c)
            
            cabecera["TOTAL_CARGA_SALARIAL"] = total_carga_con
            cabecera["ULTIMO_MES_LABEL"] = f"Calculado según Contrato (Base: ${sal_base_con:,.0f})"
            cabecera["CONCEPTOS_MES"] = {
                "Salario_Calc": sal_calc_c, "Aux_Transporte": aux_t_c, "Dotacion": dot_c,
                "PrimaS": primas_c, "sueldo_vacaciones": s_vac_c, "prima_vacaciones": s_vac_c, 
                "Cesantias": ces_c, "ICesantias": i_ces_c,
                "Salud": salud_c, "Pension": pension_c, "ARL": arl_c, "Parafiscales": (ccf_c + sena_c + icbf_c)
            }

        ret_dict = {
            "ok": True, 
            "empleado": {"cedula": empleado["cedula"], "nombre": nombre, "correo": empleado.get("correo_electronico")}, 
            "cabecera": cabecera, 
            "alerta_inactivo": alerta_inactivo, 
            "tramos": tramos_data, 
            "months": mensualizado,

            "available_years": available_years,
            "resumen_proyectos_v2": resumen_final
        }
        
        return ret_dict
    except Exception as e:
        if _user.get("source") == "local_debug":
            return {
                "ok": True,
                "empleado": {"cedula": cedula, "nombre": "Empleado de Prueba Local", "correo": "dev@humboldt.org.co"},
                "cabecera": {
                    "CEDULA": cedula, "NOMBRE": "Empleado de Prueba Local", "CARGO": "Desarrollador",
                    "DIRECCION": "Tecnología", "TOTAL_CARGA_SALARIAL": 8000000.0,
                    "ESTADO": "Activo",
                    "CONCEPTOS_MES": {"Salario_Calc": 5000000, "Aux_Transporte": 160000}
                },
                "tramos": [], "months": [],
                "alerta_inactivo": None
            }
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@router.post("/guardar")
def guardar_tramo(
    request: Request,
    dato: TramoFinanciacion,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if dato.fechaFin < dato.fechaInicio:
        raise HTTPException(status_code=400, detail="fechaFin no puede ser menor que fechaInicio.")
    
    audit = AuditService(db)
    
    try:
        # Prepare context data
        old_values = None
        action = "CREATE"
        resource_id = None
        new_values = None
        
        with engine.connect() as conn:
            # Check Employee Name (to include in justification)
            q_emp = text("SELECT CONCAT_WS(' ', p_nombre, s_nombre, p_apellido, s_apellido) FROM BData WHERE cedula = :ced")
            empleado_nombre = conn.execute(q_emp, {"ced": dato.cedula}).scalar() or "Desconocido"

            # Check Contract
            q_contrato = text("SELECT id_contrato, posicion, cargo, banda, familia, salario FROM BContrato WHERE cedula = :ced ORDER BY CASE WHEN estado LIKE 'Activo' THEN 0 ELSE 1 END, fecha_ingreso DESC LIMIT 1")
            con_row = conn.execute(q_contrato, {"ced": dato.cedula}).mappings().first()
            if not con_row: raise HTTPException(status_code=400, detail="El empleado no tiene un contrato registrado.")
            
            # 1. SALARY VALIDATION (New Rule: Tramo Salary >= Contract Salary)
            contract_salary = float(con_row.get("salario") or 0)
            if float(dato.salario) < contract_salary:
                raise HTTPException(
                    status_code=400, 
                    detail=f"El salario del tramo (${dato.salario:,.0f}) no puede ser menor al salario pactado en contrato (${contract_salary:,.0f})."
                )
            
            # Fetch Increment Data
            anio_inicio = dato.fechaInicio.year
            q_inc = text("SELECT * FROM BIncremento WHERE anio = :anio")
            inc = conn.execute(q_inc, {"anio": anio_inicio}).mappings().first()
            
            # Pre-calculation Logic (Preserved from original)
            salario_base = float(dato.salario); porc = float(inc.get("porcentaje_aumento") or 0) if inc else 0; smlv = float(inc.get("smlv") or 0) if inc else 0; transporte = float(inc.get("transporte") or 0) if inc else 0; i_dotacion = float(inc.get("dotacion") or 0) if inc else 0
            salario_calc = salario_base * (porc / 100 if porc > 0 else 1.0); salario_calc = float(int(salario_calc / 1000 + 0.999) * 1000)
            aux_t = transporte if (salario_calc <= 2 * smlv and con_row["cargo"] != "Lectiva") else 0; dotacion = 0 if (con_row["cargo"] == "Lectiva" or salario_calc > (smlv * 2)) else int(i_dotacion / 12)
            primas = 0 if (con_row["cargo"] == "Lectiva" or con_row["banda"] == "B01") else int((salario_calc + aux_t) * 0.0834); s_vac = 0 if (con_row["cargo"] == "Lectiva") else int(salario_calc * 0.0417); ces = 0 if (con_row["cargo"] == "Lectiva" or con_row["banda"] == "B01") else int((salario_calc + aux_t) * 0.0834); i_ces = 0 if (con_row["cargo"] == "Lectiva" or con_row["banda"] == "B01") else int((salario_calc + aux_t) * 0.01)
            
            if con_row["cargo"] == "Lectiva":
                salud = (int(smlv * 0.125 / 100 + 0.5) * 100)
            elif con_row["banda"] == "B01":
                base_integral = salario_calc * 0.7
                salud = (int(base_integral * 0.125 / 100 + 0.5) * 100) - (int(base_integral * 0.04))
            else:
                salud = (int(salario_calc * 0.125 / 100 + 0.5) * 100) - (int(salario_calc * 0.04))
            
            pension = 0
            if not(con_row["cargo"] == "Lectiva" or con_row["posicion"] in ("IHPO_119", "IHPO_6ac")):
                base_p = salario_calc * 0.7 if con_row["banda"] == "B01" else salario_calc
                pension = (int(base_p * 0.16 / 100 + 0.5) * 100) - (int(base_p * 0.04))
            
            ccf = 0 if con_row["cargo"] == "Lectiva" else int(salario_calc * (0.7 if con_row["banda"] == "B01" else 1.0) * 0.04 / 100 + 0.5) * 100
            sena = 0 if con_row["familia"] == "Aprendiz" else int(salario_calc * (0.7 if con_row["banda"] == "B01" else 1.0) * 0.02 / 100 + 0.5) * 100
            icbf = 0 if con_row["familia"] == "Aprendiz" else int(salario_calc * (0.7 if con_row["banda"] == "B01" else 1.0) * 0.03 / 100 + 0.5) * 100
            
            # Add ARL (Missing from original guardar_tramo)
            atep_val = float(con_row.get("atep") or 0)
            base_arl = smlv if con_row["familia"] == "Aprendiz" else (salario_calc * 0.7 if con_row["banda"] == "B01" else salario_calc)
            arl = int(base_arl * 1.0 * atep_val / 100 + 0.5) * 100 # Standard 30 days month (pago=1.0)

            salario_t = (salario_calc + aux_t + dotacion + primas + (s_vac * 2) + ces + i_ces + salud + pension + arl + ccf + sena + icbf)
            
            params = {
                "fecha_inicio": dato.fechaInicio, 
                "fecha_fin": dato.fechaFin, 
                "salario_base": dato.salario, 
                "salario_t": salario_t, 
                "id_proyecto": dato.proyecto, 
                "rubro": dato.rubro, 
                "id_fuente": dato.fuente, 
                "id_componente": dato.componente, 
                "id_subcomponente": dato.subcomponente, 
                "id_categoria": dato.categoria, 
                "id_responsable": dato.responsable, 
                "modifico": user["email"], 
                "id_contrato": con_row["id_contrato"], 
                "posicion": con_row["posicion"]
            }
            
            # --- AUDITORÍA DE CAMBIOS (BSolicitud_Cambio) ---
            # Serializar params para JSON
            payload_nuevo = params.copy()
            # Convertir objetos fecha y decimales a string para JSON
            def serializer(obj):
                if isinstance(obj, (datetime.date, datetime.datetime)):
                    return str(obj)
                return str(obj)

            if dato.id:
                # UPDATE CASE -> Solicitud de MODIFICACION
                tipo_solicitud = "MODIFICACION"
                id_afectado = dato.id
                
                # Fetch Old Values
                q_old = text("SELECT * FROM BFinanciacion WHERE id_financiacion = :id")
                old_row = conn.execute(q_old, {"id": dato.id}).mappings().first()
                old_data = dict(old_row) if old_row else {}
                
                # Limpiar datos viejos serializables
                old_json = json.dumps({k: serializer(v) for k,v in old_data.items()})

            else:
                # INSERT CASE -> Solicitud de CREACION
                tipo_solicitud = "CREACION"
                id_afectado = "NUEVO"
                old_json = "{}" # Nada anterior
                
                # Agregar flag a payload nuevo
                params["cedula"] = dato.cedula # Asegurar que este campo critico vaya
                payload_nuevo["cedula"] = dato.cedula
            
            new_json = json.dumps({k: serializer(v) for k,v in payload_nuevo.items()})
            
            # Lógica de Sobreescritura (UPSERT de Solicitud)
            # Verificar si ya existe una solicitud PENDIENTE para este ID
            existing_req_id = None
            if id_afectado != "NUEVO":
                q_check = text("SELECT id FROM BSolicitud_Cambio WHERE id_financiacion_afectado = :id AND estado = 'PENDIENTE'")
                existing_req_id = conn.execute(q_check, {"id": id_afectado}).scalar()

            if existing_req_id:
                # UPDATE existente
                sql_req = text("""
                    UPDATE BSolicitud_Cambio SET
                        tipo_solicitud = :tipo,
                        cedula = :ced,
                        datos_anteriores = :old,
                        datos_nuevos = :new,
                        justificacion = :just,
                        solicitante = :user,
                        fecha_solicitud = CONVERT_TZ(NOW(), '+00:00', '-05:00')
                    WHERE id = :rid
                """)
                params_req = {
                    "tipo": tipo_solicitud,
                    "ced": dato.cedula,
                    "old": old_json,
                    "new": new_json,
                    "just": f"SOLICITUD: Modificar tramo de {empleado_nombre} (Id: {id_afectado}). Justificación: {dato.justificacion or 'Cambio de parámetros de financiación'}",
                    "user": user["email"],
                    "rid": existing_req_id
                }
                msg_final = "Solicitud de cambio actualizada. Recuerda que debe ser aprobada por la Dirección para que el cambio sea definitivo."
            else:
                # INSERT nueva
                sql_req = text("""
                    INSERT INTO BSolicitud_Cambio (
                        tipo_solicitud, id_financiacion_afectado, cedula, 
                        datos_anteriores, datos_nuevos, justificacion, 
                        solicitante, fecha_solicitud, estado, aprobador
                    ) VALUES (
                        :tipo, :id_afec, :ced,
                        :old, :new, :just,
                        :user, CONVERT_TZ(NOW(), '+00:00', '-05:00'), 'PENDIENTE', NULL
                    )
                """)
                
                # Logic to determine justification prefix
                prefijo = "Crear nuevo tramo" if tipo_solicitud == 'CREACION' else "Modificar tramo existente"
                default_just = "Registro de nueva línea de financiación" if tipo_solicitud == 'CREACION' else "Cambio de parámetros de financiación"
                
                params_req = {
                    "tipo": tipo_solicitud,
                    "id_afec": id_afectado,
                    "ced": dato.cedula,
                    "old": old_json,
                    "new": new_json,
                    "just": f"SOLICITUD: {prefijo} para {empleado_nombre}. Justificación: {dato.justificacion or default_just}",
                    "user": user["email"]
                }
                msg_final = "✅ Solicitud enviada exitosamente. El cambio quedará en estado 'Pendiente' hasta que sea autorizado por la Dirección."

            with engine.begin() as tx:
                tx.execute(sql_req, params_req)
                
            # --- LOG DE AUDITORÍA CENTRAL (BAuditoria) ---
            try:
                audit = AuditService()
                prefijo_audit = "CREACION" if tipo_solicitud == 'CREACION' else "MODIFICACION"
                audit.log_event(
                    actor_email=user['email'],
                    module='Financiacion',
                    action=prefijo_audit,
                    resource_id=id_afectado,
                    details=f"Solicitud de {tipo_solicitud} de tramo para cédula {dato.cedula}. Justificación: {dato.justificacion or 'Cambio solicitado'}",
                    actor_ip=request.client.host if request.client else "0.0.0.0"
                )
            except Exception as e_audit:
                print(f"Error en auditoría (guardar_tramo): {e_audit}")

            return {
                "ok": True, 
                "message": msg_final
            }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error saving tramo: {e}")
        raise HTTPException(status_code=500, detail=f"Error al guardar: {str(e)}")


@router.delete("/borrar/{id_f}")
def eliminar_tramo(id_f: str, user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    """ Solicita la eliminación de un tramo de financiación """
    try:
        old_values = None
        
        with engine.connect() as conn:
            q_old = text("SELECT * FROM BFinanciacion WHERE id_financiacion = :id")
            old_row = conn.execute(q_old, {"id": id_f}).mappings().first()
            if old_row:
                old_values = dict(old_row)
            else:
                 raise HTTPException(status_code=404, detail="Registro no encontrado.")
            
            # --- AUDITORÍA DE CAMBIOS (BSolicitud_Cambio) ---
            def serializer(obj):
                if isinstance(obj, (datetime.date, datetime.datetime)):
                    return str(obj)
                return str(obj)

            old_json = json.dumps({k: serializer(v) for k,v in old_values.items()})
            cedula = old_values.get('cedula', 'Desconocido')
            
            # Lógica de Sobreescritura (UPSERT de Solicitud de Eliminación)
            q_check = text("SELECT id FROM BSolicitud_Cambio WHERE id_financiacion_afectado = :id AND estado = 'PENDIENTE'")
            existing_req_id = conn.execute(q_check, {"id": id_f}).scalar()

            if existing_req_id:
                # UPDATE request existente
                sql_req = text("""
                    UPDATE BSolicitud_Cambio SET
                        tipo_solicitud = 'ELIMINACION',
                        cedula = :ced,
                        datos_anteriores = :old,
                        datos_nuevos = '{}',
                        justificacion = :just,
                        solicitante = :user,
                        fecha_solicitud = CONVERT_TZ(NOW(), '+00:00', '-05:00')
                    WHERE id = :rid
                """)
                params_req = {
                    "ced": cedula,
                    "old": old_json,
                    "just": f"Solicitud de eliminación (Reiterada) por {user.get('nombre', user['email'])}",
                    "user": user["email"],
                    "rid": existing_req_id
                }
                msg = "Solicitud de eliminación actualizada. Pendiente de aprobación."
            else:
                # INSERT nuevo request
                sql_req = text("""
                    INSERT INTO BSolicitud_Cambio (
                        tipo_solicitud, id_financiacion_afectado, cedula, 
                        datos_anteriores, datos_nuevos, justificacion, 
                        solicitante, fecha_solicitud, estado, aprobador
                    ) VALUES (
                        'ELIMINACION', :id_afec, :ced,
                        :old, '{}', :just,
                        :user, CONVERT_TZ(NOW(), '+00:00', '-05:00'), 'PENDIENTE', NULL
                    )
                """)
                params_req = {
                    "id_afec": id_f,
                    "ced": cedula,
                    "old": old_json,
                    "just": f"Solicitud de eliminación por {user.get('nombre', user['email'])}",
                    "user": user["email"]
                }
                msg = "Solicitud de eliminación enviada a aprobación. El registro seguirá visible hasta ser autorizado."
            
            with engine.begin() as tx:
                tx.execute(sql_req, params_req)
        
        return {
            "ok": True, 
            "mensaje": msg
        }

    except Exception as e:
        print(f"Error delete tramo: {e}")
        raise HTTPException(status_code=500, detail=str(e))
@router.get("/catalogos")
def obtener_catalogos(_user: Dict[str, Any] = Depends(get_current_user)):
    try:
        dimensiones = {"fuentes": "dim_fuentes", "componentes": "dim_componentes", "subcomponentes": "dim_subcomponentes", "categorias": "dim_categorias", "responsables": "dim_responsables"}
        output = {}
        with engine.connect() as conn:
            try:
                q_proy = text("SELECT codigo AS id, nombre FROM dim_proyectos UNION SELECT codigo AS id, nombre FROM dim_proyectos_otros")
                res_proy = conn.execute(q_proy).mappings().all()
                output["proyectos"] = [dict(r) for r in res_proy]
            except Exception: output["proyectos"] = []
            for key, table in dimensiones.items():
                try:
                    q = text(f"SELECT codigo AS id, nombre FROM {table}")
                    res = conn.execute(q).mappings().all()
                    output[key] = [dict(r) for r in res]
                except Exception: output[key] = []
        return output
    except Exception as e:
        if _user.get("source") == "local_debug":
            return {
                "proyectos": [{"id": "PROY-001", "name": "Proyecto de Prueba"}],
                "fuentes": [], "componentes": [], "subcomponentes": [], "categorias": [], "responsables": []
            }
        raise HTTPException(status_code=500, detail=str(e))
@router.get("/solicitudes/pendientes/{cedula}")
def listar_solicitudes_pendientes(cedula: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """ Retorna las solicitudes pendientes para una cédula específica """
    try:
        from sqlalchemy import text
        query = text("""
            SELECT id, tipo_solicitud, id_financiacion_afectado, cedula, 
                   datos_anteriores, datos_nuevos, justificacion, 
                   solicitante, fecha_solicitud, estado
            FROM BSolicitud_Cambio 
            WHERE cedula = :ced AND estado = 'PENDIENTE'
            ORDER BY id DESC
        """)
        with engine.connect() as conn:
            res = conn.execute(query, {"ced": cedula}).mappings().all()
            
        output = []
        for r in res:
            d = dict(r)
            if d['fecha_solicitud']:
                d['fecha_solicitud'] = d['fecha_solicitud'].isoformat()
            output.append(d)
        return output
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
