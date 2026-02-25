from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.services.payroll_service import mensualizar_base_30

def get_dashboard_global(db: Session, anio: int) -> Dict[str, Any]:
    # 1. Get all financings for the year
    query = text("""
        SELECT 
            f.*, 
            c.id_contrato, c.atep,
            p.Cargo as cargo, p.Banda as banda, p.Familia as familia, p.IDPosicion as posicion_c,
            p.Direccion as direccion,
            d.p_nombre, d.s_nombre, d.p_apellido, d.s_apellido,
            y.id_proyecto as nombre_proyecto
        FROM BFinanciacion f
        LEFT JOIN BContrato c ON f.id_contrato = c.id_contrato
        LEFT JOIN BPosicion p ON c.posicion = p.IDPosicion
        LEFT JOIN BData d ON f.cedula = d.cedula
        LEFT JOIN BProyecto y ON f.id_proyecto = y.id_proyecto
        WHERE YEAR(f.fecha_inicio) = :anio OR YEAR(f.fecha_fin) = :anio
    """)
    rows = db.execute(query, {"anio": anio}).mappings().all()
    
    # 2. Get Increments
    inc_query = text("SELECT * FROM BIncremento")
    incs = db.execute(inc_query).mappings().all()
    incrementos = {int(r["anio"]): dict(r) for r in incs}
    
    # 3. Process
    tramos_data = []
    for r in rows:
        d = dict(r)
        d["nombre_completo"] = f"{d.get('p_nombre','')} {d.get('p_apellido','')}".strip()
        # Clean numeric
        for k, v in d.items():
            if hasattr(v, '__float__') and v is not None: d[k] = float(v)
        tramos_data.append(d)
        
    mensualizado = mensualizar_base_30(tramos_data, incrementos)
    
    # 4. Filter only for the current year
    mensualizado_anio = [m for m in mensualizado if m["anioMes"].startswith(str(anio))]
    
    return {
        "anio": anio,
        "mensualizado": mensualizado_anio,
        "raw_count": len(rows)
    }

def get_whitelist(db: Session) -> List[Dict[str, Any]]:
    query = text("SELECT email, role, created_at FROM BWhitelist ORDER BY created_at DESC")
    return [dict(r) for r in db.execute(query).mappings().all()]

def save_whitelist(db: Session, email: str, role: str):
    query = text("""
        INSERT INTO BWhitelist (email, role) VALUES (:email, :role)
        ON DUPLICATE KEY UPDATE role = :role
    """)
    db.execute(query, {"email": email, "role": role})
    db.commit()

def delete_whitelist(db: Session, email: str):
    query = text("DELETE FROM BWhitelist WHERE email = :email")
    db.execute(query, {"email": email})
    db.commit()

def get_incrementos(db: Session) -> List[Dict[str, Any]]:
    query = text("SELECT * FROM BIncremento ORDER BY anio DESC")
    return [dict(r) for r in db.execute(query).mappings().all()]

def save_incremento(db: Session, data: Dict[str, Any]):
    query = text("""
        INSERT INTO BIncremento (anio, smlv, transporte, dotacion, porcentaje_aumento)
        VALUES (:anio, :smlv, :transporte, :dotacion, :porcentaje_aumento)
        ON DUPLICATE KEY UPDATE 
            smlv = :smlv, transporte = :transporte, 
            dotacion = :dotacion, porcentaje_aumento = :porcentaje_aumento
    """)
    db.execute(query, data)
    db.commit()
