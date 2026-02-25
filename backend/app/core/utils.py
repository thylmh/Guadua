import math
from datetime import date, datetime
from typing import Any, Optional

def to_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except Exception:
            return None
    return None

def month_start(d: date) -> date:
    return date(d.year, d.month, 1)

def round_hundred(x: float) -> float:
    """Redondea a la centena más cercana con lógica 0.5 hacia arriba (estándar)"""
    return float(math.floor(x / 100.0 + 0.5) * 100)
