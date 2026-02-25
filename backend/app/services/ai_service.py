import os
import threading
from langchain_google_vertexai import ChatVertexAI
from langchain_community.utilities import SQLDatabase
from app.core.database import engine

# Global singletons
_db = None
_llm = None
_lock = threading.Lock()

# ── Manual Schema Context (Faster than LangChain introspection) ──
DB_SCHEMA = """
TABLAS Y COLUMNAS:
- BContrato: id_contrato, cedula, posicion, cargo, salario, estado (Activo/Inactivo), fecha_ingreso, fecha_terminacion.
- BData: cedula, p_nombre, p_apellido, s_nombre, s_apellido, correo_electronico, telefono.
- BFinanciacion: id_financiacion, cedula, id_contrato, salario_t (TOTAL), salario_base, fecha_inicio, fecha_fin, id_proyecto.
- BNomina: cod_emp (cedula), val_liq (monto), fec_liq (fecha), nom_con (concepto).

REGLAS SQL:
- Filtra siempre por BContrato.estado LIKE 'Activo%' salvo indicación contraria.
- Joins comunes: BData.cedula = BContrato.cedula, BData.cedula = BFinanciacion.cedula.
- Email: USAR BData.correo_electronico.
- Vencimiento: USAR BContrato.fecha_terminacion.
"""

def get_db_instance():
    global _db
    if _db is None:
        with _lock:
            if _db is None:
                # Use the existing engine from app/core/database.py
                # This ensures we use the Cloud SQL Connector in production
                _db = SQLDatabase(engine, include_tables=["BContrato", "BData", "BFinanciacion", "BNomina"])
    return _db

def get_llm():
    global _llm
    if _llm is None:
        with _lock:
            if _llm is None:
                _llm = ChatVertexAI(
                    model_name="gemini-2.0-flash",
                    project=settings.GCP_PROJECT,
                    location=settings.GCP_LOCATION,
                    temperature=0
                )
    return _llm

def _format_result(rows_str: str) -> str:
    """
    Cleans technical database strings (Decimal, datetime) into human-readable text.
    Maintains speed by using Python instead of an LLM for formatting.
    """
    if not rows_str or rows_str.strip() in ("[]", "()", "", "None"):
        return "No encontré resultados para esa consulta."

    # 1. Technical Cleanup (Regex/String replace for DB types)
    import re
    # Remove Decimal('...') wrapping
    clean = re.sub(r"Decimal\('([\d\.]+)'\)", r"\1", rows_str)
    # Remove datetime.date(...) wrapping
    clean = re.sub(r"datetime\.date\((\d+),\s*(\d+),\s*(\d+)\)", r"\1-\2-\3", clean)
    
    try:
        import ast
        # literal_eval might still struggle with some types, fallback to generic cleanup
        rows = ast.literal_eval(clean)
        
        if not rows: return "No hay datos."

        # Case 1: Simple result (e.g. one date or one number)
        if len(rows) == 1 and len(rows[0]) == 1:
            val = str(rows[0][0])
            # Currency formatting if it looks like a salary
            if val.replace(".", "").isdigit() and float(val) > 100000:
                amount = float(val)
                return f"El valor es: **${amount:,.0f}**"
            return f"El resultado es: **{val}**"

        # Case 2: List of results
        lines = []
        for i, row in enumerate(rows[:20], 1):
            parts = []
            for v in row:
                if v is None: continue
                s = str(v)
                # Quick currency fix for list items
                if s.replace(".", "").isdigit() and float(s) > 100000:
                    s = f"${float(s):,.0f}"
                parts.append(s)
            lines.append(f"{i}. {' — '.join(parts)}")
        
        total = len(rows)
        header = f"He encontrado {total} resultado{'s' if total > 1 else ''}:\n\n"
        footer = "\n\n*(Muestro hasta 20 resultados)*" if total > 20 else ""
        return header + "\n".join(lines) + footer

    except Exception:
        # Fallback recursive cleanup if ast fails
        res = clean.replace("[", "").replace("]", "").replace("(", "").replace(")", "").replace("'", "").strip()
        if res.endswith(","): res = res[:-1]
        return f"Aquí tienes la información:\n**{res}**"

def ask_database(user_question: str, history: list = None) -> str:
    print(f"[AI] Nueva consulta: {user_question}")
    try:
        db = get_db_instance()
        llm = get_llm()

        history_str = ""
        if history:
            for msg in history[-5:]:
                history_str += f"{msg.get('role')}: {msg.get('content')[:150]}\n"

        prompt = f"""Eres un experto en MySQL para la App Guadua. Genera SOLO el código SQL (SELECT) para responder a la pregunta.

{DB_SCHEMA}

CONTEXTO PREVIO:
{history_str}

REGLAS:
- Solo responde con el SQL, sin explicaciones ni markdown.
- Usa LIMIT 30.
- Filtra por BContrato.estado LIKE 'Activo%' siempre.

Pregunta: {user_question}
SQL:"""

        print("[AI] Generando SQL...")
        sql_query = llm.invoke(prompt).content.strip()
        sql_query = sql_query.replace("```sql", "").replace("```", "").strip()
        print(f"[AI] SQL: {sql_query}")

        if not sql_query.upper().startswith("SELECT"):
            return "Solo puedo realizar consultas de lectura."

        print("[AI] Ejecutando...")
        result = db.run(sql_query)
        print(f"[AI] Éxito: {len(str(result))} bytes")

        return _format_result(result)

    except Exception as e:
        print(f"[AI] Error: {str(e)}")
        return f"Ocurrió un error: {str(e)}"
