#!/bin/bash
set -e

echo "==================================================="
echo "  Guadua - Despliegue a Producción"
echo "==================================================="

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
    --env-vars-file env.yaml \
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
    --env-vars-file env.yaml \
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
