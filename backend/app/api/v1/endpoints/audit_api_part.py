
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
        today_q = text("SELECT COUNT(*) FROM BAuditoria WHERE DATE(timestamp) = CURDATE()")
        top_mod_q = text("SELECT module, COUNT(*) as c FROM BAuditoria GROUP BY module ORDER BY c DESC LIMIT 1")
        top_act_q = text("SELECT actor_email, COUNT(*) as c FROM BAuditoria GROUP BY actor_email ORDER BY c DESC LIMIT 1")
        
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
