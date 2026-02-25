
# 1. Generar Tag único y construir la imagen
$TAG = (Get-Date -Format "yyyyMMdd-HHmmss")
$IMAGE_URL = "southamerica-east1-docker.pkg.dev/bosque-485105/bosque-api/bosque-api:$TAG"
Write-Host "Construyendo imagen: $IMAGE_URL"
gcloud builds submit backend --region=southamerica-east1 --tag $IMAGE_URL --project bosque-485105

# 2. Actualizar el Servicio API (bosque-api)
Write-Host "Desplegando bosque-api..."
gcloud run deploy bosque-api `
  --image $IMAGE_URL `
  --platform managed --region southamerica-east1 --allow-unauthenticated `
  --add-cloudsql-instances "bosque-485105:southamerica-east1:bosquebd" `
  --env-vars-file env.yaml `
  --project bosque-485105 `
  --memory 2Gi --cpu 1 --cpu-boost --timeout 300

# 3. Actualizar el JOB de Sincronización (bosque)
Write-Host "Actualizando Job bosque..."
gcloud run jobs update bosque `
  --image $IMAGE_URL `
  --region southamerica-east1 `
  --set-cloudsql-instances "bosque-485105:southamerica-east1:bosquebd" `
  --env-vars-file env.yaml `
  --command "python" --args "sync_novasoft.py" `
  --project bosque-485105


# Frontend
Write-Host "Subiendo Frontend (Arquitectura Modular)..."
# 1. Subir todo el directorio frontend
# Nota: Usamos -r para recursivo. 
# Importante: Estar en la raiz del proyecto donde está la carpeta 'frontend'
gsutil cp -r frontend/* gs://bosque-frontend

# 2. Configurar página de inicio (Index.html Mayúscula)
gsutil web set -m Index.html -e Index.html gs://bosque-frontend

# 3. Configurar metadatos del HTML
gsutil setmeta -h "Content-Type:text/html; charset=utf-8" -h "Cache-Control:no-cache, max-age=0" gs://bosque-frontend/Index.html

# 4. Configurar metadatos para Assets (CSS y JS)
# CSS
gsutil setmeta -h "Content-Type:text/css" -h "Cache-Control:no-cache, max-age=0" gs://bosque-frontend/css/*.css
# JS Main
gsutil setmeta -h "Content-Type:application/javascript" -h "Cache-Control:no-cache, max-age=0" gs://bosque-frontend/js/*.js
# JS Modules
gsutil setmeta -h "Content-Type:application/javascript" -h "Cache-Control:no-cache, max-age=0" gs://bosque-frontend/js/modules/*.js

# 5. Asegurar permisos públicos
gsutil iam ch allUsers:objectViewer gs://bosque-frontend

Write-Host "Despliegue completado exitosamente."
