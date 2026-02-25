from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db, engine
from app.core.security import get_current_user, require_role
from app.services.payroll_service_optimized import mensualizar_base_30_optimized
import csv
import io
import datetime
import traceback

router = APIRouter()

@router.post("/nomina/upload")
async def upload_nomina(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Any = Depends(get_current_user)
):
    """ Sube un archivo CSV de nómina. Borra automáticamente si ya existen datos del mes detectado. """
    require_role(user, ["admin", "nomina"])
    
    try:
        content = await file.read()
        decoded = content.decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(decoded), delimiter=';')
        
        rows_to_insert = []
        now = datetime.datetime.now()
        
        # Detectar periodo del primer registro para limpieza automática
        first_row = True
        target_period = None

        for row in reader:
            if first_row:
                fec = row.get('fec_liq')
                if fec:
                    dt = datetime.datetime.strptime(fec, '%Y-%m-%d')
                    target_period = dt.strftime('%Y-%m')
                first_row = False

            try:
                val = float(row.get('val_liq', 0).replace(',', '.') if isinstance(row.get('val_liq'), str) else row.get('val_liq', 0))
            except:
                val = 0
                
            rows_to_insert.append({
                "cod_emp": row.get('cod_emp'),
                "id_proyecto": row.get('id_proyecto'),
                "id_fuente": row.get('id_fuente'),
                "id_componente": row.get('id_componente'),
                "id_subcomponente": row.get('id_subcomponente'),
                "id_categoria": row.get('id_categoria'),
                "id_responsable": row.get('id_responsable'),
                "val_liq": val,
                "fec_liq": row.get('fec_liq'),
                "nom_liq": row.get('nom_liq') or row.get('nom_emp'),
                "fdec": row.get('fdec'),
                "rubro": row.get('rubro'),
                "fecha_carga": now
            })

        if not rows_to_insert:
            return {"ok": False, "message": "No hay datos para insertar"}

        with engine.begin() as conn:
            # LIMPIEZA AUTOMÁTICA
            if target_period:
                conn.execute(text("DELETE FROM BNomina WHERE DATE_FORMAT(fec_liq, '%Y-%m') = :p"), {"p": target_period})
            
            # Insertar en bloques (Bulk)
            query = text("""
                INSERT INTO BNomina (cod_emp, id_proyecto, id_fuente, id_componente, id_subcomponente, id_categoria, id_responsable, val_liq, fec_liq, nom_liq, fdec, rubro, fecha_carga)
                VALUES (:cod_emp, :id_proyecto, :id_fuente, :id_componente, :id_subcomponente, :id_categoria, :id_responsable, :val_liq, :fec_liq, :nom_liq, :fdec, :rubro, :fecha_carga)
            """)
            conn.execute(query, rows_to_insert)

        return {"ok": True, "message": f"Se cargaron {len(rows_to_insert)} registros. (Limpieza previa de {target_period} realizada)"}
        
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/nomina/summary")
def get_nomina_summary(db: Session = Depends(get_db), user: Any = Depends(get_current_user)):
    """ Retorna un resumen de la nómina por mes """
    try:
        query = text("""
            SELECT DATE_FORMAT(fec_liq, '%Y-%m') as periodo, 
                   SUM(val_liq) as total, 
                   COUNT(*) as registros, 
                   MAX(fecha_carga) as ultima_carga
            FROM BNomina
            GROUP BY periodo
            ORDER BY periodo DESC
        """)
        res = db.execute(query).mappings().all()
        return [dict(r) for r in res]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/nomina/month/{periodo}")
def delete_nomina_month(periodo: str, db: Session = Depends(get_db), user: Any = Depends(get_current_user)):
    """ Borra los registros de un mes específico (YYYY-MM) """
    require_role(user, ["admin", "nomina"])
    try:
        query = text("DELETE FROM BNomina WHERE DATE_FORMAT(fec_liq, '%Y-%m') = :p")
        db.execute(query, {"p": periodo})
        db.commit()
        return {"ok": True, "message": f"Registros del periodo {periodo} eliminados"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/nomina/ejecucion/fdec")
def get_ejecucion_fdec(periodo: Optional[str] = None, db: Session = Depends(get_db), user: Any = Depends(get_current_user)):
    """ Resumen de ejecución por FDEC """
    try:
        where_clause = ""
        params = {}
        if periodo:
            where_clause = "WHERE DATE_FORMAT(fec_liq, '%Y-%m') = :p"
            params["p"] = periodo

        query = text(f"""
            SELECT fdec, SUM(val_liq) as total, COUNT(DISTINCT cod_emp) as personas
            FROM BNomina
            {where_clause}
            GROUP BY fdec
            ORDER BY total DESC
        """)
        res = db.execute(query, params).mappings().all()
        return [dict(r) for r in res]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/nomina/reconciliation")
def get_reconciliation(
    version_id: int, 
    periodo: str, # YYYY-MM
    db: Session = Depends(get_db), 
    user: Any = Depends(get_current_user)
):
    """ 
    Conciliación: Compara lo pagado (BNomina) vs lo proyectado (BFinanciacion o Snapshot) 
    """
    try:
        # 1. Obtener Real (BNomina) agrupado por la granularidad solicitada (Manejo de ONLY_FULL_GROUP_BY)
        query_real = text("""
            SELECT 
                TRIM(n.cod_emp) as cedula, 
                MAX(COALESCE(
                    NULLIF(TRIM(CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido)), ''), 
                    NULLIF(TRIM(n.nom_liq), ''),
                    TRIM(n.cod_emp)
                )) as nombre,
                TRIM(n.id_proyecto) as cod_proyecto, 
                TRIM(n.id_fuente) as cod_fuente, 
                TRIM(n.id_componente) as cod_componente, 
                TRIM(n.id_subcomponente) as cod_subcomponente, 
                TRIM(n.id_categoria) as cod_categoria, 
                TRIM(n.id_responsable) as cod_responsable,
                SUM(n.val_liq) as real_pagado
            FROM BNomina n
            LEFT JOIN BData d ON TRIM(n.cod_emp) = TRIM(d.cedula)
            WHERE DATE_FORMAT(n.fec_liq, '%Y-%m') = :p
            GROUP BY 1, 3, 4, 5, 6, 7, 8
        """)
        real_data = db.execute(query_real, {"p": periodo}).mappings().all()

        # 2. Obtener Proyectado (Snapshot o Actual)
        if version_id == 0:
            # USAR EL VIVO (BFinanciacion) + FILTRO ESTADO ACTIVO
            query_proj = text("""
                SELECT TRIM(f.cedula) as cedula, 
                       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido)), ''), f.cedula) as nombre,
                       TRIM(f.id_proyecto) as cod_proyecto, 
                       TRIM(f.id_fuente) as cod_fuente, 
                       TRIM(f.id_componente) as cod_componente, 
                       TRIM(f.id_subcomponente) as cod_subcomponente, 
                       TRIM(f.id_categoria) as cod_categoria, 
                       TRIM(f.id_responsable) as cod_responsable,
                       f.salario_base, 
                       f.fecha_inicio, 
                       f.fecha_fin,
                       f.id_contrato,
                       c.atep,
                       p.cargo,
                       p.banda,
                       p.familia,
                       p.IDPosicion as posicion_c,
                       p.Direccion,
                       p.Gerencia as gerencia,
                       p.Base_Fuente
                FROM BFinanciacion f
                LEFT JOIN BData d ON TRIM(f.cedula) = TRIM(d.cedula)
                INNER JOIN BContrato c ON TRIM(f.cedula) = TRIM(c.cedula)
                LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
                WHERE f.fecha_inicio <= LAST_DAY(STR_TO_DATE(CONCAT(:p, '-01'), '%Y-%m-%d'))
                AND f.fecha_fin >= STR_TO_DATE(CONCAT(:p, '-01'), '%Y-%m-%d')
                AND c.estado LIKE 'Activo%'
            """)
            proj_rows = db.execute(query_proj, {"p": periodo}).mappings().all()
    
        else:
            # USAR SNAPSHOT
            query_proj = text("""
                SELECT TRIM(s.cedula) as cedula, 
                       COALESCE(NULLIF(TRIM(CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido)), ''), s.cedula) as nombre,
                       TRIM(s.cod_proyecto) as cod_proyecto, 
                       TRIM(s.cod_fuente) as cod_fuente, 
                       TRIM(s.cod_componente) as cod_componente, 
                       TRIM(s.cod_subcomponente) as cod_subcomponente, 
                       TRIM(s.cod_categoria) as cod_categoria, 
                       TRIM(s.cod_responsable) as cod_responsable,
                       s.valor_mensual as salario_base, 
                       s.fecha_inicio, 
                       s.fecha_fin, 
                       s.salario_t, 
                       s.posicion as posicion_c,
                       c.atep,
                       p.cargo,
                       p.banda,
                       p.familia,
                       p.Direccion,
                       p.Gerencia as gerencia,
                       p.Base_Fuente
                FROM BFinanciacion_Snapshot s
                LEFT JOIN BData d ON TRIM(s.cedula) = TRIM(d.cedula)
                LEFT JOIN BPosicion p ON TRIM(s.posicion) = TRIM(p.IDPosicion)
                LEFT JOIN BContrato c ON TRIM(s.cedula) = TRIM(c.cedula) AND c.posicion = s.posicion
                WHERE s.version_id = :vid
                AND s.fecha_inicio <= LAST_DAY(STR_TO_DATE(CONCAT(:p, '-01'), '%Y-%m-%d'))
                AND s.fecha_fin >= STR_TO_DATE(CONCAT(:p, '-01'), '%Y-%m-%d')
            """)
            proj_rows = db.execute(query_proj, {"vid": version_id, "p": periodo}).mappings().all()
    
        # Preparar para mensualizar
        tramos_dict = []
        for s in proj_rows:
            d = dict(s)
            # El servicio espera id_proyecto, id_fuente, etc. para la lógica interna
            d["id_proyecto"] = d["cod_proyecto"]
            d["id_fuente"] = d["cod_fuente"]
            d["id_componente"] = d["cod_componente"]
            d["id_subcomponente"] = d["cod_subcomponente"]
            d["id_categoria"] = d["cod_categoria"]
            d["id_responsable"] = d["cod_responsable"]
            tramos_dict.append(d)
        
        # Incrementos para el año
        anio_int = int(periodo.split('-')[0])
        inc_res = db.execute(text("SELECT * FROM BIncremento WHERE anio = :a"), {"a": anio_int}).mappings().all()
        incrementos = {r['anio']: dict(r) for r in inc_res}
        if not incrementos:
             print(f"WARNING: No hay incrementos para el año {anio_int}")

        # Mensualización
        proyeccion = mensualizar_base_30_optimized(tramos_dict, incrementos)
        
        target_key = f"{periodo}-01"
        proyectado_mes = []
        for p in proyeccion:
            if p["anioMes"] == target_key:
                proyectado_mes = p["detalle"]
                break

        # 3. Cruzar datos en memoria
        combined = {}
        
        def get_key(d):
            # Normalización de llaves de cruce: Manejar variaciones de nombres de campos
            # (cod_proyecto vs id_proyecto, fuente vs cod_fuente, etc.)
            ced = str(d.get('cedula') or d.get('cod_emp') or '').strip()
            
            c_proy = str(d.get('cod_proyecto') or d.get('id_proyecto') or '').strip()
            c_fuen = str(d.get('cod_fuente') or d.get('id_fuente') or d.get('fuente') or '').strip()
            c_comp = str(d.get('cod_componente') or d.get('id_componente') or d.get('componente') or '').strip()
            c_subc = str(d.get('cod_subcomponente') or d.get('id_subcomponente') or d.get('subcomponente') or '').strip()
            c_cate = str(d.get('cod_categoria') or d.get('id_categoria') or d.get('categoria') or '').strip()
            c_resp = str(d.get('cod_responsable') or d.get('id_responsable') or d.get('responsable') or '').strip()
            
            return f"{ced}|{c_proy}|{c_fuen}|{c_comp}|{c_subc}|{c_cate}|{c_resp}"

        # Llenar con proyectado
        for p in proyectado_mes:
            k = get_key(p)
            if k not in combined:
                combined[k] = {
                    "cedula": p["cedula"],
                    "nombre": p.get("nombre") or p.get("cedula") or "Sin nombre",
                    "cod_proyecto": p.get("id_proyecto", ""),
                    "cod_fuente": p.get("id_fuente") or p.get("fuente", ""),
                    "cod_componente": p.get("id_componente") or p.get("componente", ""),
                    "cod_subcomponente": p.get("id_subcomponente") or p.get("subcomponente", ""),
                    "cod_categoria": p.get("id_categoria") or p.get("categoria", ""),
                    "cod_responsable": p.get("id_responsable") or p.get("responsable", ""),
                    "presupuestado": 0.0,
                    "pagado": 0.0
                }
            combined[k]["presupuestado"] += p.get("valor", 0)

        # Cruzar con Real
        for r in real_data:
            k = get_key(r)
            if k not in combined:
                combined[k] = {
                    "cedula": r["cedula"],
                    "nombre": r["nombre"],
                    "cod_proyecto": r.get("cod_proyecto", ""),
                    "cod_fuente": r.get("cod_fuente", ""),
                    "cod_componente": r.get("cod_componente", ""),
                    "cod_subcomponente": r.get("cod_subcomponente", ""),
                    "cod_categoria": r.get("cod_categoria", ""),
                    "cod_responsable": r.get("cod_responsable", ""),
                    "presupuestado": 0.0,
                    "pagado": 0.0
                }
            else:
                # Si existía por presupuesto, asegurar que usamos el nombre real si viene
                # O si el nombre actual es un placeholder ("Sin nombre" o la propia cedula)
                if r["nombre"] and (combined[k]["nombre"] in (None, "Sin nombre", r["cedula"])):
                    combined[k]["nombre"] = r["nombre"]

            combined[k]["pagado"] += float(r.get("real_pagado", 0))

        # Formatear resultados finales
        final_list = list(combined.values())
        for r in final_list:
            r["brecha"] = r["pagado"] - r["presupuestado"]
            r["cumplimiento"] = (r["pagado"] / r["presupuestado"] * 100) if r["presupuestado"] > 0 else 0
            
        return final_list

    except Exception as e:
        print("ERROR EN CONCILIACION:")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/nomina/dashboard")
def get_nomina_dashboard(
    anio: Optional[int] = None, 
    periodo: Optional[str] = None, 
    trabajador: Optional[str] = None,
    direccion: Optional[str] = None,
    db: Session = Depends(get_db), 
    user: Any = Depends(get_current_user)
):
    """ Retorna KPIs y datos para el Dashboard de Nómina con filtros avanzados (v3) """
    try:
        curr_year = anio if anio else datetime.datetime.now().year
        
        # Base filters (Globales: Solo año y periodo afectarán KPIs y Gráficos)
        global_where = "WHERE YEAR(n.fec_liq) = :anio"
        global_params = {"anio": curr_year}
        
        if periodo:
            global_where += " AND DATE_FORMAT(n.fec_liq, '%Y-%m') = :periodo"
            global_params["periodo"] = periodo

        # Detail filters (Solo afectan a la tabla de detalle)
        detail_where = global_where
        detail_params = global_params.copy()
            
        if trabajador:
            detail_where += " AND (n.cod_emp LIKE :trab OR d.p_nombre LIKE :trab OR d.p_apellido LIKE :trab)"
            detail_params["trab"] = f"%{trabajador}%"

        if direccion:
            detail_where += " AND p.Direccion = :dir"
            detail_params["dir"] = direccion

        # 1. KPIs Globales
        q_kpis = text(f"""
            SELECT 
                SUM(val_liq) as total_anual,
                COUNT(DISTINCT n.cod_emp) as total_empleados,
                COUNT(DISTINCT DATE_FORMAT(n.fec_liq, '%Y-%m')) as meses_activos
            FROM BNomina n
            {global_where}
        """)
        kpis = db.execute(q_kpis, global_params).mappings().first()
        
        # 2. Distribución por Dirección
        q_dir = text(f"""
            SELECT p.Direccion as label, SUM(n.val_liq) as value
            FROM BNomina n
            JOIN BContrato c ON TRIM(n.cod_emp) = TRIM(c.cedula)
            JOIN BPosicion p ON c.posicion = p.IDPosicion
            {global_where}
            GROUP BY p.Direccion
            ORDER BY value DESC
        """)
        dist_direccion = db.execute(q_dir, global_params).mappings().all()
        
        # 3. Top 10 Proyectos
        q_proy = text(f"""
            SELECT COALESCE(dp.nombre, dpo.nombre, n.id_proyecto) as label, SUM(n.val_liq) as value
            FROM BNomina n
            LEFT JOIN dim_proyectos dp ON TRIM(n.id_proyecto) = TRIM(dp.codigo)
            LEFT JOIN dim_proyectos_otros dpo ON TRIM(n.id_proyecto) = TRIM(dpo.codigo)
            {global_where}
            GROUP BY label
            ORDER BY value DESC
            LIMIT 10
        """)
        top_proyectos = db.execute(q_proy, global_params).mappings().all()

        # 4. Parametros para Selects (Toda la data del año)
        all_periods = [r[0] for r in db.execute(text("SELECT DISTINCT DATE_FORMAT(fec_liq, '%Y-%m') FROM BNomina WHERE YEAR(fec_liq) = :anio ORDER BY 1 DESC"), {"anio": curr_year}).fetchall()]
        all_dirs = [r[0] for r in db.execute(text("SELECT DISTINCT Direccion FROM BPosicion WHERE Direccion IS NOT NULL ORDER BY 1")).fetchall()]

        # 5. Granularidad Agrupada
        q_detalled = text(f"""
            SELECT 
                n.cod_emp as cedula, 
                COALESCE(
                    NULLIF(TRIM(CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido)), ''), 
                    NULLIF(TRIM(n.nom_liq), ''),
                    TRIM(n.cod_emp)
                ) as nombre,
                COALESCE(dp.nombre, dpo.nombre, n.id_proyecto) as proyecto, 
                COALESCE(df.nombre, n.id_fuente) as fuente, 
                COALESCE(dc.nombre, n.id_componente) as component, 
                SUM(n.val_liq) as pagado
            FROM BNomina n
            LEFT JOIN BData d ON TRIM(n.cod_emp) = TRIM(d.cedula)
            LEFT JOIN dim_proyectos dp ON TRIM(n.id_proyecto) = TRIM(dp.codigo)
            LEFT JOIN dim_proyectos_otros dpo ON TRIM(n.id_proyecto) = TRIM(dpo.codigo)
            LEFT JOIN dim_fuentes df ON TRIM(n.id_fuente) = TRIM(df.codigo)
            LEFT JOIN dim_componentes dc ON TRIM(n.id_componente) = TRIM(dc.codigo)
            LEFT JOIN BContrato c ON TRIM(n.cod_emp) = TRIM(c.cedula)
            LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
            {detail_where}
            GROUP BY n.cod_emp, nombre, proyecto, fuente, component
            ORDER BY nombre ASC, pagado DESC
        """)
        detalle = db.execute(q_detalled, detail_params).mappings().all()

        # 6. Matriz Proyectos vs Periodos (Agrupado)
        matrix_data = []
        try:
            q_matrix = text(f"""
                SELECT 
                    COALESCE(dp.nombre, dpo.nombre, n.id_proyecto) as proyecto, 
                    DATE_FORMAT(n.fec_liq, '%Y-%m') as periodo,
                    SUM(n.val_liq) as total
                FROM BNomina n
                LEFT JOIN dim_proyectos dp ON TRIM(n.id_proyecto) = TRIM(dp.codigo)
                LEFT JOIN dim_proyectos_otros dpo ON TRIM(n.id_proyecto) = TRIM(dpo.codigo)
                {global_where}
                GROUP BY proyecto, periodo
                ORDER BY total DESC
            """)
            matrix_data = db.execute(q_matrix, global_params).mappings().all()
        except Exception as e:
            print(f"Error cargando matriz de proyectos: {e}")
            # Non-critical, continue with empty matrix

        return {
            "ok": True,
            "kpis": {
                "total_pagado": float(kpis["total_anual"] or 0),
                "n_empleados": kpis["total_empleados"] or 0,
                "meses_cargados": kpis["meses_activos"] or 0,
                "promedio_mensual": float((kpis["total_anual"] or 0) / (kpis["meses_activos"] or 1))
            },
            "charts": {
                "direccion": [dict(r) for r in dist_direccion],
                "proyectos": [dict(r) for r in top_proyectos]
            },
            "filters": {
                "periods": all_periods,
                "directions": all_dirs
            },
            "matrix": [dict(r) for r in matrix_data],
            "periods": all_periods,
            "detalle": [dict(r) for r in detalle]
        }
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
