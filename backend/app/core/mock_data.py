from datetime import date

# Mock data for Vacancies
MOCK_VACANTES = [
    {
        "id_posicion": "VAC-001",
        "cargo": "Investigador Principal",
        "banda": "B03",
        "familia": "Científica",
        "direccion": "Dirección de Ciencias",
        "planta": "Carrera",
        "salario_presupuestado": 8500000.0,
        "fecha_inicio_estimada": "2026-03-01",
        "fecha_fin_estimada": "2026-12-31",
        "atep": 0.00522,
        "proyecto": "PROY-GXP-2026"
    },
    {
        "id_posicion": "VAC-002",
        "cargo": "Analista de Datos",
        "banda": "B02",
        "familia": "Técnica",
        "direccion": "Dirección de Información",
        "planta": "Carrera",
        "salario_presupuestado": 4500000.0,
        "fecha_inicio_estimada": "2026-02-15",
        "fecha_fin_estimada": "2026-12-31",
        "atep": 0.00522,
        "proyecto": "PROY-DATA-RE"
    },
    {
        "id_posicion": "VAC-003",
        "cargo": "Coordinador Administrativo",
        "banda": "B02",
        "familia": "Administrativa",
        "direccion": "Dirección Administrativa",
        "planta": "Apoyo",
        "salario_presupuestado": 5200000.0,
        "fecha_inicio_estimada": "2026-04-01",
        "fecha_fin_estimada": "2026-12-31",
        "atep": 0.00522,
        "proyecto": "GASTOS-ADM"
    }
]

# Stores temporary financing tranches for vacancies
MOCK_FINANCIACION_VACANTES = []

# Mock Increments for 2026 (Fallback)
MOCK_INCREMENTOS = {
    2026: {
        "anio": 2026,
        "smlv": 1300000.0,
        "transporte": 162000.0,
        "dotacion": 150000.0,
        "porcentaje_aumento": 0.0
    }
}
