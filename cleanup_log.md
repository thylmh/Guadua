# Cleanup Log - 2026-02-25
## Protocolo: Desplegar.md

### Fase 0: Diagnóstico
- Rama actual: `cleanup/Guadua`
- Archivos detectados como "basura" o temporales: `test_connection.py`, `describe_table.py`, `check_bposicion.py`, `update_bposicion.py`, `debug_dashboard.json`.

### Fase 1: Respaldo
- Creada rama `cleanup/Guadua`.

### Fase 2: Limpieza de artefactos
- [Pendiente] Eliminación de `__pycache__` y archivos temporales.

### Fase 3: Optimización
- [Pendiente] Consolidación de cambios.

### Fase 5/7: Despliegue
- [Pendiente] Ejecución de `./deploy_prod.sh`.
