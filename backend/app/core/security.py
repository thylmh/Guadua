from typing import Any, Dict, List, Optional
from fastapi import Header, HTTPException, Depends
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from sqlalchemy import text
from app.core.config import settings
from app.core.database import engine

def get_bearer_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Falta Authorization: Bearer <token>.")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Formato inválido de Authorization. Use Bearer <token>.")
    return parts[1].strip()

def verify_google_token(token: str) -> Dict[str, Any]:
    req = google_requests.Request()
    try:
        if settings.AUDIENCE:
            claims = id_token.verify_oauth2_token(token, req, settings.AUDIENCE)
        else:
            claims = id_token.verify_oauth2_token(token, req)
        return claims
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token inválido o expirado: {str(e)}")

async def get_current_user(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Dict[str, Any]:
    # Bypass for local development
    if not authorization or authorization in ["Bearer undefined", "Bearer null", "Bearer local"]:
        # Try to connect to DB to verify we are actually online
        try:
            with engine.connect() as conn:
                pass
        except Exception:
             # DB Down -> Only then return Mock
             return {
                "email": "hbettin@humboldt.org.co",
                "role": "admin",
                "nombre": "Desarrollador Local (Offline)",
                "source": "local_debug_offline"
            }
        
        # If DB is up, we return the Dev User but mark it as such
        return {
            "email": "hbettin@humboldt.org.co",
            "role": "admin",
            "nombre": "Desarrollador Local (DB Connected)",
            "source": "local_debug"
        }

    token = get_bearer_token(authorization)
    claims = verify_google_token(token)

    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="El token no contiene email.")

    if not email.endswith(f"@{settings.ALLOWED_DOMAIN}"):
        raise HTTPException(status_code=403, detail=f"Dominio @{settings.ALLOWED_DOMAIN} requerido.")

    # Check authorization in DB
    with engine.connect() as conn:
        q = text("SELECT role FROM BWhitelist WHERE email = :email LIMIT 1")
        row = conn.execute(q, {"email": email}).fetchone()
        
        # Priorizar persona con contrato ACTIVO en caso de email duplicado en BData
        q_name = text("""
            SELECT d.p_nombre, d.p_apellido
            FROM BData d
            JOIN BContrato c ON d.cedula = c.cedula
            WHERE d.correo_electronico = :email
              AND c.estado LIKE 'Activo%'
            ORDER BY c.fecha_ingreso DESC
            LIMIT 1
        """)
        row_name = conn.execute(q_name, {"email": email}).fetchone()

        # Fallback: si no hay contrato activo con ese email, usar cualquier registro de BData
        if not row_name:
            q_name_fallback = text(
                "SELECT p_nombre, p_apellido FROM BData WHERE correo_electronico = :email LIMIT 1"
            )
            row_name = conn.execute(q_name_fallback, {"email": email}).fetchone()

    if not row:
        raise HTTPException(
            status_code=403,
            detail="Usuario no autorizado. Solicita acceso para ser incluido en BWhitelist.",
        )

    role = row[0]
    if role not in ("admin", "user", "financiero", "talento", "nomina"):
        raise HTTPException(status_code=403, detail="Rol inválido en BWhitelist.")
    
    nombre_completo = ""
    if row_name:
        nombre_completo = f"{(row_name[0] or '').strip()} {(row_name[1] or '').strip()}".strip()

    return {"email": email, "role": role, "nombre": nombre_completo, "source": "db"}

def require_role(user: Dict[str, Any], allowed: List[str]) -> None:
    if user.get("role") not in allowed:
        raise HTTPException(status_code=403, detail="No tienes permisos para esta operación.")
