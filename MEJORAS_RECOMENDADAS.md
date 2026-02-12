# Mejoras recomendadas para Guadua

Este documento propone mejoras priorizadas para fortalecer **calidad**, **seguridad**, **operación** y **producto** en Guadua.

## 1) Mejoras de alto impacto (corto plazo)

## Estado actual (implementado en este repositorio)

- ✅ Se añadió CI mínimo en GitHub Actions con validación de sintaxis para `backend/app` (`.github/workflows/ci.yml`).
- ✅ Se añadió `CONTRIBUTING.md` con flujo de ramas, validaciones y checklist de PR.
- ✅ Se añadió `backend/.env.example` como plantilla de configuración sin secretos.


### 1.1 Calidad y confiabilidad
- Incorporar una base mínima de pruebas automáticas:
  - **Backend**: pruebas unitarias de servicios críticos (nómina, presupuesto, vacantes).
  - **API**: pruebas de endpoints clave con `pytest` + `httpx`.
  - **Frontend**: pruebas de integración ligeras para módulos críticos de cálculo.
- Definir un pipeline CI que ejecute lint + tests en cada PR.
- Agregar validaciones de contratos API (request/response) para evitar regresiones silenciosas.

### 1.2 Seguridad
- Revisar y estandarizar gestión de secretos (no usar archivos sensibles en repositorio).
- Endurecer autenticación/autorización con controles por rol en todos los endpoints críticos.
- Activar controles anti-abuso en API (rate limit, auditoría reforzada para operaciones sensibles).
- Introducir escaneo SAST/dependencias (p. ej. `pip-audit`, `bandit`) en CI.

### 1.3 Operación y observabilidad
- Estandarizar logging estructurado (JSON) con trazabilidad por request (`request_id`).
- Exponer métricas técnicas y de negocio:
  - latencia por endpoint,
  - errores por módulo,
  - tiempos de sincronización,
  - variación presupuestal por período.
- Añadir healthchecks y readiness checks explícitos en backend para despliegues más seguros.

## 2) Mejoras de arquitectura (mediano plazo)

### 2.1 Frontend
- Migrar gradualmente a TypeScript en módulos críticos para reducir errores en runtime.
- Definir una capa de estado compartido para disminuir acoplamiento entre módulos.
- Crear una librería interna de componentes UI reutilizables (tablas, filtros, cards, modales).

### 2.2 Backend
- Separar servicios con fronteras más claras por dominio (`nomina`, `presupuesto`, `talento`, `auditoria`).
- Adoptar migraciones versionadas de base de datos (Alembic) en lugar de depender solo de `estructura.sql`.
- Establecer contratos internos para integraciones externas (sincronizaciones con Novasoft y vacantes).

### 2.3 Datos
- Definir un modelo explícito para snapshots presupuestales con versionado y metadata de aprobación.
- Mejorar estrategias de indexación en tablas de consulta pesada.
- Añadir políticas de retención/archivo para datos históricos de auditoría.

## 3) Mejoras de producto y UX

- Implementar un sistema de alertas configurables por rol (financiero, nómina, talento).
- Añadir comparativas visuales de escenarios (base vs proyectado vs ejecutado).
- Incorporar trazabilidad funcional: “qué cambió, quién lo cambió y por qué” en vistas clave.
- Mejorar accesibilidad (contraste, navegación por teclado, foco visible, etiquetas semánticas).

## 4) Plan sugerido por fases

### Fase 1 (2–3 semanas)
1. CI mínimo (lint + tests backend smoke + checks de seguridad básicos).
2. Logging estructurado y healthchecks.
3. Cobertura de permisos en endpoints críticos.

### Fase 2 (3–5 semanas)
1. Suite de pruebas ampliada (API + frontend crítico).
2. Migraciones con Alembic.
3. Dashboards de observabilidad técnica.

### Fase 3 (4–8 semanas)
1. Refactor por dominios en backend.
2. Componentización UI + estado compartido en frontend.
3. Alertas de negocio y comparador avanzado de escenarios.

## 5) Quick wins inmediatos

- Crear `CONTRIBUTING.md` con guía de desarrollo local y convenciones.
- Añadir `.env.example` y política clara de configuración por entorno.
- Configurar formateo/lint automático (`ruff`, `black`, `isort`, `eslint` si aplica).
- Publicar una matriz de roles/permisos en documentación técnica.

---

Si quieres, en un siguiente paso puedo convertir este documento en un **roadmap ejecutable** con issues priorizados (impacto/esfuerzo), responsables sugeridos y criterios de aceptación por entrega.
