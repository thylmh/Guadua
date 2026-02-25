# 🌳 GUADUA - Inteligencia de Nómina

Plataforma estratégica para la gestión, planeación y auditoría de la nómina institucional del Instituto Alexander von Humboldt.

## ✨ Características Principales (v2.5)

- **AI Database Agent:** Chatbot inteligente integrado con Vertex AI (Gemini 2.0 Flash) capaz de consultar la base de datos de nómina en lenguaje natural con respuestas instantáneas y formateadas.
- **Modern UX/UI:** Interfaz premium diseñada para la eficiencia, con navegación dinámica basada en roles, micro-animaciones y diseño responsivo.
- **Dashboard Estratégico:** Visión global de costos de nómina, inversión por direcciones y análisis de proyectos financiadores con filtros de Planta, Tipo y Base.
- **Consulta Individual:** Historial detallado de cada colaborador, tramos de financiación y proyecciones de liquidación.
- **Gestión de Vacantes:** Control de posiciones institucionales disponibles y proyección de impacto de contratación.
- **Auditoría e Integridad:** Bitácora inmutable de seguridad y flujo de aprobación de cambios presupuestales.

## 🛠️ Stack Tecnológico

- **Backend:** FastAPI (Python 3.10+), SQLAlchemy, LangChain (SQL Utilities).
- **IA:** Google Vertex AI (Gemini 2.0 Flash).
- **Frontend:** Vanilla Javascript (Arquitectura Modular), CSS3 Moderno, Tabulator, SheetJS.
- **Infraestructura:** Google Cloud Platform (Cloud Run, Cloud SQL, Vertex AI).

## 🚀 Despliegue (macOS)

Para desplegar la aplicación a producción, asegúrate de tener configurado `gcloud` y ejecuta:

```bash
./deploy_prod.sh
```

## 💻 Desarrollo Local

1. Asegúrate de tener el proxy de Cloud SQL activo.
2. Ejecuta el script de inicio local:

```bash
./run_local.sh
```

---
*Optimizado y consolidado por Antigravity - 25 de Febrero de 2026*
