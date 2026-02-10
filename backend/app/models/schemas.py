from datetime import date
from typing import Optional
from pydantic import BaseModel, Field

class TramoFinanciacion(BaseModel):
    id: Optional[str] = Field(default=None, description="id_financiacion")
    cedula: str
    fechaInicio: date
    fechaFin: date
    salario: float
    proyecto: str
    rubro: Optional[str] = None
    fuente: Optional[str] = None
    componente: Optional[str] = None
    subcomponente: Optional[str] = None
    categoria: Optional[str] = None
    responsable: Optional[str] = None
    justificacion: Optional[str] = None

class UserWhitelist(BaseModel):
    email: str
    role: str = "user"
    cedula: Optional[str] = None

class Incremento(BaseModel):
    anio: int
    smlv: float
    transporte: float
    dotacion: float
    porcentaje_aumento: float

class PosicionSchema(BaseModel):
    id: str = Field(..., alias="IDPosicion")
    salario: Optional[float] = Field(None, alias="Salario")
    familia: Optional[str] = Field(None, alias="Familia")
    cargo: Optional[str] = Field(None, alias="Cargo")
    rol: Optional[str] = Field(None, alias="Rol")
    banda: Optional[str] = Field(None, alias="Banda")
    direccion: Optional[str] = Field(None, alias="Direccion")
    gerencia: Optional[str] = Field(None, alias="Gerencia")
    area: Optional[str] = Field(None, alias="Area")
    subarea: Optional[str] = Field(None, alias="Subarea")
    planta: Optional[str] = Field(None, alias="Planta")
    tipo_planta: Optional[str] = Field(None, alias="Tipo_planta")
    base_fuente: Optional[str] = Field(None, alias="Base_Fuente")
    estado: Optional[str] = Field("Vacante", alias="Estado")
    p_jefe: Optional[str] = Field(None, alias="P_Jefe")
    observacion: Optional[str] = Field(None, alias="Observacion")

    class Config:
        populate_by_name = True
