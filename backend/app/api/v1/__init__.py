from fastapi import APIRouter
from app.api.v1.endpoints import employees, admin, users, incrementos, vacantes, presupuesto, nomina

api_router = APIRouter()
api_router.include_router(employees.router, prefix="/employees", tags=["employees"])
api_router.include_router(users.router, prefix="/admin", tags=["users"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(incrementos.router, prefix="/admin", tags=["incrementos"])
api_router.include_router(vacantes.router, prefix="/vacantes", tags=["vacantes"])
api_router.include_router(presupuesto.router, prefix="/admin/presupuesto", tags=["presupuesto"])
api_router.include_router(nomina.router, prefix="/admin", tags=["nomina"])
