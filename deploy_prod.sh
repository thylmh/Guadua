#!/bin/bash
set -e

echo "==================================================="
echo "  Guadua - Despliegue a Producción"
echo "==================================================="

# 0. Cargar variables reales (evita desplegar CHANGE_ME_*)
ENV_SOURCE_FILE=".env.local"
if [[ ! -f "$ENV_SOURCE_FILE" ]]; then
    echo "❌ No existe $ENV_SOURCE_FILE. Crea este archivo con credenciales reales antes de desplegar."
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_SOURCE_FILE"
set +a

if [[ -z "${CORS_ORIGINS_RAW:-}" && -n "${CORS_ORIGINS:-}" ]]; then
    CORS_ORIGINS_RAW="$CORS_ORIGINS"
fi

required_vars=(
    DB_USER DB_PASS DB_NAME CLOUDSQL_CONNECTION_NAME
    ERP_USER ERP_PASS ERP_HOST ERP_PORT ERP_DB
    ALLOWED_DOMAIN CORS_ORIGINS_RAW AUDIENCE
)

for var_name in "${required_vars[@]}"; do
    var_value="${!var_name:-}"
    if [[ -z "$var_value" ]]; then
        echo "❌ Falta variable obligatoria: $var_name (en $ENV_SOURCE_FILE)."
        exit 1
    fi
    if [[ "$var_value" == CHANGE_ME_* ]]; then
        echo "❌ Variable inválida ($var_name): detectado placeholder CHANGE_ME_*."
        exit 1
    fi
done

yaml_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

TMP_ENV_FILE="$(mktemp -t guadua-env-XXXXXX.yaml)"
trap 'rm -f "$TMP_ENV_FILE"' EXIT

cat > "$TMP_ENV_FILE" <<EOF
DB_USER: "$(yaml_escape "$DB_USER")"
DB_PASS: "$(yaml_escape "$DB_PASS")"
DB_NAME: "$(yaml_escape "$DB_NAME")"
CLOUDSQL_CONNECTION_NAME: "$(yaml_escape "$CLOUDSQL_CONNECTION_NAME")"
ERP_USER: "$(yaml_escape "$ERP_USER")"
ERP_PASS: "$(yaml_escape "$ERP_PASS")"
ERP_HOST: "$(yaml_escape "$ERP_HOST")"
ERP_PORT: "$(yaml_escape "$ERP_PORT")"
ERP_DB: "$(yaml_escape "$ERP_DB")"
ALLOWED_DOMAIN: "$(yaml_escape "$ALLOWED_DOMAIN")"
CORS_ORIGINS_RAW: "$(yaml_escape "$CORS_ORIGINS_RAW")"
AUDIENCE: "$(yaml_escape "$AUDIENCE")"
ALLOW_LOCAL_DEBUG_BYPASS: "${ALLOW_LOCAL_DEBUG_BYPASS:-false}"
EOF

# 1. Generar Tag único y construir la imagen
TAG=$(date +"%Y%m%d-%H%M%S")
IMAGE_URL="southamerica-east1-docker.pkg.dev/bosque-485105/bosque-api/bosque-api:$TAG"

echo ""
echo "🏗️  Construyendo imagen: $IMAGE_URL"
gcloud builds submit backend \
    --region=southamerica-east1 \
    --tag "$IMAGE_URL" \
    --project bosque-485105

# 2. Actualizar el Servicio API (bosque-api)
echo ""
echo "🚀 Desplegando bosque-api..."
gcloud run deploy bosque-api \
    --image "$IMAGE_URL" \
    --platform managed \
    --region southamerica-east1 \
    --allow-unauthenticated \
    --add-cloudsql-instances "bosque-485105:southamerica-east1:bosquebd" \
    --env-vars-file "$TMP_ENV_FILE" \
    --project bosque-485105 \
    --memory 2Gi \
    --cpu 1 \
    --cpu-boost \
    --timeout 300

# 3. Actualizar el JOB de Sincronización (bosque)
echo ""
echo "🔄 Actualizando Job bosque..."
gcloud run jobs update bosque \
    --image "$IMAGE_URL" \
    --region southamerica-east1 \
    --set-cloudsql-instances "bosque-485105:southamerica-east1:bosquebd" \
    --env-vars-file "$TMP_ENV_FILE" \
    --command "python" \
    --args "sync_novasoft.py" \
    --project bosque-485105

# 4. Frontend
echo ""
echo "🌐 Subiendo Frontend (Arquitectura Modular)..."

# Subir todo el directorio frontend
gsutil cp -r frontend/* gs://bosque-frontend

# Configurar página de inicio
gsutil web set -m Index.html -e Index.html gs://bosque-frontend

# Configurar metadatos del HTML
gsutil setmeta \
    -h "Content-Type:text/html; charset=utf-8" \
    -h "Cache-Control:no-cache, max-age=0" \
    gs://bosque-frontend/Index.html

# Configurar metadatos para Assets CSS
gsutil setmeta \
    -h "Content-Type:text/css" \
    -h "Cache-Control:no-cache, max-age=0" \
    "gs://bosque-frontend/css/*.css"

# Configurar metadatos para Assets JS Main
gsutil setmeta \
    -h "Content-Type:application/javascript" \
    -h "Cache-Control:no-cache, max-age=0" \
    "gs://bosque-frontend/js/*.js"

# Configurar metadatos para Assets JS Modules
gsutil setmeta \
    -h "Content-Type:application/javascript" \
    -h "Cache-Control:no-cache, max-age=0" \
    "gs://bosque-frontend/js/modules/*.js"

# Asegurar permisos públicos
gsutil iam ch allUsers:objectViewer gs://bosque-frontend

echo ""
echo "==================================================="
echo "✅ Despliegue completado exitosamente."
echo "   Imagen: $IMAGE_URL"
echo "==================================================="
