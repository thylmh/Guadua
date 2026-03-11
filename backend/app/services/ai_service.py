import os
import re
import threading
from datetime import datetime
from langchain_google_vertexai import ChatVertexAI
from langchain_community.utilities import SQLDatabase
from sqlalchemy import text
from app.core.database import engine
from app.core.config import settings

# Global singletons
_db = None
_llm = None
_lock = threading.Lock()

# ── Complete Schema Context (All 18 App Tables) ──
DB_SCHEMA = """
=== TABLAS PRINCIPALES (Personas y Contratos) ===

BData: Datos personales de cada trabajador.
  - cedula (PK, varchar20): Número de identificación (NUNCA formatear como dinero).
  - p_nombre, s_nombre, p_apellido, s_apellido: Primer nombre, segundo nombre, primer apellido, segundo apellido.
  - correo_electronico: Email institucional (@humboldt.org.co).
  - telefono, fecha_nacimiento, genero, estado_civil, tipo_sangre.
  - direccion_residencia, barrio, departamento, ciudad.
  - identidad_genero, respeto_diversidad, etnia.
  - victima_conflicto, poblacion_migrante, poblacion_campesina (tinyint 0/1).
  - tiene_discapacidad (tinyint 0/1), tipo_discapacidad.
  - email_personal, cod_mpio, tipo_vivienda, estrato, servicios_completos.

BContrato: Contratos laborales. Un trabajador puede tener múltiples contratos (histórico).
  - id_contrato (PK, varchar50).
  - posicion (FK → BPosicion.IDPosicion): Posición institucional asignada.
  - cedula (FK → BData.cedula).
  - familia, cargo, rol, banda: Clasificación del cargo.
  - salario (decimal): Salario mensual actual.
  - nivel_riesgo, atep (decimal): Tasa ARL.
  - direccion, gerencia, area, subarea: Ubicación organizacional.
  - tipo_contrato, num_contrato, fecha_contrato.
  - num_otrosi, prorrogas_fecha.
  - fecha_ingreso (date): Fecha de inicio del contrato.
  - fecha_terminacion (date): Fecha de fin del contrato.
  - modalidad, total_dias_tele, sede, ciudad_contratacion.
  - estado (varchar): 'Activo', 'Activo - Encargo', 'Inactivo', 'Retirado'.
  - metodo_selec, encargo, motivo_ingreso.
  - fecha_terminacion_real (date): Fecha real de salida (si diferente).
  - causal_retiro.

BPosicion: Posiciones institucionales (cargos del organigrama).
  - IDPosicion (PK, varchar50): Código como 'IHPO_xxx'.
  - Salario (decimal): Salario base de la posición.
  - Familia, Cargo, Rol, Banda.
  - Direccion, Gerencia, Area, Subarea: Ubicación en organigrama.
  - Planta (varchar): 'Planta' o 'Proyectos'.
  - Tipo_planta (varchar): Tipo específico (ej: 'Funcionamiento', 'Inversión').
  - Base_Fuente (varchar): Fuente base de financiación.
  - Estado (varchar): 'Ocupada' o 'Vacante'.
  - P_Jefe (varchar): Posición del jefe directo.

=== TABLAS DE FINANCIACIÓN ===

BFinanciacion: Tramos de financiación (un contrato puede tener múltiples fuentes/periodos).
  - id_financiacion (PK, varchar50).
  - id_contrato (FK → BContrato.id_contrato).
  - cedula (FK → BData.cedula).
  - fecha_inicio, fecha_fin (date): Periodo del tramo.
  - salario_base (decimal): Salario base para cálculos.
  - salario_t (decimal): Salario total calculado.
  - pago_proyectado (decimal).
  - rubro, id_proyecto, id_fuente, id_componente, id_subcomponente, id_categoria, id_responsable.
  - justificacion (text).

BFinanciacion_Snapshot: Versiones históricas de financiación (para comparación presupuestal).
  - snapshot_id (PK), version_id (FK → Presupuesto_Versiones.id).
  - original_id_financiacion, cedula, id_proyecto, id_contrato.
  - valor_mensual, salario_t, pago_proyectado (decimal).
  - fecha_inicio, fecha_fin.

=== TABLAS DE NÓMINA ===

BNomina: Registros de nómina real pagada.
  - id (PK auto).
  - cod_emp (varchar): Cédula del empleado (= BData.cedula).
  - cod_con: Código del concepto.
  - nom_con: Nombre del concepto (ej: 'SUELDO BASICO', 'AUXILIO TRANSPORTE').
  - val_liq (decimal): Valor liquidado (puede ser negativo para deducciones).
  - nom_liq: Nombre de la liquidación.
  - fec_liq (date): Fecha de liquidación.
  - id_proyecto, id_fuente, id_componente, id_subcomponente, id_categoria, id_responsable.

BIncremento: Tabla de parámetros de incremento salarial por año.
  - anio (int): Año.
  - smlv (decimal): Salario mínimo legal vigente.
  - transporte (decimal): Auxilio de transporte.
  - dotacion (decimal): Valor de dotación anual.
  - porcentaje_aumento (decimal): Porcentaje de incremento (ej: 109.53 = 9.53% de aumento).

=== TABLAS DIMENSIONALES (Catálogos) ===

dim_proyectos / dim_proyectos_otros: Catálogo de proyectos.
  - codigo (varchar/text): Código del proyecto.
  - nombre: Nombre completo del proyecto.
  - estado: Estado del proyecto.

dim_fuentes: Fuentes de financiación. (codigo, nombre)
dim_componentes: Componentes presupuestales. (codigo, nombre)
dim_subcomponentes: Subcomponentes. (codigo, nombre)
dim_categorias: Categorías presupuestales. (codigo, nombre)
dim_responsables: Responsables de presupuesto. (codigo, nombre)

=== TABLAS ADMINISTRATIVAS ===

BSolicitud_Cambio: Solicitudes de cambio presupuestal.
  - tipo_solicitud ('CREAR','EDITAR','ELIMINAR').
  - id_financiacion_afectado, cedula, justificacion.
  - estado ('PENDIENTE','APROBADA','RECHAZADA').
  - solicitante, aprobador, fecha_solicitud, fecha_decision.

BNotificaciones: Notificaciones del sistema.
  - usuario_email, mensaje, leido (0/1), tipo ('INFO','SUCCESS','ERROR').

BAuditoria: Bitácora de auditoría.
  - actor_email, module, action, resource_id, old_values (JSON), new_values (JSON).

BWhitelist: Usuarios autorizados.
  - email (PK), role ('admin','financiero','talento','nomina','user'), cedula.

Presupuesto_Versiones: Versiones de presupuesto.
  - id (PK), nombre_version, creado_por, descripcion, bloqueada (0/1).

=== RELACIONES CLAVE (JOINS) ===
- BData.cedula = BContrato.cedula
- BContrato.posicion = BPosicion.IDPosicion
- BContrato.id_contrato = BFinanciacion.id_contrato
- BFinanciacion.cedula = BData.cedula
- BNomina.cod_emp = BData.cedula
- BFinanciacion.id_proyecto → dim_proyectos.codigo / dim_proyectos_otros.codigo
- Para obtener nombre completo: CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido)
- Para nombre de proyecto: LEFT JOIN dim_proyectos dp ON f.id_proyecto = dp.codigo LEFT JOIN dim_proyectos_otros dpo ON f.id_proyecto = dpo.codigo → COALESCE(dp.nombre, dpo.nombre) AS nombre_proyecto

=== REGLAS DE NEGOCIO ===
- 'Activo' se filtra con: BContrato.estado LIKE 'Activo%' (incluye 'Activo - Encargo').
- Una cédula es un identificador numérico de 5-12 dígitos. NUNCA formatear como dinero.
- El Instituto Alexander von Humboldt es la organización.
- Las fechas se manejan en formato 'YYYY-MM-DD'.
- Para contar empleados activos: COUNT(DISTINCT c.cedula) WHERE c.estado LIKE 'Activo%'.

=== CÁLCULO DE COSTO PROYECTADO (MUY IMPORTANTE) ===
- NO uses SUM(pago_proyectado) directamente, pago_proyectado almacena un ratio, no el valor real.
- Para calcular el costo proyectado de un periodo, usa MENSUALIZACIÓN:
  Fórmula: SUM(salario_t * GREATEST(DATEDIFF(LEAST(fecha_fin, 'YYYY-12-31'), GREATEST(fecha_inicio, 'YYYY-01-01')) / 30.0, 0))
  Donde YYYY es el año solicitado.
- Siempre filtra: fecha_inicio <= 'YYYY-12-31' AND fecha_fin >= 'YYYY-01-01' para obtener solo tramos activos en ese periodo.
- Esta fórmula calcula cuántos meses (días/30) de cada tramo caen dentro del año y multiplica por el salario total mensual.
"""

# ── Few-Shot Examples ──
FEW_SHOT_EXAMPLES = """
EJEMPLOS DE CONSULTAS CORRECTAS:

Pregunta: ¿Cuántos empleados activos hay?
SQL: SELECT COUNT(DISTINCT c.cedula) FROM BContrato c WHERE c.estado LIKE 'Activo%'

Pregunta: ¿Quiénes vencen contrato este mes?
SQL: SELECT d.cedula, CONCAT_WS(' ', d.p_nombre, d.p_apellido) AS nombre, c.cargo, c.fecha_terminacion FROM BContrato c JOIN BData d ON c.cedula = d.cedula WHERE c.estado LIKE 'Activo%' AND YEAR(c.fecha_terminacion) = YEAR(CURDATE()) AND MONTH(c.fecha_terminacion) = MONTH(CURDATE()) ORDER BY c.fecha_terminacion LIMIT 30

Pregunta: ¿Cuál es el salario promedio?
SQL: SELECT ROUND(AVG(c.salario), 0) AS salario_promedio FROM BContrato c WHERE c.estado LIKE 'Activo%' AND c.salario > 0

Pregunta: Muéstrame los empleados de la Dirección General
SQL: SELECT d.cedula, CONCAT_WS(' ', d.p_nombre, d.p_apellido) AS nombre, c.cargo, c.salario FROM BContrato c JOIN BData d ON c.cedula = d.cedula WHERE c.estado LIKE 'Activo%' AND c.direccion LIKE '%General%' ORDER BY c.cargo LIMIT 30

Pregunta: ¿Cuántos proyectos hay?
SQL: SELECT COUNT(*) FROM (SELECT codigo FROM dim_proyectos UNION SELECT codigo FROM dim_proyectos_otros) t

Pregunta: Dame el email de Juan Pérez
SQL: SELECT d.cedula, CONCAT_WS(' ', d.p_nombre, d.p_apellido) AS nombre, d.correo_electronico FROM BData d JOIN BContrato c ON d.cedula = c.cedula WHERE c.estado LIKE 'Activo%' AND (d.p_nombre LIKE '%Juan%' OR d.p_apellido LIKE '%Perez%' OR d.s_apellido LIKE '%Perez%') LIMIT 10

Pregunta: ¿Cuánto ha pagado en nómina en enero 2026?
SQL: SELECT SUM(val_liq) AS total_nomina FROM BNomina WHERE fec_liq >= '2026-01-01' AND fec_liq <= '2026-01-31' AND val_liq > 0

Pregunta: ¿Cuántas posiciones vacantes hay?
SQL: SELECT COUNT(*) FROM BPosicion WHERE UPPER(Estado) = 'VACANTE'

Pregunta: ¿Quién es el jefe de IHPO_001?
SQL: SELECT p.P_Jefe, p2.Cargo AS cargo_jefe FROM BPosicion p LEFT JOIN BPosicion p2 ON p.P_Jefe = p2.IDPosicion WHERE p.IDPosicion = 'IHPO_001'

Pregunta: ¿Cuántos empleados hay por dirección?
SQL: SELECT c.direccion, COUNT(DISTINCT c.cedula) AS cantidad FROM BContrato c WHERE c.estado LIKE 'Activo%' AND c.direccion IS NOT NULL GROUP BY c.direccion ORDER BY cantidad DESC LIMIT 30

Pregunta: Lista de proyectos activos con nombre
SQL: SELECT dp.codigo, dp.nombre FROM dim_proyectos dp WHERE dp.estado LIKE 'ACTIVO%' UNION SELECT dpo.codigo, dpo.nombre FROM dim_proyectos_otros dpo WHERE dpo.estado LIKE 'ACTIVO%' LIMIT 30

Pregunta: Total proyectado del proyecto 044 para 2026
SQL: SELECT SUM(f.salario_t * GREATEST(DATEDIFF(LEAST(f.fecha_fin, '2026-12-31'), GREATEST(f.fecha_inicio, '2026-01-01')) / 30.0, 0)) AS total_proyectado FROM BFinanciacion f WHERE f.id_proyecto = '044' AND f.fecha_inicio <= '2026-12-31' AND f.fecha_fin >= '2026-01-01'

Pregunta: Total proyectado del proyecto A01 por año 2026 y 2027
SQL: SELECT '2026' AS anio, SUM(f.salario_t * GREATEST(DATEDIFF(LEAST(f.fecha_fin, '2026-12-31'), GREATEST(f.fecha_inicio, '2026-01-01')) / 30.0, 0)) AS total FROM BFinanciacion f WHERE f.id_proyecto = 'A01' AND f.fecha_inicio <= '2026-12-31' AND f.fecha_fin >= '2026-01-01' UNION ALL SELECT '2027' AS anio, SUM(f.salario_t * GREATEST(DATEDIFF(LEAST(f.fecha_fin, '2027-12-31'), GREATEST(f.fecha_inicio, '2027-01-01')) / 30.0, 0)) AS total FROM BFinanciacion f WHERE f.id_proyecto = 'A01' AND f.fecha_inicio <= '2027-12-31' AND f.fecha_fin >= '2027-01-01'
"""

def get_db_instance():
    global _db
    if _db is None:
        with _lock:
            if _db is None:
                try:
                    print("[AI] Inicializando conexión a DB para IA...")
                    _db = SQLDatabase(engine, include_tables=[
                        "BContrato", "BData", "BFinanciacion", "BNomina", 
                        "BPosicion", "BIncremento",
                        "dim_proyectos", "dim_proyectos_otros", "dim_fuentes"
                    ])
                    print("[AI] DB inicializada exitosamente.")
                except Exception as e:
                    print(f"[AI] ERROR inicializando DB: {str(e)}")
                    return None
    return _db

def get_llm():
    global _llm
    if _llm is None:
        with _lock:
            if _llm is None:
                try:
                    print(f"[AI] Inicializando LLM ({settings.GCP_PROJECT} / {settings.GCP_LOCATION})...")
                    _llm = ChatVertexAI(
                        model_name="gemini-2.0-flash",
                        project=settings.GCP_PROJECT,
                        location=settings.GCP_LOCATION,
                        temperature=0
                    )
                except Exception as e:
                    print(f"[AI] ERROR inicializando LLM: {str(e)}")
                    return None
    return _llm


# ── Formatting: Money-aware result formatter ──

MONEY_KEYWORDS = {"salario", "valor", "monto", "costo", "total", "val_liq", 
                  "smlv", "transporte", "dotacion", "salario_base", "salario_t",
                  "presupuesto", "inversion", "pago", "neto", "bruto", "deduccion",
                  "pago_proyectado", "valor_mensual", "promedio", "suma", "avg"}

def _detect_money_columns(sql_query: str) -> set:
    """Parse SQL SELECT to detect which column positions are monetary."""
    money_cols = set()
    if not sql_query:
        return money_cols
    
    select_match = re.match(r"SELECT\s+(.*?)\s+FROM", sql_query, re.IGNORECASE | re.DOTALL)
    if not select_match:
        return money_cols
    
    cols_str = select_match.group(1)
    # Split by comma respecting parentheses
    depth = 0
    parts = []
    current = ""
    for ch in cols_str:
        if ch == '(': depth += 1
        elif ch == ')': depth -= 1
        elif ch == ',' and depth == 0:
            parts.append(current.strip())
            current = ""
            continue
        current += ch
    if current.strip():
        parts.append(current.strip())
    
    for idx, col_expr in enumerate(parts):
        col_name = col_expr.split()[-1].strip('`"').lower()
        as_match = re.search(r'\bAS\s+(\w+)', col_expr, re.IGNORECASE)
        if as_match:
            col_name = as_match.group(1).lower()
        
        if any(kw in col_name for kw in MONEY_KEYWORDS):
            money_cols.add(idx)
    
    return money_cols


def _format_result_with_ai(rows_str: str, sql_query: str, user_question: str) -> str:
    """
    Two-step formatting:
    1. Clean technical DB output
    2. Use Gemini to generate a natural language response
    """
    if not rows_str or rows_str.strip() in ("[]", "()", "", "None"):
        return "No encontré resultados que coincidan con tu búsqueda."

    # 1. Technical Cleanup
    clean = re.sub(r"Decimal\('([\d\.\-]+)'\)", r"\1", rows_str)
    clean = re.sub(r"datetime\.date\((\d+),\s*(\d+),\s*(\d+)\)", r"\1-\2-\3", clean)
    
    money_cols = _detect_money_columns(sql_query)
    
    try:
        import ast
        rows = ast.literal_eval(clean)
        if not rows:
            return "No encontré datos disponibles."

        # Format rows with money awareness
        formatted_lines = []
        for i, row in enumerate(rows[:25], 1):
            parts = []
            for col_idx, v in enumerate(row):
                if v is None: continue
                s = str(v)
                # Apply money formatting only to detected money columns
                if col_idx in money_cols and s.replace(".", "").replace("-", "").isdigit():
                    val = float(s)
                    if val > 1000:
                        s = f"${val:,.0f}"
                parts.append(s)
            formatted_lines.append(f"{i}. {' — '.join(parts)}")
        
        total = len(rows)
        formatted_data = "\n".join(formatted_lines)
        if total > 25:
            formatted_data += f"\n\n*(Mostrando 25 de {total} resultados)*"

        # 2. Use LLM to generate natural language response
        llm = get_llm()
        if llm:
            try:
                nl_prompt = f"""Eres el asistente de datos del Instituto Humboldt. El usuario preguntó:
"{user_question}"

Se ejecutó esta consulta SQL:
{sql_query}

Y estos son los resultados ({total} registros):
{formatted_data}

Genera una respuesta clara, amigable y concisa en español. Reglas:
- Si es un conteo o valor único, responde directamente con el dato.
- Si es una lista, presenta los datos de forma ordenada y legible.
- Los valores monetarios ya están formateados con $, mantenlos así.
- Las cédulas son identificadores numéricos, NO los formatees como dinero.
- Si hay muchos resultados, resume los principales y menciona el total.
- No menciones SQL, queries ni tecnicismos de base de datos.
- Usa emojis moderadamente para hacerlo amigable.
- Máximo 500 caracteres si es un dato simple, hasta 1500 si es una lista."""

                nl_response = llm.invoke(nl_prompt)
                return nl_response.content.strip()
            except Exception as e:
                print(f"[AI] Error en formateo NL: {e}")
                # Fallback to formatted data
        
        # Fallback formatting
        header = f"He encontrado {total} registro{'s' if total > 1 else ''}:\n\n"
        return header + formatted_data

    except Exception:
        clean_display = clean.replace("[", "").replace("]", "").replace("(", "").replace(")", "").replace("'", "").strip()
        if clean_display.endswith(","): clean_display = clean_display[:-1]
        return f"Aquí tienes la información encontrada:\n**{clean_display}**"


def _clean_sql(raw_sql: str) -> str:
    """Extract and clean SQL from LLM response."""
    sql = raw_sql.strip()
    sql = sql.replace("```sql", "").replace("```", "").strip()
    # Remove any leading explanation text before SELECT
    select_idx = sql.upper().find("SELECT")
    if select_idx > 0:
        sql = sql[select_idx:]
    # Remove trailing semicolons
    sql = sql.rstrip(";").strip()
    return sql


def ask_database(user_question: str, history: list = None) -> str:
    print(f"[AI] Nueva consulta: {user_question}")
    try:
        db = get_db_instance()
        if not db:
            return "No puedo conectarme a la base de datos en este momento."

        llm = get_llm()
        if not llm:
            return "El servicio de Inteligencia Artificial no está disponible."

        # Build conversation context
        history_str = ""
        if history:
            for msg in history[-6:]:
                role = msg.get('role', '')
                content = msg.get('content', '')[:200]
                history_str += f"{role}: {content}\n"

        # ── STEP 1: Generate SQL ──
        sql_prompt = f"""Eres un experto en MySQL para la App Guadua del Instituto Alexander von Humboldt.
Genera SOLO el código SQL (SELECT) para responder a la pregunta del usuario.

{DB_SCHEMA}

{FEW_SHOT_EXAMPLES}

CONTEXTO DE CONVERSACIÓN PREVIA:
{history_str}

REGLAS ESTRICTAS:
1. SOLO responde con el SQL, sin explicaciones ni markdown.
2. Usa LIMIT 30 para evitar resultados masivos.
3. Filtra por BContrato.estado LIKE 'Activo%' siempre, salvo que pregunten por inactivos/retirados.
4. Para nombre completo: CONCAT_WS(' ', d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido).
5. Usa JOINs correctos según las relaciones documentadas.
6. Para proyectos, usa dim_proyectos UNION dim_proyectos_otros.
7. Cédula es un identificador, no un número monetario.
8. Si no puedes responder con SQL, responde: NO_SQL:motivo

Pregunta: {user_question}
SQL:"""

        print("[AI] Generando SQL...")
        response = llm.invoke(sql_prompt)
        raw_sql = response.content.strip()
        
        # Handle non-SQL responses
        if raw_sql.startswith("NO_SQL:"):
            reason = raw_sql.replace("NO_SQL:", "").strip()
            return f"No puedo responder esa pregunta consultando la base de datos. {reason}"

        sql_query = _clean_sql(raw_sql)
        
        # Security: ensure it's a SELECT
        if not sql_query.upper().startswith("SELECT"):
            print(f"[AI] Query rechazado (no SELECT): {sql_query}")
            return "Solo tengo permisos para realizar consultas de lectura."

        # ── STEP 2: Execute SQL ──
        print(f"[AI] Ejecutando SQL: {sql_query}")
        try:
            result = db.run(sql_query)
            print(f"[AI] DB Exito: {len(str(result))} bytes")
        except Exception as sql_error:
            print(f"[AI] SQL Error: {sql_error}")
            
            # ── STEP 2b: Self-correction — retry with error context ──
            print("[AI] Intentando auto-corrección...")
            retry_prompt = f"""El siguiente SQL generó un error. Corrige el SQL.

SQL original:
{sql_query}

Error:
{str(sql_error)[:300]}

{DB_SCHEMA}

Reglas: Solo responde con el SQL corregido, sin explicaciones.
SQL corregido:"""
            
            try:
                retry_response = llm.invoke(retry_prompt)
                retry_sql = _clean_sql(retry_response.content.strip())
                
                if retry_sql.upper().startswith("SELECT"):
                    print(f"[AI] SQL corregido: {retry_sql}")
                    result = db.run(retry_sql)
                    sql_query = retry_sql  # Use corrected query for formatting
                    print(f"[AI] Retry exitoso: {len(str(result))} bytes")
                else:
                    return f"Lo siento, no pude generar una consulta válida. Error original: {str(sql_error)[:100]}"
            except Exception as retry_error:
                print(f"[AI] Retry también falló: {retry_error}")
                return f"Lo siento, la consulta generada tuvo un error y no pude corregirla automáticamente. Intenta reformular tu pregunta."

        # ── STEP 3: Format with AI ──
        return _format_result_with_ai(result, sql_query, user_question)

    except Exception as e:
        print(f"[AI] ERROR en proceso: {str(e)}")
        import traceback
        traceback.print_exc()
        return f"Lo siento, ocurrió un error al procesar tu solicitud: {str(e)}"
