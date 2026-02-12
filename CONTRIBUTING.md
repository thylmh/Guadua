# Guía de contribución

Gracias por contribuir a **Guadua**. Este documento resume el flujo recomendado para cambios de código, documentación y despliegue.

## 1. Flujo de trabajo

1. Crea una rama descriptiva:
   - `feat/...` para funcionalidades.
   - `fix/...` para correcciones.
   - `docs/...` para documentación.
2. Haz cambios pequeños y atómicos.
3. Valida localmente antes de abrir PR.
4. Abre PR con contexto: problema, solución y riesgo.

## 2. Preparación de entorno local

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # En Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Configuración
- Crea un archivo `env.yaml` en la raíz del repo usando `backend/.env.example` como referencia.
- No subas secretos reales al repositorio.

## 3. Validaciones mínimas antes de PR

Desde la raíz del proyecto:

```bash
python -m compileall backend/app
```

Si modificas frontend, valida manualmente los flujos impactados (login, dashboard, módulos tocados).

## 4. Convenciones

- Prioriza nombres explícitos en funciones y variables.
- Evita funciones muy largas; separa lógica de negocio de lógica HTTP.
- Mantén cambios de refactor separados de cambios funcionales cuando sea posible.
- Actualiza documentación cuando cambies comportamiento.

## 5. Checklist de PR

- [ ] El cambio resuelve un problema concreto y está explicado.
- [ ] Se ejecutaron validaciones locales.
- [ ] No se incluyeron secretos ni credenciales.
- [ ] Se actualizó documentación relevante (`README`, módulos, endpoints, etc.).

