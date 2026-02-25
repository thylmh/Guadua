import pandas as pd
import numpy as np
import calendar
from datetime import date
from typing import Any, Dict, List
from app.core.utils import to_date, month_start, round_hundred

def mensualizar_base_30_optimized(tramos: List[Dict[str, Any]], incrementos: Dict[int, Any]) -> List[Dict[str, Any]]:
    if not tramos:
        return []

    # 1. Convert to DataFrame
    df = pd.DataFrame(tramos)
    
    # 2. Preprocess dates
    df['fecha_inicio'] = pd.to_datetime(df['fecha_inicio']).dt.date
    df['fecha_fin'] = pd.to_datetime(df['fecha_fin']).dt.date
    df = df.dropna(subset=['fecha_inicio', 'fecha_fin'])
    
    # Sanitize entire DataFrame to avoid NaN in metadata fields
    # This ensures JSON compliance for all attributes copied from row
    df = df.replace({np.nan: None})
    
    # 3. Expand rows per month (Using SQL-like Cross Join logic or simple iteration which is faster than logic iteration)
    # Since Pandas expansion can be memory intensive, let's do a smart iterative expansion
    
    # Identify min/max year for increments
    min_year = df['fecha_inicio'].apply(lambda x: x.year).min()
    max_year = df['fecha_fin'].apply(lambda x: x.year).max()
    
    # Optimization: Filter increments relevant to data range
    valid_years = range(min_year, max_year + 1)
    
    # Structure for results
    results = []
    
    # To optimize this without excessive memory use for cross join:
    # Iterate by Year-Month for the covered range?
    # No, iterate rows and yield months is efficient in Python if logic is simple,
    # BUT the "Base 30" logic is complex.
    
    # Let's vectorize the Base 30 Day Calculation.
    # Function to calculate days in month with Base 30 rules
    def get_base30_days(start_date, end_date, month_start_date):
        month_end_date = (month_start_date + pd.DateOffset(months=1) - pd.DateOffset(days=1)).date()
        
        # Intersection
        current_start = max(start_date, month_start_date)
        current_end = min(end_date, month_end_date)
        
        if current_start > current_end:
            return 0
        
        d_ini = 1
        if (current_start.year == start_date.year and current_start.month == start_date.month):
            d_ini = min(start_date.day, 30)
            
        d_fin = 30
        if (current_end.year == end_date.year and current_end.month == end_date.month):
            # Check natural last day
            last_day_natural = month_end_date.day
            if current_end.day == last_day_natural or current_end.day >= 30:
                d_fin = 30
            else:
                d_fin = current_end.day
                
        days = d_fin - d_ini + 1
        return max(0, days)

    # However vectorizing 'get_base30_days' is tricky.
    
    # Let's use the pure Python loop but OPTIMIZE it by pre-calculating parameters per year 
    # and removing repeated type conversions/dict lookups which are slow.
    
    # Prepare Increment Table as Lookup of Tuples
    inc_lookup = {}
    for y, inc in incrementos.items():
        inc_lookup[y] = (
            float(inc.get("porcentaje_aumento") or 0),
            float(inc.get("smlv") or 0),
            float(inc.get("transporte") or 0),
            float(inc.get("dotacion") or 0)
        )

    # Accumulator
    # Use a dictionary of lists for speed
    acc_totals = {} # key: year-month, val: total
    acc_details = {} # key: year-month, val: list
    
    # --- OPTIMIZATION START: Pre-sanitize Data ---
    # Convert numeric columns to float32/64 once to avoid repeated casting
    numeric_cols = ['salario_base', 'atep']
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
    
    # Pre-fetch common params to local vars
    # Use simple list of dicts for faster iteration than itertuples for massive loops if accessing many fields
    records = df.to_dict('records')

    # Prepare Increment Lookup (already done above)
    min_inc_year = min(incrementos.keys()) if incrementos else 0
    max_inc_year = max(incrementos.keys()) if incrementos else 0
    
    # Helper for rounding (inline to avoid function call overhead)
    # Using simple rounding logic: int(x + 0.5) is faster than math.floor(x + 0.5)
    
    for row in records:
        try:
            ini: date = row['fecha_inicio']
            fin: date = row['fecha_fin']
            
            # Basic validation
            if ini > fin: continue
            
            # Extract basic fields
            salario_base = row.get('salario_base', 0.0)
            atep_val = row.get('atep', 0.0)
            
            # String fields (defaults to empty if None)
            cargo = row.get('cargo')
            banda = row.get('banda')
            familia = row.get('familia')
            posicion = row.get('posicion_c')
            
            # Pre-calc flags
            is_lectiva = (cargo == "Lectiva")
            is_b01 = (banda == "B01")
            is_aprendiz = (familia == "Aprendiz")
            is_ihpo_pension_exempt = (posicion in ("IHPO_119", "IHPO_6ac"))
            
            # Loop control
            curr_y = ini.year
            curr_m = ini.month
            
            # Optimization: integer comparison is faster than date object comparison in tight loops
            end_y = fin.year
            end_m = fin.month
            
            while (curr_y < end_y) or (curr_y == end_y and curr_m <= end_m):
                # Lookup increments
                # Fast path: check range first
                inc_vals = inc_lookup.get(curr_y, (0.0, 0.0, 0.0, 0.0))
                porc, smlv, trans, dot_val = inc_vals
                
                # --- CALCULATION CORE ---
                # Ensure base salary is available (Snapshots might use valor_mensual)
                if not salario_base and row.get('valor_mensual'):
                    salario_base = float(row.get('valor_mensual'))

                # 1. Salario Calc
                sal_calc = float(salario_base or 0.0)
                if porc > 0:
                    sal_calc = sal_calc * porc / 100.0
                
                # Ceiling 1000 logic
                if sal_calc > 0:
                    sal_calc = int(sal_calc / 1000.0 + 0.9999) * 1000.0
                    
                # 2. Aux Transporte
                aux_t = trans if (sal_calc <= (2 * smlv) and not is_lectiva) else 0.0
                    
                # 3. Dotacion
                dot = 0.0
                if not is_lectiva and sal_calc <= (smlv * 2):
                     dot = int(dot_val / 12.0 + 0.9999) # ceil
                
                # 4. Prestaciones (Original Formulas)
                base_prest = sal_calc + aux_t
                primas = int(base_prest * 0.0834) if not (is_lectiva or is_b01) else 0.0
                cesan  = int(base_prest * 0.0834) if not (is_lectiva or is_b01) else 0.0
                i_cesan = int(base_prest * 0.01) if not (is_lectiva or is_b01) else 0.0
                
                # Vacaciones (15 days each)
                s_vac = int(sal_calc * 0.0417) if not is_lectiva else 0.0
                p_vac = int(sal_calc * 0.0417) if not is_lectiva else 0.0
                sueldo_vac = s_vac
                
                # Salud
                salud = 0.0
                if is_lectiva:
                    salud = int(smlv * 0.125 / 100.0 + 0.5) * 100.0
                elif is_b01:
                    base_int = sal_calc * 0.7
                    total_s = int(base_int * 0.125 / 100.0 + 0.5) * 100.0
                    emp_s = int(base_int * 0.04)
                    salud = total_s - emp_s
                else:
                    total_s = int(sal_calc * 0.125 / 100.0 + 0.5) * 100.0
                    emp_s = int(sal_calc * 0.04)
                    salud = total_s - emp_s

                # Pension
                pension = 0.0
                if not (is_lectiva or is_ihpo_pension_exempt):
                    base_p = sal_calc * 0.7 if is_b01 else sal_calc
                    total_p = int(base_p * 0.16 / 100.0 + 0.5) * 100.0
                    emp_p = int(base_p * 0.04)
                    pension = total_p - emp_p
                    
                # Parafiscales
                base_para = sal_calc * 0.7 if is_b01 else sal_calc
                ccf  = 0.0 if (is_lectiva or is_aprendiz) else int(base_para * 0.04 / 100.0 + 0.5) * 100.0
                sena = 0.0 if (is_lectiva or is_aprendiz) else int(base_para * 0.02 / 100.0 + 0.5) * 100.0
                icbf = 0.0 if (is_lectiva or is_aprendiz) else int(base_para * 0.03 / 100.0 + 0.5) * 100.0
                
                # ARL
                base_arl = smlv if (is_aprendiz or is_lectiva) else (sal_calc * 0.7 if is_b01 else sal_calc)
                arl = int(base_arl * atep_val / 100.0 + 0.5) * 100.0
                
                total_mensual = int(round(sal_calc + aux_t + dot + primas + s_vac + p_vac + cesan + i_cesan + salud + pension + arl + ccf + sena + icbf))
                
                # --- Base 30 Logic (Unified for February) ---
                d_ini = 1
                if curr_y == ini.year and curr_m == ini.month:
                    d_ini = min(ini.day, 30)
                
                d_fin = 30
                if curr_y == end_y and curr_m == end_m:
                    # If day >= 30, it is 30. If it is Feb 28/29 (last day), it is 30.
                    fin_d = fin.day
                    if fin_d >= 30:
                        d_fin = 30
                    else:
                        _, last_day_nat = calendar.monthrange(curr_y, curr_m)
                        if fin_d == last_day_nat:
                            d_fin = 30
                        else:
                            d_fin = fin_d
                elif curr_m == 2:
                    # Not the end month, but it is February. Covers whole month.
                    d_fin = 30

                dias = max(0, d_fin - d_ini + 1)
                
                # If 0 days -> 0 value, otherwise calc ratio
                if dias > 0:
                    ratio = dias / 30.0
                    valor_mes = round(total_mensual * ratio)
                    
                    # Store
                    # key = f"{curr_y}-{curr_m:02d}-01"
                    # Fast string formatting
                    key = "%04d-%02d-01" % (curr_y, curr_m)
                    
                    if key not in acc_totals:
                        acc_totals[key] = 0.0
                        acc_details[key] = []
                    
                    acc_totals[key] += valor_mes
                    
                    # Detail Item
                    det_item = {
                        "id": row.get('id_financiacion'),
                        "cedula": row.get('cedula'),
                        "nombre": row.get('nombre') or row.get('nombre_completo'),
                        # Critical Fix: Return start/end dates for frontend validation (e.g. financed today check)
                        "fecha_inicio": ini.isoformat(), 
                        "fecha_fin": fin.isoformat(),
                        
                        "id_proyecto": row.get('id_proyecto'),
                        "proyecto": row.get('proyecto') or row.get('id_proyecto'),
                        "rubro": row.get('rubro'),
                        "fuente": row.get('id_fuente'),
                        "componente": row.get('id_componente'),
                        "subcomponente": row.get('id_subcomponente'),
                        "categoria": row.get('id_categoria'),
                        "responsable": row.get('id_responsable'),
                        "fecha_ingreso": row.get('fecha_ingreso'),
                        
                        # Add missing 'contrato' field for downstream reports
                        # Add missing 'contrato' field for downstream reports
                        "contrato": row.get('id_contrato'),
                        "Planta": row.get('Planta'),
                        "Base_Fuente": row.get('Base_Fuente'),
                        "Tipo_planta": row.get('Tipo_planta'),
                        "Direccion": row.get('Direccion'),
                        "Estado": row.get('estado'),
                        
                        "valor": valor_mes,
                        "dias": dias,
                        "conceptos": {
                            "salario_mes": int(sal_calc * ratio + 0.5),
                            "aux_transporte": int(aux_t * ratio + 0.5),
                            "dotacion": int(dot * ratio + 0.5),
                            "primas": int(primas * ratio + 0.5),
                            "prima_vacaciones": int(p_vac * ratio + 0.5),
                            "sueldo_vacaciones": int(sueldo_vac * ratio + 0.5),
                            "cesantias": int(cesan * ratio + 0.5),
                            "i_cesantias": int(i_cesan * ratio + 0.5),
                            "salud": int(salud * ratio + 0.5),
                            "pension": int(pension * ratio + 0.5),
                            "arl": int(arl * ratio + 0.5), # Already rounded 100 in base? No, ratio can break it. Keeping simple round.
                            "ccf": int(ccf * ratio + 0.5),
                            "sena": int(sena * ratio + 0.5),
                            "icbf": int(icbf * ratio + 0.5)
                        }
                    }
                    
                    # Optional fields
                    if 'Direccion' in row: det_item['Direccion'] = row['Direccion']
                    if 'gerencia' in row: det_item['gerencia'] = row['gerencia']
                    if 'fecha_terminacion' in row: det_item['fecha_terminacion'] = row['fecha_terminacion']
                    if 'cargo' in row: det_item['cargo'] = row['cargo']
                    if 'posicion_c' in row: det_item['posicion_c'] = row['posicion_c']

                    acc_details[key].append(det_item)

                # Advance month
                curr_m += 1
                if curr_m > 12:
                    curr_m = 1
                    curr_y += 1

        except Exception as e:
            # Skip malformed rows without crashing entire calc
            continue
    # Format Output
    output = []
    for key in sorted(acc_totals.keys()):
        output.append({
            "anioMes": key,
            "total": acc_totals[key],
            "detalle": acc_details[key]
        })
        
    return output

def calculate_yearly_projections(tramos: List[Dict[str, Any]], incrementos: Dict[int, Any], year: int):
    """
    Single Source of Truth for Yearly Financial Aggregation.
    Calculates total investment, headcount, and project breakdown for a specific year.
    """
    prefix = f"{year}-"
    
    # Pre-process tramos for common rules
    processed_tramos = []
    for r in tramos:
        d = dict(r)
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
        processed_tramos.append(d)

    mensualizado = mensualizar_base_30_optimized(processed_tramos, incrementos)
    
    proj_data = {} # pid -> {label, total, heads: set()}
    total_year = 0.0
    all_heads = set()
    
    proj_data = {} # (pid, comp) -> {label, total, months:[12], heads: set()}
    total_year = 0.0
    all_heads = set()
    all_heads = set()
    dist_dir_costo = {}
    dist_planta_fin = {} # planta -> set(cedulas)
    dist_direccion_fin = {} # direccion -> set(cedulas)
    
    prefix = f"{year}-"
    
    for m_group in mensualizado:
        if not m_group["anioMes"].startswith(prefix): continue
        m_idx = int(m_group["anioMes"].split("-")[1]) - 1
        
        for d in m_group["detalle"]:
            pid = d["id_proyecto"] or "SIN_PROYECTO"
            val = d["valor"]
            ced = d["cedula"]
            
            # 1. Project Matrix (Project ID only to avoid duplicate rows/data loss)
            key = pid
            if key not in proj_data:
                proj_data[key] = {
                    "id_proyecto": pid,
                    "codigo": pid,
                    "proyecto": d.get("proyecto") or pid,
                    "label": f"{pid} - {d.get('proyecto') or pid}",
                    "total": 0.0,
                    "months": [0.0]*12,
                    "heads": set()
                }
            proj_data[key]["total"] += val
            proj_data[key]["months"][m_idx] += val
            proj_data[key]["heads"].add(ced)
            
            # 2. Global KPIs
            total_year += val
            all_heads.add(ced)
            
            # 3. Direction Cost
            d_name = d.get("Direccion") or "Sin definir"
            dist_dir_costo[d_name] = dist_dir_costo.get(d_name, 0.0) + val
            if d_name not in dist_direccion_fin: dist_direccion_fin[d_name] = set()
            dist_direccion_fin[d_name].add(ced)
            
            # 4. Planta Coverage (Financed Today - Simplified as Any Financing in Year)
            p_name = d.get("Base_Fuente") or "Proyectos" # SWAPPED for Base_Fuente
            if p_name not in dist_planta_fin: dist_planta_fin[p_name] = set()
            dist_planta_fin[p_name].add(ced)
            
    # Format Project Matrix for frontend
    matrix_proyectos = []
    for info in proj_data.values():
        info["headcount"] = len(info["heads"])
        del info["heads"] # remove set for JSON serialization
        matrix_proyectos.append(info)
        
    return {
        "anio": year,
        "total": total_year,
        "headcount": len(all_heads),
        "costo_total": total_year, # Alias for clarity
        "dist_dir_costo": dist_dir_costo,
        "dist_planta_fin": {k: len(v) for k, v in dist_planta_fin.items()},
        "dist_direccion_fin": {k: len(v) for k, v in dist_direccion_fin.items()},
        "matrix_proyectos": matrix_proyectos,
        "mensualizado_raw": mensualizado
    }

import math
