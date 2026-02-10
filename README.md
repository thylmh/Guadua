# 🌳 GUADUA ERP — Inteligencia de Nómina

**Guadua** es una plataforma integral de gestión de nómina y talento humano diseñada para el Instituto Alexander von Humboldt. Su objetivo es centralizar la proyección presupuestal, la conciliación de liquidaciones y la gestión estratégica de vacantes en una interfaz moderna y eficiente.

---

## 🚀 Características Principales

### 1. 📊 Dashboard Estratégico
- Visión global de costos de nómina proyectados vs. ejecutados.
- Alertas tempranas de desviaciones presupuestales.
- Distribución de costos por fuentes de financiación y centros de costos.

### 2. 👥 Gestión de Talento
- **Consulta Individual**: Historial detallado de cada colaborador con proyección de costos.
- **Gestión de Vacantes**: Control de posiciones abiertas, perfiles y simulación de impacto financiero por contratación.

### 3. 💵 Motor de Presupuesto
- **Líneas Base**: Congelación de versiones presupuestales para auditoría y comparativas (Snapshots).
- **Proyección Automática**: Cálculo de costos futuros basado en incrementos legales (IPC, SMLV) y reglas institucionales.
- **Comparador**: Herramienta de diferencias para identificar cambios entre versiones del presupuesto.

### 4. ⚙️ Administración y Seguridad
- **Roles y Permisos**: Sistema granular (Admin, Talento, Financiero, Nómina, Usuario).
- **Auditoría**: Registro inmutable de cambios críticos en el sistema.
- **Solicitudes**: Flujo de aprobación para cambios sensibles en la nómina.

---

## 🛠️ Stack Tecnológico

La arquitectura de Guadua está desacoplada para garantizar escalabilidad y mantenibilidad:

- **Frontend**: Vanilla JS (ES6+) con arquitectura modular.
  - Diseño: CSS nativo con variables (Tokens de diseño institucional).
  - Gráficos: Chart.js / ECharts.
- **Backend**: Python (FastAPI).
  - ORM: SQLAlchemy.
  - Base de Datos: Google Cloud SQL (MySQL).
  - Autenticación: Google OAuth 2.0.
- **Infraestructura**: Google Cloud Platform (GCP).
  - **Cloud Run**: Para el API y Jobs de sincronización.
  - **Cloud Storage**: Hosting del Frontend estático.
  - **Docker**: Contenerización del servicio backend.

---

## 💻 Instalación Local

### Prerrequisitos
- Python 3.9+
- Google Cloud SDK (`gcloud`) auteticado.
- Acceso a la base de datos de desarrollo (Cloud SQL Proxy).

### Pasos
1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/thylmh/Guadua.git
   cd Guadua
   ```

2. **Backend**:
   ```bash
   cd backend
   python -m venv .venv
   .\.venv\Scripts\activate
   pip install -r ../requirements.txt
   ```

3. **Variables de Entorno**:
   Asegúrate de tener el archivo `env.yaml` o las variables configuradas en tu entorno local para la conexión a BD.

4. **Ejecutar Localmente**:
   Puedes usar el script de utilidad (PowerShell):
   ```powershell
   ./run_local.ps1
   ```
   Esto levantará el backend en `localhost:8080` y servirá el frontend.

---

## 🚀 Despliegue a Producción

El despliegue está automatizado mediante scripts de PowerShell que interactúan con GCP.

**Comando de Despliegue Unificado:**
```powershell
./deploy_prod.ps1
```

**¿Qué hace este script?**
1. **Backend**: Construye la imagen Docker, la sube a Artifact Registry y actualiza el servicio Cloud Run `bosque-api`.
2. **Jobs**: Actualiza el Job de sincronización `bosque` en Cloud Run Jobs.
3. **Frontend**: Sube los archivos estáticos (`html`, `css`, `js`) al bucket público de Cloud Storage, configurando los headers de caché y tipos MIME correctos.

---

## 📂 Estructura del Proyecto

```text
/guadua_seed
├── backend/            # API REST (FastAPI)
│   ├── app/
│   │   ├── api/        # Endpoints (v1)
│   │   ├── core/       # Config, Seguridad, DB
│   │   ├── models/     # Modelos SQLAlchemy
│   │   └── services/   # Lógica de Negocio Compleja
│   └── Dockerfile      # Definición de contenedor
│
├── frontend/           # Cliente Web
│   ├── css/            # Estilos (styles.css)
│   ├── js/
│   │   ├── modules/    # Módulos de lógica (admin, nomina, dashboard)
│   │   ├── main.js     # Router y orquestador
│   │   └── auth.js     # Gestión de sesión e identidad
│   └── Index.html      # Punto de entrada único (SPA)
│
├── deploy_prod.ps1     # Script de despliegue maestro
└── estructura.sql      # Schema de base de datos de referencia
```

---

## 🎨 Guía de Estilo

El diseño sigue el **[BOSQUE_DESIGN_SPEC.md] (No incluido en seed, referencia interna)**:
- **Colores**: Uso estricto de la paleta institucional (Verdes y Azules Humboldt).
- **Componentes**: Tarjetas de acción (`action-card`) y grids premium (`luxury-grid`).
- **UX**: Prioridad a la claridad de datos sobre la decoración.

---

© 2026 Instituto de Investigación de Recursos Biológicos Alexander von Humboldt.
*Desarrollado para la Dirección de Talento Humano.*
