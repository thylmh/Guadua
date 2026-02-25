import calendar
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.security import get_current_user, require_role
from app.core.database import engine, getconn, get_db
from app.core.constants import PAGO_EXPR
from app.models.schemas import UserWhitelist, Incremento, PosicionSchema
from app.core.utils import to_date
# Use the optimized service
from app.services.payroll_service_optimized import mensualizar_base_30_optimized as mensualizar_base_30, calculate_yearly_projections

router = APIRouter()

def normalize_ced(v):
    if v is None: return ""
    s = str(v).strip()
    if s.endswith('.0'): s = s[:-2]
    return s





@router.get("/dashboard-global")
def get_dashboard_global(anio: Optional[int] = None, user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin", "financiero", "user", "talento", "nomina"])
    try:
        curr_year = anio if anio else datetime.now().year
        # 1. Fetch Basic Data
        q_sw = text("""
            SELECT c.cedula, 
                   CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) AS nombre_completo,
                   p.Planta, p.Direccion, p.Base_Fuente
            FROM BContrato c
            LEFT JOIN BData d ON c.cedula = d.cedula
            LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
            WHERE UPPER(c.estado) LIKE 'ACTIVO%'
        """)
        
        q_tramos = text("""
            SELECT f.id_financiacion, f.cedula, f.id_proyecto, f.salario_base, f.fecha_inicio, f.fecha_fin, f.id_contrato,
                   p.cargo, p.banda, p.familia, p.IDPosicion AS posicion_c, p.Direccion, p.Planta, p.Base_Fuente, c.atep, c.gerencia,
                   c.estado, c.fecha_terminacion_real,
                   CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) AS nombre_completo
            FROM BFinanciacion f
            JOIN BContrato c ON f.id_contrato = c.id_contrato
            LEFT JOIN BData d ON c.cedula = d.cedula
            LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
            WHERE f.fecha_inicio <= :year_end 
              AND f.fecha_fin >= :year_start
        """)

        with engine.connect() as conn:
            active_emps = conn.execute(q_sw).mappings().all()
            incs_rows = conn.execute(text("SELECT * FROM BIncremento")).mappings().all()
            incrementos = {int(r["anio"]): dict(r) for r in incs_rows}
            
            # Find years that actually have financing data
            q_years = text("SELECT DISTINCT YEAR(fecha_inicio) as y FROM BFinanciacion UNION SELECT DISTINCT YEAR(fecha_fin) as y FROM BFinanciacion")
            db_years = {r[0] for r in conn.execute(q_years).fetchall() if r[0]}
            # Intersect with incrementos to ensure we have calculation rules for those years
            available_years = sorted([y for y in db_years if y in incrementos])
            
            # Fallback to current and next year if nothing found
            if not available_years:
                available_years = [datetime.now().year, datetime.now().year + 1]
            tramos_raw = conn.execute(q_tramos, {
                "year_start": f"{curr_year}-01-01",
                "year_end": f"{curr_year}-12-31"
            }).mappings().all()
            proy_names = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_proyectos UNION SELECT codigo, nombre FROM dim_proyectos_otros")).mappings().all()}
            
        # 2. Process Statistics
        active_emp_map_stats = {normalize_ced(r["cedula"]): r["nombre_completo"] for r in active_emps}
        total_active_count = len(active_emp_map_stats)
        
        dist_planta_total = {}
        dist_direccion_total = {}
        for r in active_emps:
            p = r.get("Base_Fuente") or "Proyectos" # SWAPPED Planta for Base_Fuente
            dist_planta_total[p] = dist_planta_total.get(p, 0) + 1
            dir_ = r["Direccion"] or "Sin definir"
            dist_direccion_total[dir_] = dist_direccion_total.get(dir_, 0) + 1

        # 3. Monthly Calculation (Source of Truth)
        tramos_list = []
        inconsistency_alerts = []
        for r in tramos_raw:
            tr = dict(r)
            est = (tr.get("estado") or "").upper()
            term_real = to_date(tr.get("fecha_terminacion_real"))
            tr_fin_orig = to_date(tr["fecha_fin"])
            
            if not est.startswith("ACTIVO"):
                if term_real:
                    if tr_fin_orig > term_real:
                        tr["fecha_fin"] = term_real
                        inconsistency_alerts.append({
                            "cedula": tr["cedula"],
                            "nombre": tr["nombre_completo"],
                            "id_fin": tr["id_financiacion"],
                            "tipo": "Tramo Excede Retiro",
                            "msg": f"Terminó {term_real}, tramo iba hasta {tr_fin_orig}"
                        })
                else:
                    # Inactive without term date - likely should not be counted at all or flagged
                    inconsistency_alerts.append({
                        "cedula": tr["cedula"],
                        "nombre": tr["nombre_completo"],
                        "id_fin": tr["id_financiacion"],
                        "tipo": "Inactivo sin Fecha",
                        "msg": "El contrato está inactivo pero no tiene fecha de terminación real."
                    })

            for k, v in tr.items():
                if hasattr(v, '__float__') and v is not None: tr[k] = float(v)
            
            # Add project name for correct labeling in matrix
            pid = tr.get("id_proyecto")
            tr["proyecto"] = proy_names.get(pid, pid)
            
            tramos_list.append(tr)

        # Create a lookup for meta-data because mensualizar_base_30 strips it
        meta_lookup = {tr["id_financiacion"]: {"Direccion": tr.get("Direccion"), "Planta": tr.get("Planta")} for tr in tramos_list}
        
        # 3. Aggregation (Unified Calculation)
        proj_calc = calculate_yearly_projections(tramos_list, incrementos, curr_year)
        mensualizado = proj_calc["mensualizado_raw"]
        costo_vigencia_total = proj_calc["total"]
        
        # 4. Fetch ALL Active Contracts metadata
        q_contracts = text("""
            SELECT c.cedula, 
                   CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) AS nombre_completo, 
                   c.fecha_terminacion
            FROM BContrato c
            LEFT JOIN BData d ON c.cedula = d.cedula
            WHERE UPPER(c.estado) LIKE 'ACTIVO%'
        """)
        with engine.connect() as conn:
            active_contracts_rows = conn.execute(q_contracts).mappings().all()
            
        active_emp_map = {}
        contract_ends = {}
        active_cedulas_set = set()
        dist_planta_fin = proj_calc["dist_planta_fin"]
        
        # 4. Global Counts (Coverage)
        dist_planta_total = {}
        dist_direccion_total = {}
        total_active_count = len(active_emps)
        for r in active_emps:
            p = r.get("Base_Fuente") or "Proyectos" # SWAPPED Planta for Base_Fuente
            dist_planta_total[p] = dist_planta_total.get(p, 0) + 1
            dir_ = r["Direccion"] or "Sin definir"
            dist_direccion_total[dir_] = dist_direccion_total.get(dir_, 0) + 1
            
        # 5. Financial available years
        # Use the years found in DB increments/financing (restored for multi-year view)
        if not available_years: 
             available_years = sorted(list(set(tr["fecha_inicio"].year for tr in tramos_list if tr.get("fecha_inicio"))))
        if not available_years: available_years = [curr_year]
        
        for r in active_contracts_rows:
            ced = normalize_ced(r["cedula"])
            if not ced: continue
            active_cedulas_set.add(ced)
            active_emp_map[ced] = r["nombre_completo"] or f"ID: {ced}"
            contract_ends[ced] = to_date(r["fecha_terminacion"])

        # 5. Build Financing Map (Days per person per month)
        # We use the 'mensualizado' results already calculated for the matrix
        days_per_month_cedula = {} 
        for m_group in mensualizado:
            # Important: mensualizar_base_30_optimized returns "YYYY-MM-01" as string
            am = m_group["anioMes"]
            if am not in days_per_month_cedula:
                days_per_month_cedula[am] = {}
            for d in m_group["detalle"]:
                ced = normalize_ced(d["cedula"])
                days_per_month_cedula[am][ced] = days_per_month_cedula[am].get(ced, 0) + (d.get("dias") or 0)

        # 6. Detect Sin Financiación (Gap vs Contrato)
        # Calculate max financing date per employee
        financing_max_dates = {}
        for r in tramos_list:
            ced = normalize_ced(r["cedula"])
            f_end = to_date(r["fecha_fin"])
            if not f_end: continue
            if ced not in financing_max_dates or f_end > financing_max_dates[ced]:
                financing_max_dates[ced] = f_end
                
        missing_list = []
        fiscal_year_end = date(curr_year, 12, 31)

        for ced in active_cedulas_set:
            cont_end = contract_ends.get(ced)
            fin_end = financing_max_dates.get(ced)
            
            is_missing = False
            curr_msg = ""
            
            # Case 1: No financing at all in this period
            if not fin_end:
                 is_missing = True
                 curr_msg = "Sin tramos registrados"
            # Case 2: Short financing (ends before contract AND before year end)
            # Logic: If financing ends e.g. Oct 30, but contract goes to Dec 31 -> ALERT
            elif cont_end and fin_end < cont_end and fin_end < fiscal_year_end:
                 is_missing = True
                 curr_msg = f"Financia hasta {fin_end}"
            
            if is_missing:
                missing_list.append({
                    "cedula": ced, 
                    "nombre": active_emp_map.get(ced, "Desconocido"),
                    "detalle": curr_msg
                })


        # 7. Detect Overlaps
        overlap_alerts = []
        # Group all tramos by cedula
        tramos_by_cedula = {}
        for r in tramos_list:
            ced = r["cedula"]
            if ced not in tramos_by_cedula: tramos_by_cedula[ced] = []
            tramos_by_cedula[ced].append(r)
        
        for ced, em_tramos in tramos_by_cedula.items():
            if len(em_tramos) < 2: continue
            
            sorted_tramos = sorted(em_tramos, key=lambda x: to_date(x["fecha_inicio"]) or date.min)
            has_overlap = False
            for i in range(len(sorted_tramos) - 1):
                curr_end = to_date(sorted_tramos[i]["fecha_fin"])
                next_start = to_date(sorted_tramos[i+1]["fecha_inicio"])
                
                if curr_end and next_start and curr_end >= next_start:
                    has_overlap = True
                    break
            
            if has_overlap:
                overlap_alerts.append({
                    "cedula": ced,
                    "nombre": active_emp_map.get(ced, "Desconocido")
                })

        # dist_planta_fin is now provided by proj_calc["dist_planta_fin"]
        # dist_direccion_fin is also provided by proj_calc
        dist_direccion_fin = proj_calc.get("dist_direccion_fin") or {}
        
        dist_planta_final = [{"label": p, "total": dist_planta_total.get(p, 0), "financiado": dist_planta_fin.get(p, 0), "value": dist_planta_total.get(p, 0)} for p in dist_planta_total.keys()]
        dist_direccion_final = [{"label": d, "total": dist_direccion_total.get(d, 0), "financiado": dist_direccion_fin.get(d, 0), "value": dist_direccion_total.get(d, 0)} for d in dist_direccion_total.keys()]
        
        lista_matriz = sorted(proj_calc["matrix_proyectos"], key=lambda x: x["total"], reverse=True)
        
        # 8. New Matrix: Trabajadores Sin Financiación (A01/A02) vs Planta
        sin_finan_matrix = {} # planta -> [12 months heads: set()]
        sin_finan_cost_matrix = {} # planta -> [12 months cost: float]
        prefix_val = f"{curr_year}-"
        for m_group in mensualizado:
            if not m_group["anioMes"].startswith(prefix_val): continue
            m_idx = int(m_group["anioMes"].split("-")[1]) - 1
            for d in m_group["detalle"]:
                pid = d["id_proyecto"]
                if pid in ("A01", "A02"):
                    planta = d.get("Planta") or "Sin Definir"
                    if planta not in sin_finan_matrix:
                        sin_finan_matrix[planta] = [set() for _ in range(12)]
                        sin_finan_cost_matrix[planta] = [0.0 for _ in range(12)]
                    sin_finan_matrix[planta][m_idx].add(d["cedula"])
                    sin_finan_cost_matrix[planta][m_idx] += d["valor"]
        
        matrix_sin_finan = []
        for planta, months_sets in sin_finan_matrix.items():
            matrix_sin_finan.append({
                "label": planta,
                "months": [len(s) for s in months_sets],
                "total": len(set().union(*months_sets))
            })

        matrix_costo_sin_finan = []
        for planta, costs in sin_finan_cost_matrix.items():
            matrix_costo_sin_finan.append({
                "label": planta,
                "months": costs,
                "total": sum(costs)
            })

        return {
            "ok": True,
            "available_years": available_years,
            "kpis": {
                "n_empleados": total_active_count, 
                "costo_total": costo_vigencia_total, 
                "missing_financing_count": len(missing_list),
                "inconsistency_count": len(inconsistency_alerts)
            },
            "missing_financing": missing_list,
            "overlap_alerts": overlap_alerts,
            "inconsistency_alerts": inconsistency_alerts,
            "dist_planta": sorted(dist_planta_final, key=lambda x: x["total"], reverse=True),
            "dist_direccion": sorted(dist_direccion_final, key=lambda x: x["total"], reverse=True),
            "dist_direccion_costo": sorted([{"label": k, "value": v} for k, v in proj_calc["dist_dir_costo"].items()], key=lambda x: x["value"], reverse=True),
            "dist_proyectos": [{"label": m["label"], "value": m["total"]} for m in lista_matriz if not m["label"].startswith("⚠")][:10],
            "matrix_proyectos": lista_matriz,
            "matrix_sin_finan": sorted(matrix_sin_finan, key=lambda x: x["total"], reverse=True),
            "matrix_costo_sin_finan": sorted(matrix_costo_sin_finan, key=lambda x: x["total"], reverse=True)
        }
    except Exception as e:
        # Fallback for Local Debug without DB
        if user.get("source") == "local_debug":
            return {
                "ok": True,
                "kpis": {"n_empleados": 120, "costo_total": 4500000000.0, "missing_financing_count": 5},
                "missing_financing": [
                    {"cedula": "123", "nombre": "Empleado Prueba 1"},
                    {"cedula": "456", "nombre": "Empleado Prueba 2"}
                ],
                "overlap_alerts": [],
                "dist_planta": [{"label": "Planta", "total": 80, "financiado": 75, "value": 80}, {"label": "Proyectos", "total": 40, "financiado": 35, "value": 40}],
                "dist_direccion": [{"label": "Dirección General", "total": 120, "financiado": 115, "value": 120}],
                "dist_direccion_costo": [{"label": "Dirección General", "value": 4500000000.0}],
                "dist_proyectos": [{"label": "Proyecto Mock", "value": 1000000000.0}],
                "matrix_proyectos": [
                    {
                        "id_proyecto": "PROY-001",
                        "nombre_proyecto": "Proyecto de Desarrollo Local",
                        "componente": "General",
                        "label": "PROY-001 - Proyecto Mock",
                        "months": [1000000.0] * 12,
                        "total": 12000000.0
                    }
                ],
                "matrix_sin_finan": [
                    {
                        "label": "Planta",
                        "months": [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
                        "total": 5
                    }
                ]
            }
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reporte-detallado")
def get_reporte_detallado(direccion: Optional[str] = None, gerencia: Optional[str] = None, proyecto: Optional[str] = None, search: Optional[str] = None, anio: Optional[int] = None, mes: Optional[int] = None, user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin", "financiero", "user", "talento", "nomina"])
    try:
        filters = []; params = {}
        if direccion: filters.append("p.Direccion = :direccion"); params["direccion"] = direccion
        if gerencia:
            if gerencia == "Grupo de Trabajo": filters.append("(c.gerencia IS NULL OR c.gerencia = '' OR c.gerencia = ' ')")
            else: filters.append("c.gerencia = :gerencia"); params["gerencia"] = gerencia
        if proyecto: filters.append("f.id_proyecto LIKE :proyecto"); params["proyecto"] = f"%{proyecto}%"
        if search: filters.append("(c.cedula LIKE :search OR CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) LIKE :search)"); params["search"] = f"%{search}%"
        where_clause = (" AND " + " AND ".join(filters)) if filters else ""
        year_val = int(anio) if anio else datetime.now().year
        if mes:
            m_val = int(mes); start_d = date(year_val, m_val, 1)
            end_d = date(year_val, 12, 31) if m_val == 12 else (date(year_val, m_val + 1, 1) - date.fromordinal(1).replace(year=1, month=1, day=2) + date.fromordinal(1)).replace(year=year_val, month=m_val) # simplified below
            from datetime import timedelta
            end_d = (date(year_val, m_val + 1, 1) if m_val < 12 else date(year_val + 1, 1, 1)) - timedelta(days=1)
            params["year_start"] = start_d; params["year_end"] = end_d
        else:
            params["year_start"] = date(year_val, 1, 1); params["year_end"] = date(year_val, 12, 31)
        query_sql = text(f"SELECT f.id_financiacion, f.cedula, f.salario_base, f.fecha_inicio, f.fecha_fin, f.id_proyecto, f.rubro, f.id_fuente, f.id_componente, f.id_subcomponente, f.id_categoria, f.id_responsable, c.atep, c.gerencia, c.fecha_terminacion, c.estado, c.fecha_terminacion_real, p.cargo, p.banda, p.familia, p.IDPosicion AS posicion_c, p.Direccion, p.Planta, p.Tipo_planta, p.Base_Fuente, CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) AS nombre_completo, c.id_contrato FROM BFinanciacion f JOIN BContrato c ON f.id_contrato = c.id_contrato JOIN BData d ON c.cedula = d.cedula LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion WHERE f.fecha_fin >= :year_start AND f.fecha_inicio <= :year_end {where_clause}")
        with engine.connect() as conn:
            rows = conn.execute(query_sql, params).mappings().all(); incs_rows = conn.execute(text("SELECT * FROM BIncremento")).mappings().all()
            incrementos = {int(r["anio"]): dict(r) for r in incs_rows}
        tramos_data = []; fin_info_map = {}
        for r in rows:
            d = dict(r)
            est = (d.get("estado") or "").upper()
            term_real = to_date(d.get("fecha_terminacion_real"))
            if not est.startswith("ACTIVO") and term_real:
                tr_fin = to_date(d["fecha_fin"])
                if tr_fin > term_real:
                    d["fecha_fin"] = term_real
            for k, v in d.items():
                if hasattr(v, '__float__') and v is not None: d[k] = float(v)
            tramos_data.append(d); fin_info_map[d["id_financiacion"]] = d
        mensualizado_list = mensualizar_base_30(tramos_data, incrementos); emp_matrix = {}
        target_year = year_val
        for item in mensualizado_list:
            anio_mes = item["anioMes"]
            if not anio_mes.startswith(str(target_year)): continue
            m_idx = int(anio_mes.split("-")[1]) - 1
            for det in item["detalle"]:
                info = fin_info_map.get(det["id"])
                if not info: continue
                key = f"{info['cedula']}-{info['id_proyecto']}"
                if key not in emp_matrix: emp_matrix[key] = {"cedula": info["cedula"], "nombre": info["nombre_completo"], "direccion": info["Direccion"], "gerencia": info["gerencia"], "planta": info.get("Planta"), "tipo_planta": info.get("Tipo_planta"), "base_fuente": info.get("Base_Fuente"), "id_proyecto": info["id_proyecto"], "nombre_proyecto": info["id_proyecto"], "fecha_fin": info["fecha_terminacion"], "months": [0.0]*12, "total": 0.0}
                if 0 <= m_idx < 12: emp_matrix[key]["months"][m_idx] += det["valor"]; emp_matrix[key]["total"] += det["valor"]
        with engine.connect() as conn:
            proy_names = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_proyectos UNION SELECT codigo, nombre FROM dim_proyectos_otros")).mappings().all()}
        for v in emp_matrix.values():
            if v["id_proyecto"] in proy_names: v["nombre_proyecto"] = f"{v['id_proyecto']} - {proy_names[v['id_proyecto']]}"
        lista_emps = sorted(list(emp_matrix.values()), key=lambda x: (x["nombre"], x["id_proyecto"]))
        return {"ok": True, "data": lista_emps}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/flujo-caja")
def get_flujo_caja(anio: Optional[int] = None, user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin", "financiero", "user", "talento", "nomina"])
    try:
        target_year = anio if anio else datetime.now().year
        # Optimized query with date filters to reduce processing
        query_sql = text("""
            SELECT f.*, c.atep, c.gerencia, c.id_contrato, c.fecha_ingreso, c.estado, c.fecha_terminacion_real, 
                   p.cargo, p.banda, p.familia, p.IDPosicion AS posicion_c, p.Direccion, 
                   CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) AS nombre_completo 
            FROM BFinanciacion f 
            JOIN BContrato c ON f.id_contrato = c.id_contrato 
            JOIN BData d ON c.cedula = d.cedula 
            LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
            WHERE f.fecha_inicio <= :year_end AND f.fecha_fin >= :year_start
        """)
        with engine.connect() as conn:
            rows = conn.execute(query_sql, {
                "year_start": f"{target_year}-01-01",
                "year_end": f"{target_year}-12-31"
            }).mappings().all()
            incs_rows = conn.execute(text("SELECT * FROM BIncremento")).mappings().all()
            incrementos = {int(r["anio"]): dict(r) for r in incs_rows}
            # Fetch Mappings
            proy_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_proyectos UNION SELECT codigo, nombre FROM dim_proyectos_otros")).mappings().all()}
            fuente_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_fuentes")).mappings().all()}
            comp_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_componentes")).mappings().all()}
            sub_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_subcomponentes")).mappings().all()}
            cat_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_categorias")).mappings().all()}
            resp_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_responsables")).mappings().all()}

        tramos_data = []
        for r in rows:
            d = dict(r)
            est = (d.get("estado") or "").upper()
            term_real = to_date(d.get("fecha_terminacion_real"))
            if not est.startswith("ACTIVO") and term_real:
                tr_fin = to_date(d["fecha_fin"])
                if tr_fin > term_real:
                    d["fecha_fin"] = term_real
            for k, v in d.items():
                if hasattr(v, '__float__') and v is not None: d[k] = float(v)
            tramos_data.append(d)
        mensualizado_raw = mensualizar_base_30(tramos_data, incrementos); flujo_map = {}
        for m in mensualizado_raw:
            am = m["anioMes"]
            if not (am.startswith(str(target_year)) or am == f"{target_year + 1}-01-01"): continue
            m_date = datetime.strptime(am, "%Y-%m-%d").date()
            month_num = m_date.month
            if m_date.year > target_year: month_num = 13 # Jan Y+1 is the 13th period

            for d in m["detalle"]:
                key = (d["cedula"], d["proyecto"])
                if key not in flujo_map:
                    fi = d.get("fecha_ingreso"); hire_month = 0
                    if fi:
                        try: hire_month = datetime.strptime(fi[:10], "%Y-%m-%d").month if isinstance(fi, str) else fi.month
                        except: pass
                    
                    # Map Codes to Names
                    pid = d["proyecto"]
                    p_full = f"{pid} | {proy_map.get(pid, pid)}"
                    f_full = f"{d['fuente']} | {fuente_map.get(d['fuente'], d['fuente'])}" if d.get('fuente') else ""
                    c_full = f"{d['componente']} | {comp_map.get(d['componente'], d['componente'])}" if d.get('componente') else ""
                    s_full = f"{d['subcomponente']} | {sub_map.get(d['subcomponente'], d['subcomponente'])}" if d.get('subcomponente') else ""
                    ct_full = f"{d['categoria']} | {cat_map.get(d['categoria'], d['categoria'])}" if d.get('categoria') else ""
                    r_full = f"{d['responsable']} | {resp_map.get(d['responsable'], d['responsable'])}" if d.get('responsable') else ""

                    flujo_map[key] = {
                        "info": {
                            "cedula": d["cedula"], 
                            "nombre": d["nombre"], 
                            "id_proyecto": p_full, 
                            "contrato": d["contrato"], 
                            "rubro": d["rubro"], 
                            "fuente": f_full, 
                            "componente": c_full, 
                            "subcomponente": s_full, 
                            "categoria": ct_full, 
                            "responsable": r_full, 
                            "hire_month": hire_month,
                            "posicion_c": d.get("posicion_c", ""),
                            "cargo": d.get("cargo", ""),
                            "Direccion": d.get("Direccion", ""),
                            "gerencia": d.get("gerencia", "").replace("Gerencia de Centro", "Centro") if d.get("gerencia") else "Grupo de Trabajo"
                        }, 
                        "months": {}
                    }
                
                # Aggregate months instead of overwriting (in case of multiple tramos per month)
                if month_num not in flujo_map[key]["months"]:
                    flujo_map[key]["months"][month_num] = d
                else:
                    curr_d = flujo_map[key]["months"][month_num]
                    # Update value
                    curr_d["valor"] += d.get("valor", 0)
                    # Update concepts
                    for concept, val in d.get("conceptos", {}).items():
                        curr_d["conceptos"][concept] = curr_d["conceptos"].get(concept, 0) + val
        final_report = {m: {"anioMes": f"{target_year}-{str(m).zfill(2)}-01", "total": 0, "detalle": []} for m in range(1, 14)}
        final_report[13]["anioMes"] = f"{target_year + 1}-01-01"
        for (ced, proy), data in flujo_map.items():
            hire_month = data["info"].get("hire_month", 0)
            
            # Safe access to concepts by month
            def get_concepts(m):
                m_data = data["months"].get(m)
                return m_data["conceptos"] if (m_data and "conceptos" in m_data) else {
                    "salario_mes": 0, "aux_transporte": 0, "dotacion": 0, "salud": 0, "pension": 0, 
                    "arl": 0, "ccf": 0, "sena": 0, "icbf": 0, "primas": 0, "sueldo_vacaciones": 0, 
                    "prima_vacaciones": 0, "cesantias": 0, "i_cesantias": 0
                }

            # Pre-calculate totals for payoffs
            primas_1 = sum(get_concepts(m)["primas"] for m in range(1, 7))
            primas_2 = sum(get_concepts(m)["primas"] for m in range(7, 14)) # 7 to 13
            pvac_1 = sum(get_concepts(m)["prima_vacaciones"] for m in range(1, 7))
            pvac_2 = sum(get_concepts(m)["prima_vacaciones"] for m in range(7, 14))
            ces = sum(get_concepts(m)["cesantias"] for m in range(1, 14))
            ices = sum(get_concepts(m)["i_cesantias"] for m in range(1, 14))
            svac = sum(get_concepts(m)["sueldo_vacaciones"] for m in range(1, 14))

            for m_idx in range(1, 14):
                m_data = data["months"].get(m_idx)
                c = get_concepts(m_idx)
                
                # Monthly recurring flow
                flow_val = (c["salario_mes"] + c["aux_transporte"] + c["dotacion"] + 
                           c["salud"] + c["pension"] + c["arl"] + c["ccf"] + c["sena"] + c["icbf"])
                
                # Add specific payoffs to specific payment months
                if m_idx == 5: flow_val += pvac_1 # May
                if m_idx == 6: flow_val += primas_1 # June
                if m_idx == 11: flow_val += pvac_2 # Nov
                if m_idx == hire_month: flow_val += svac # Anniversary month
                if m_idx == 12: flow_val += (primas_2 + ces + ices) # Dec

                if flow_val > 0 or m_data:
                    det = data["info"].copy()
                    det["valor"] = flow_val
                    # Ensure both id_proyecto and proyecto are present/mapped for FE grouping
                    det["id_proyecto"] = data["info"]["id_proyecto"]
                    det["proyecto"] = data["info"]["id_proyecto"]
                    det["nombre_proyecto"] = data["info"]["id_proyecto"]

                    # Set monthly-specific concepts for detail modal
                    det["conceptos"] = {k: 0 for k in c.keys()}
                    # Only map what we actually pay this month in the flow
                    det["conceptos"].update({k: v for k, v in c.items() if k not in ["primas", "prima_vacaciones", "cesantias", "i_cesantias", "sueldo_vacaciones"]})
                    
                    if m_idx == 5: det["conceptos"]["prima_vacaciones"] = pvac_1
                    if m_idx == 6: det["conceptos"]["primas"] = primas_1
                    if m_idx == 11: det["conceptos"]["prima_vacaciones"] = pvac_2
                    if m_idx == hire_month: det["conceptos"]["sueldo_vacaciones"] = svac
                    if m_idx == 12: 
                        det["conceptos"]["primas"] += primas_2
                        det["conceptos"]["cesantias"] = ces
                        det["conceptos"]["i_cesantias"] = ices
                    
                    final_report[m_idx]["detalle"].append(det)
                    final_report[m_idx]["total"] += flow_val

        return {"ok": True, "data": sorted(final_report.values(), key=lambda x: x["anioMes"])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/mensualizado-global")
def get_mensualizado_global(user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin", "financiero", "talento", "nomina"])
    try:
        query_sql = text("SELECT f.*, c.atep, c.gerencia, c.id_contrato, c.estado, c.fecha_terminacion_real, p.cargo, p.banda, p.familia, p.IDPosicion AS posicion_c, p.Direccion, CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) AS nombre_completo FROM BFinanciacion f JOIN BContrato c ON f.id_contrato = c.id_contrato JOIN BData d ON c.cedula = d.cedula LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion")
        with engine.connect() as conn:
            rows = conn.execute(query_sql).mappings().all()
            incs_rows = conn.execute(text("SELECT * FROM BIncremento")).mappings().all()
            incrementos = {int(r["anio"]): dict(r) for r in incs_rows}
            
            # Fetch Mappings
            proy_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_proyectos UNION SELECT codigo, nombre FROM dim_proyectos_otros")).mappings().all()}
            fuente_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_fuentes")).mappings().all()}
            comp_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_componentes")).mappings().all()}
            sub_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_subcomponentes")).mappings().all()}
            cat_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_categorias")).mappings().all()}
            resp_map = {r["codigo"]: r["nombre"] for r in conn.execute(text("SELECT codigo, nombre FROM dim_responsables")).mappings().all()}

        tramos_data = []
        for r in rows:
            d = dict(r)
            est = (d.get("estado") or "").upper()
            term_real = to_date(d.get("fecha_terminacion_real"))
            if not est.startswith("ACTIVO") and term_real:
                tr_fin = to_date(d["fecha_fin"])
                if tr_fin > term_real:
                    d["fecha_fin"] = term_real
            for k, v in d.items():
                if hasattr(v, '__float__') and v is not None: d[k] = float(v)
            tramos_data.append(d)
        
        mensualizado_raw = mensualizar_base_30(tramos_data, incrementos)
        
        # Apply Mappings "Code | Name"
        curr_year = datetime.now().year
        next_jan = f"{curr_year + 1}-01-01"
        
        filtered_data = [m for m in mensualizado_raw if m["anioMes"].startswith(str(curr_year)) or m["anioMes"] == next_jan]
        
        for m in filtered_data:
            for d in m["detalle"]:
                if d.get("id_proyecto"): d["id_proyecto"] = f"{d['id_proyecto']} | {proy_map.get(d['id_proyecto'], d['id_proyecto'])}"
                if d.get("fuente"): d["fuente"] = f"{d['fuente']} | {fuente_map.get(d['fuente'], d['fuente'])}"
                if d.get("componente"): d["componente"] = f"{d['componente']} | {comp_map.get(d['componente'], d['componente'])}"
                if d.get("subcomponente"): d["subcomponente"] = f"{d['subcomponente']} | {sub_map.get(d['subcomponente'], d['subcomponente'])}"
                if d.get("categoria"): d["categoria"] = f"{d['categoria']} | {cat_map.get(d['categoria'], d['categoria'])}"
                if d.get("responsable"): d["responsable"] = f"{d['responsable']} | {resp_map.get(d['responsable'], d['responsable'])}"

        return {"ok": True, "data": filtered_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/incrementos")
def get_incrementos(user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin"])
    try:
        query = text("SELECT anio, smlv, transporte, dotacion, porcentaje_aumento FROM BIncremento ORDER BY anio DESC")
        with engine.connect() as conn: return [dict(r) for r in conn.execute(query).mappings().all()]
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@router.post("/incrementos")
def upsert_incremento(data: Incremento, user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin"])
    try:
        query = text("INSERT INTO BIncremento (id, anio, smlv, transporte, dotacion, porcentaje_aumento) VALUES (:id, :anio, :smlv, :transporte, :dotacion, :porc) ON DUPLICATE KEY UPDATE smlv = :smlv, transporte = :transporte, dotacion = :dotacion, porcentaje_aumento = :porc")
        with engine.begin() as conn: conn.execute(query, {"id": str(data.anio), "anio": data.anio, "smlv": data.smlv, "transporte": data.transporte, "dotacion": data.dotacion, "porc": data.porcentaje_aumento})
        return {"ok": True, "mensaje": "Incremento actualizado"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@router.delete("/incrementos/{anio}")
def delete_incremento(anio: int, user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin"])
    try:
        query = text("DELETE FROM BIncremento WHERE anio = :anio")
        with engine.begin() as conn: conn.execute(query, {"anio": anio})
        return {"ok": True, "mensaje": "Registro eliminado"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# Redundant endpoint removed, consolidated into get_reporte_detallado (359)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/catalogos")
def get_catalogos(user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin", "financiero", "talento", "nomina"])
    try:
        with engine.connect() as conn:
            mapping = conn.execute(text("SELECT DISTINCT p.Direccion, c.gerencia FROM BContrato c JOIN BPosicion p ON c.posicion = p.IDPosicion WHERE c.estado LIKE 'Activo' ORDER BY p.Direccion, c.gerencia")).mappings().all()
            proys = [{"id": r["id_proyecto"], "name": r["nombre"]} for r in conn.execute(text("SELECT DISTINCT f.id_proyecto, COALESCE(dp.nombre, dpo.nombre, f.id_proyecto) as nombre FROM BFinanciacion f JOIN BContrato c ON f.id_contrato = c.id_contrato LEFT JOIN dim_proyectos dp ON f.id_proyecto = dp.codigo LEFT JOIN dim_proyectos_otros dpo ON f.id_proyecto = dpo.codigo WHERE c.estado LIKE 'Activo' ORDER BY nombre")).mappings().all()]
        normalized = [{"Direccion": r["Direccion"], "gerencia": r["gerencia"] if r["gerencia"] and r["gerencia"].strip() else "Grupo de Trabajo"} for r in mapping]
        dirs = sorted(list({r["Direccion"] for r in normalized if r["Direccion"]})); gers = sorted(list({r["gerencia"] for r in normalized if r["gerencia"]}))
        return {"ok": True, "direcciones": dirs, "gerencias": gers, "mapping": normalized, "proyectos": proys}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@router.get("/posiciones-catalogos")
def get_posiciones_catalogos(user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin", "talento", "nomina"])
    try:
        fields = ["Familia", "Cargo", "Rol", "Banda", "Planta", "Tipo_planta", "Base_Fuente"]
        catalogos = {}
        with engine.connect() as conn:
            # 1. Flat catalogs
            for field in fields:
                q = text(f"SELECT DISTINCT {field} FROM BPosicion WHERE {field} IS NOT NULL AND {field} != ''")
                rows = conn.execute(q).scalars().all()
                catalogos[field.lower()] = sorted([str(r) for r in rows])
            
            # 2. Hierarchy Mapping 1: Structure (Direccion -> Gerencia -> Area -> Subarea)
            q_h1 = text("SELECT DISTINCT Direccion, Gerencia, Area, Subarea FROM BPosicion")
            h1 = conn.execute(q_h1).mappings().all()
            catalogos["hierarchy_structure"] = [dict(r) for r in h1]

            # 3. Hierarchy Mapping 2: Jobs (Cargo -> Rol -> Familia -> Banda)
            q_h2 = text("SELECT DISTINCT Cargo, Rol, Familia, Banda FROM BPosicion")
            h2 = conn.execute(q_h2).mappings().all()
            catalogos["hierarchy_jobs"] = [dict(r) for r in h2]
            
            # 3. Special for P_Jefe: All Positions with occupant name if active
            q_jefes = text("""
                SELECT p.IDPosicion, p.Cargo, 
                       CONCAT_WS(' ', d.p_nombre, d.p_apellido) as nombre
                FROM BPosicion p
                LEFT JOIN BContrato c ON p.IDPosicion = c.posicion AND UPPER(c.estado) LIKE 'ACTIVO%'
                LEFT JOIN BData d ON c.cedula = d.cedula
                ORDER BY p.Cargo ASC
            """)
            jefes = conn.execute(q_jefes).mappings().all()
            catalogos["p_jefe"] = [dict(r) for r in jefes]
            
            # 4. Generate next ID (internal suggestion)
            import random, string
            existing_ids = set(conn.execute(text("SELECT IDPosicion FROM BPosicion")).scalars().all())
            
            def gen_id():
                chars = string.ascii_lowercase + string.digits
                for _ in range(100): # try 100 times
                    new_id = "IHPO_" + "".join(random.choices(chars, k=3))
                    if new_id not in existing_ids:
                        return new_id
                return "IHPO_err"
            
            catalogos["next_id"] = gen_id()
            
        return {"ok": True, "catalogos": catalogos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/vacantes")
def get_vacantes(user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin", "talento", "nomina"])
    try:
        query = text("""
            SELECT IDPosicion as id, Salario as salario, Cargo as cargo, Rol as rol, Banda as banda, 
                   Familia as familia, Direccion as direccion, Gerencia as gerencia, Area as area, 
                   Planta as planta, Tipo_planta as tipo_planta, Base_Fuente as base_fuente, Estado as estado,
                   P_Jefe as p_jefe,
                   (SELECT COUNT(*) FROM BContrato WHERE posicion = BPosicion.IDPosicion) as contract_count
            FROM BPosicion
            WHERE UPPER(Estado) = 'VACANTE'
            ORDER BY Cargo ASC
        """)
        with engine.connect() as conn:
            rows = conn.execute(query).mappings().all()
            res = []
            for r in rows:
                d = dict(r)
                if d.get("salario") is not None: d["salario"] = float(d["salario"])
                res.append(d)
            return {"ok": True, "vacantes": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/consulta-vacante/{id_posicion}")
def get_vacancy_detail(id_posicion: str, user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin", "talento", "nomina"])
    try:
        query = text("""
            SELECT IDPosicion as id, Salario as salario, Cargo as cargo, Rol as rol, Banda as banda, 
                   Familia as familia, Direccion as direccion, Gerencia as gerencia, Area as area, 
                   Planta as planta, Tipo_planta as tipo_planta, Base_Fuente as base_fuente, Estado as estado,
                   P_Jefe as p_jefe, Observacion as observacion, Usuario as usuario, Modificacion as modificacion
            FROM BPosicion
            WHERE IDPosicion = :id_posicion
            LIMIT 1
        """)
        with engine.connect() as conn:
            row = conn.execute(query, {"id_posicion": id_posicion}).mappings().first()
            if not row:
                raise HTTPException(status_code=404, detail="Posición no encontrada")
            
            d = dict(row)
            if d.get("salario") is not None: d["salario"] = float(d["salario"])
            return {"ok": True, "cabecera": d}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/proyectar-vacante/{id_posicion}")
def proyectar_vacante(
    id_posicion: str,
    fecha_inicio: str,
    fecha_fin: str,
    salario: float,
    user: Dict[str, Any] = Depends(get_current_user)
):
    require_role(user, ["admin", "talento", "nomina"])
    try:
        # 1. Get position metadata
        q_pos = text("""
            SELECT IDPosicion as id, Cargo as cargo, Rol as rol, Banda as banda, 
                   Familia as familia, Direccion as direccion, Gerencia as gerencia, 
                   Area as area, Planta as planta, Tipo_planta as tipo_planta
            FROM BPosicion WHERE IDPosicion = :id_posicion LIMIT 1
        """)
        # 2. Get ARL (atep) from last contract if available, else default
        q_atep = text("SELECT atep FROM BContrato WHERE posicion = :id_posicion ORDER BY fecha_ingreso DESC LIMIT 1")
        
        with engine.connect() as conn:
            pos = conn.execute(q_pos, {"id_posicion": id_posicion}).mappings().first()
            if not pos:
                raise HTTPException(status_code=404, detail="Posición no encontrada")
            
            atep_row = conn.execute(q_atep, {"id_posicion": id_posicion}).mappings().first()
            atep = float(atep_row["atep"]) if atep_row and atep_row["atep"] else 0.00522 # Default Risk Class 1
            
            # 3. Fetch Increments
            incs_rows = conn.execute(text("SELECT * FROM BIncremento")).mappings().all()
            incrementos = {int(r["anio"]): dict(r) for r in incs_rows}
            
        # 4. Create Mock Tramo
        mock_tramo = {
            "id_financiacion": 0,
            "id_contrato": "PROYECTO",
            "cedula": "VACANTE",
            "fecha_inicio": to_date(fecha_inicio),
            "fecha_fin": to_date(fecha_fin),
            "id_proyecto": "PROYECTO_PROYECCION",
            "salario_base": salario,
            "cargo": pos["cargo"],
            "banda": pos["banda"],
            "familia": pos["familia"],
            "atep": atep,
            "posicion_c": id_posicion
        }
        
        # 5. Run mensualization
        mensualizado = mensualizar_base_30([mock_tramo], incrementos)
        
        # 6. Calculate summary
        total_periodo = sum(m.get("total", 0) for m in mensualizado)
        
        return {
            "ok": True,
            "projection": mensualizado,
            "summary": {
                "total": total_periodo,
                "meses": len(mensualizado),
                "promedio_mensual": total_periodo / len(mensualizado) if mensualizado else 0
            }
        }
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


from app.services.audit_service import AuditService

@router.post("/posiciones")
def create_posicion(pos: PosicionSchema, user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_role(user, ["admin"])
    audit = AuditService(db)
    try:
        query = text("""
            INSERT INTO BPosicion (IDPosicion, Salario, Familia, Cargo, Rol, Banda, 
                                 Direccion, Gerencia, Area, Subarea, Planta, 
                                 Tipo_planta, Base_Fuente, Estado, P_Jefe, Observacion, Usuario, Modificacion)
            VALUES (:id, :salario, :familia, :cargo, :rol, :banda, 
                    :direccion, :gerencia, :area, :subarea, :planta, 
                    :tipo_planta, :base_fuente, :estado, :p_jefe, :observacion, :usuario, NOW())
        """)
        
        with engine.begin() as conn:
            data = pos.model_dump() # Use field names (id, salario...) to match placeholders
            data["usuario"] = user.get("email")
            conn.execute(query, data)
            
        # Audit Log
        audit.log_event(
            actor_email=user['email'],
            module='Vacantes',
            action='CREATE',
            resource_id=pos.id,
            new_values=data,
            details=f"Creación de posición {pos.cargo}"
        )
        
        return {"ok": True, "message": "Posición creada exitosamente"}
    except Exception as e:
        if "Duplicate entry" in str(e):
            raise HTTPException(status_code=400, detail="El ID de Posición ya existe.")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/posiciones/{id_posicion}")
def update_posicion(id_posicion: str, pos: PosicionSchema, user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_role(user, ["admin"])
    audit = AuditService(db)
    try:
        # Check if position is assigned to any contract
        check_q = text("SELECT COUNT(*) FROM BContrato WHERE posicion = :id")
        old_q = text("SELECT * FROM BPosicion WHERE IDPosicion = :id")
        
        with engine.connect() as conn:
            count = conn.execute(check_q, {"id": id_posicion}).scalar()
            if count > 0:
                raise HTTPException(status_code=400, detail="No se puede editar una posición que ya tiene contratos asociados.")
            old_state = conn.execute(old_q, {"id": id_posicion}).mappings().first()
            
        update_q = text("""
            UPDATE BPosicion
            SET Salario=:salario, Familia=:familia, Cargo=:cargo, Rol=:rol, Banda=:banda, 
                Direccion=:direccion, Gerencia=:gerencia, Area=:area, Subarea=:subarea, 
                Planta=:planta, Tipo_planta=:tipo_planta, Base_Fuente=:base_fuente, 
                Estado=:estado, P_Jefe=:p_jefe, Observacion=:observacion, 
                Usuario=:usuario, Modificacion=NOW()
            WHERE IDPosicion = :id_param
        """)
        data = pos.model_dump() # Use field names (id, salario...) to match placeholders
        data["id_param"] = id_posicion
        data["usuario"] = user.get("email")
        
        with engine.begin() as conn:
            conn.execute(update_q, data)
            
        # Audit Log
        audit.log_event(
            actor_email=user['email'],
            module='Vacantes',
            action='UPDATE',
            resource_id=id_posicion,
            old_values=dict(old_state) if old_state else None,
            new_values=data,
            details=f"Actualización de posición {pos.cargo}"
        )
        
        return {"ok": True, "message": "Posición actualizada exitosamente"}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/posiciones/{id_posicion}")
def delete_posicion(id_posicion: str, user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_role(user, ["admin"])
    audit = AuditService(db)
    try:
        # Check if position is assigned to any contract
        check_q = text("SELECT COUNT(*) FROM BContrato WHERE posicion = :id")
        old_q = text("SELECT * FROM BPosicion WHERE IDPosicion = :id")
        
        with engine.connect() as conn:
            count = conn.execute(check_q, {"id": id_posicion}).scalar()
            if count > 0:
                raise HTTPException(status_code=400, detail="No se puede eliminar una posición que ya tiene contratos asociados.")
            old_state = conn.execute(old_q, {"id": id_posicion}).mappings().first()
            
        delete_q = text("DELETE FROM BPosicion WHERE IDPosicion = :id")
        with engine.begin() as conn:
            conn.execute(delete_q, {"id": id_posicion})
        
        # Audit Log
        audit.log_event(
            actor_email=user['email'],
            module='Vacantes',
            action='DELETE',
            resource_id=id_posicion,
            old_values=dict(old_state) if old_state else None,
            details=f"Eliminación de posición {id_posicion}"
        )
        
        return {"ok": True, "message": "Posición eliminada exitosamente"}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/auditoria")
def get_audit_logs(
    module: Optional[str] = None, 
    actor: Optional[str] = None, 
    action: Optional[str] = None,
    limit: int = 100, 
    offset: int = 0,
    user: Dict[str, Any] = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    require_role(user, ["admin"])
    audit = AuditService(db)
    return audit.get_logs(limit, offset, module, actor, action)

@router.get("/auditoria/stats")
def get_audit_stats(user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    require_role(user, ["admin"])
    try:
        # Simple stats: Total events today, top module, top actor
        today_q = text("SELECT COUNT(*) FROM BAuditoria WHERE DATE(timestamp) = DATE(CONVERT_TZ(NOW(), '+00:00', '-05:00'))")
        # Stats based on the last 30 days to make them dynamic
        top_mod_q = text("""
            SELECT module, COUNT(*) as c 
            FROM BAuditoria 
            WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY module ORDER BY c DESC LIMIT 1
        """)
        top_act_q = text("""
            SELECT actor_email, COUNT(*) as c 
            FROM BAuditoria 
            WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY actor_email ORDER BY c DESC LIMIT 1
        """)
        
        with engine.connect() as conn:
            today = conn.execute(today_q).scalar()
            top_mod = conn.execute(top_mod_q).mappings().first()
            top_act = conn.execute(top_act_q).mappings().first()
            
        return {
            "today_events": today,
            "top_module": top_mod['module'] if top_mod else 'N/A',
            "top_actor": top_act['actor_email'] if top_act else 'N/A'
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reporte-cars")
def get_reporte_cars(anio: Optional[int] = None, user: Dict[str, Any] = Depends(get_current_user)):
    require_role(user, ["admin", "financiero", "talento", "nomina"])
    
    # Helper for formatting "Code | Name"
    def fmt_val(val, mapping):
        if val is None or val == "": return ""
        s_val = str(val).strip()
        name = mapping.get(s_val)
        return f"{s_val} | {name}" if name else s_val

    try:
        target_year = anio if anio else datetime.now().year
        
        # 1. Fetch data
        q_sql = text("""
            SELECT f.*, 
                c.atep, c.gerencia, c.id_contrato, c.estado, c.fecha_terminacion_real,
                p.cargo, p.banda, p.familia, p.IDPosicion AS posicion_c, p.Direccion, 
                p.Planta, p.Tipo_planta, p.Base_Fuente,
                CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido) AS nombre_completo
            FROM BFinanciacion f
            JOIN BContrato c ON f.id_contrato = c.id_contrato
            LEFT JOIN BData d ON c.cedula = d.cedula
            LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
            WHERE f.fecha_inicio <= :y_end
              AND f.fecha_fin >= :y_start
        """)
        
        cats = {"proy": {}, "fuente": {}, "comp": {}, "subcomp": {}, "cat": {}, "resp": {}}

        with engine.connect() as conn:
            # Main Data
            rows = conn.execute(q_sql, {
                "y_start": f"{target_year}-01-01", 
                "y_end": f"{target_year}-12-31"
            }).mappings().all()
            
            # Increments
            incs_rows = conn.execute(text("SELECT * FROM BIncremento")).mappings().all()
            incrementos = {int(r["anio"]): dict(r) for r in incs_rows}
            
            # --- Load Catalogs (Best Effort) ---
            def safe_load(k, q):
                try:
                    res = conn.execute(text(q)).fetchall()
                    # Mapping: Code (str) -> Name (str)
                    cats[k] = {str(r[0]).strip(): str(r[1]).strip() for r in res if len(r) >= 2 and r[1]}
                except Exception as e:
                    print(f"Warning: Could not load catalog '{k}': {e}")
            
            # Try to load names. Using correct dim tables.
            safe_load("proy", "SELECT codigo, nombre FROM dim_proyectos UNION SELECT codigo, nombre FROM dim_proyectos_otros")
            safe_load("fuente", "SELECT codigo, nombre FROM dim_fuentes")
            safe_load("comp", "SELECT codigo, nombre FROM dim_componentes")
            safe_load("subcomp", "SELECT codigo, nombre FROM dim_subcomponentes")
            safe_load("cat", "SELECT codigo, nombre FROM dim_categorias")
            safe_load("resp", "SELECT codigo, nombre FROM dim_responsables")
            
        # 2. Monthly Calculation
        tramos_data = []
        for r in rows:
            d = dict(r)
            for k, v in d.items(): 
                if hasattr(v, '__float__') and v is not None: d[k] = float(v)
            
            # --- Consistency Logic (Same as calculate_yearly_projections) ---
            # Ensure salario_base is present
            if 'salario_base' not in d and 'valor_mensual' in d:
                d['salario_base'] = d['valor_mensual']
                
            # Respect termination dates for inactive contracts
            est = (d.get("estado") or "").upper()
            term_real = to_date(d.get("fecha_terminacion_real"))
            if not est.startswith("ACTIVO") and term_real:
                fin_orig = to_date(d.get("fecha_fin"))
                if fin_orig and fin_orig > term_real:
                    d["fecha_fin"] = term_real
            # ----------------------------------------------------------------
            
            tramos_data.append(d)

        mensualizado = mensualizar_base_30(tramos_data, incrementos)
        
        # 3. Grouping
        grouped_data = {}
        for m_group in mensualizado:
            am = m_group["anioMes"]
            if not am.startswith(str(target_year)): continue
            
            for item in m_group["detalle"]:
                key = (
                    item.get("cedula"),
                    item.get("rubro") or "",
                    item.get("id_proyecto") or "",
                    item.get("fuente") or "",
                    item.get("componente") or "",
                    item.get("subcomponente") or "",
                    item.get("categoria") or "",
                    item.get("responsable") or "",
                    item.get("contrato") or ""
                )
                
                i_start = to_date(item.get("fecha_inicio"))
                i_end = to_date(item.get("fecha_fin"))
                
                if key not in grouped_data:
                    grouped_data[key] = {
                        "min_date": i_start,
                        "max_date": i_end,
                        "cedula": item.get("cedula"),
                        "nombre": item.get("nombre"),
                        "id_posicion": item.get("posicion_c"),
                        "contrato": item.get("contrato"),
                        "cargo": item.get("cargo"),
                        "direccion": item.get("Direccion"),
                        "gerencia": item.get("gerencia"),
                        "estado": item.get("Estado"),
                        "planta": item.get("Planta"),
                        "tipo_planta": item.get("Tipo_planta"),
                        "base_fuente": item.get("Base_Fuente"),
                        
                        "rubro": item.get("rubro"),
                        "id_proyecto": item.get("id_proyecto"),
                        "fuente": item.get("fuente"),
                        "componente": item.get("componente"),
                        "subcomponente": item.get("subcomponente"),
                        "categoria": item.get("categoria"),
                        "responsable": item.get("responsable"),
                        
                        "valor_total": 0.0
                    }
                else:
                    curr = grouped_data[key]
                    if i_start and (not curr["min_date"] or i_start < curr["min_date"]): curr["min_date"] = i_start
                    if i_end and (not curr["max_date"] or i_end > curr["max_date"]): curr["max_date"] = i_end
                
                grouped_data[key]["valor_total"] += item.get("valor", 0.0)

        # 4. Format Result
        final_list = []
        for v in grouped_data.values():
            min_d = v["min_date"].isoformat() if v["min_date"] else None
            max_d = v["max_date"].isoformat() if v["max_date"] else None
            
            final_list.append({
                "Fecha Inicio Tramo": min_d,
                "Fecha Final": max_d,
                "Cedula": v["cedula"],
                "Nombre": v["nombre"],
                "Id_Posicion": v["id_posicion"],
                "Contrato": v["contrato"],
                "Cargo": v["cargo"],
                "Dirección": v["direccion"],
                "Gerencia": v["gerencia"],
                "Estado": v["estado"],
                "Planta": v["planta"],
                "Tipo Planta": v["tipo_planta"],
                "Base Fuente": v["base_fuente"],
                "Rubro": v["rubro"],
                
                # Enriched Fields
                "Id_Proyecto": fmt_val(v["id_proyecto"], cats["proy"]),
                "Fuente": fmt_val(v["fuente"], cats["fuente"]),
                "Componente": fmt_val(v["componente"], cats["comp"]),
                "Subcomponente": fmt_val(v["subcomponente"], cats["subcomp"]),
                "Categoria": fmt_val(v["categoria"], cats["cat"]),
                "Responsable": fmt_val(v["responsable"], cats["resp"]),
                
                "Valor_Total": round(v["valor_total"])
            })
            
        return {"ok": True, "data": sorted(final_list, key=lambda x: x["Nombre"])}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
