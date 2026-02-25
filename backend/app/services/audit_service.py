from app.core.database import engine
from sqlalchemy import text
from typing import Optional, Dict, Any
import json
import datetime
from decimal import Decimal

class AuditService:
    def __init__(self, db: Any = None):
        # DB session is no longer required but kept for compatibility
        pass

    def _sanitize(self, obj):
        if isinstance(obj, datetime.datetime):
            return obj.isoformat() + "Z"
        if isinstance(obj, datetime.date):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, set):
            return list(obj)
        return obj

    def log_event(
        self,
        actor_email: str,
        module: str,
        action: str,
        resource_id: Optional[str] = None,
        old_values: Optional[Dict[str, Any]] = None,
        new_values: Optional[Dict[str, Any]] = None,
        details: Optional[str] = None,
        actor_ip: Optional[str] = None
    ):
        try:
            import datetime
            
            # Manual JSON dump with robust default handler
            def default_serializer(obj):
                if isinstance(obj, (datetime.date, datetime.datetime)):
                    return obj.isoformat()
                if isinstance(obj, Decimal):
                    return float(obj)
                return str(obj)

            old_json = json.dumps(old_values, default=default_serializer) if old_values else None
            new_json = json.dumps(new_values, default=default_serializer) if new_values else None
            
            query = text("""
                INSERT INTO BAuditoria (
                    timestamp, actor_email, module, action, resource_id, 
                    old_values, new_values, details, actor_ip
                ) VALUES (
                    CONVERT_TZ(NOW(), '+00:00', '-05:00'), :email, :mod, :act, :rid, 
                    :old, :new, :det, :ip
                )
            """)
            
            params = {
                "email": actor_email,
                "mod": module,
                "act": action,
                "rid": resource_id,
                "old": old_json,
                "new": new_json,
                "det": details,
                "ip": actor_ip
            }
            
            # Direct Engine Execution independently of any session
            with engine.begin() as conn:
                conn.execute(query, params)
                
            return True
        except Exception as e:
            try:
                with open("audit_errors.log", "a") as f:
                    f.write(f"FAILED AUDIT LOG: {str(e)}\n\n")
            except: pass
            print(f"CRITICAL AUDIT FAILURE: {e}")
            return False

    def get_logs(
        self, 
        limit: int = 100, 
        offset: int = 0, 
        module: Optional[str] = None, 
        actor: Optional[str] = None,
        action: Optional[str] = None
    ):
        # Read operations can still use raw SQL for consistency
        try:
            where_clauses = []
            params = {"lim": limit, "off": offset}
            
            if module:
                where_clauses.append("module = :mod")
                params["mod"] = module
            if actor:
                where_clauses.append("actor_email LIKE :act")
                params["act"] = f"%{actor}%"
            if action:
                where_clauses.append("action = :action")
                params["action"] = action
                
            where_str = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""
            
            sql = text(f"""
                SELECT * FROM BAuditoria 
                {where_str}
                ORDER BY timestamp DESC
                LIMIT :lim OFFSET :off
            """)
            
            count_sql = text(f"SELECT COUNT(*) FROM BAuditoria {where_str}")
            
            with engine.connect() as conn:
                total = conn.execute(count_sql, params).scalar()
                rows = conn.execute(sql, params).mappings().all()
                
            return {"total": total, "logs": [dict(r) for r in rows]}
        except Exception as e:
            print(f"Failed to fetch logs: {e}")
            return {"total": 0, "logs": []}
