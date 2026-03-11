$ErrorActionPreference = "Stop"

# 0. Cargar variables reales (evita desplegar CHANGE_ME_*)
$ENV_SOURCE_FILE = ".env.local"
if (-not (Test-Path $ENV_SOURCE_FILE)) {
  throw "No existe $ENV_SOURCE_FILE. Crea este archivo con credenciales reales antes de desplegar."
}

$envMap = @{}
Get-Content $ENV_SOURCE_FILE | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
    $k = $matches[1]
    $v = $matches[2].Trim()
    if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
    if ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
    $envMap[$k] = $v
  }
}

if (-not $envMap.ContainsKey("CORS_ORIGINS_RAW") -and $envMap.ContainsKey("CORS_ORIGINS")) {
  $envMap["CORS_ORIGINS_RAW"] = $envMap["CORS_ORIGINS"]
}
if (-not $envMap.ContainsKey("ALLOW_LOCAL_DEBUG_BYPASS")) {
  $envMap["ALLOW_LOCAL_DEBUG_BYPASS"] = "false"
}

$requiredVars = @(
  "DB_USER","DB_PASS","DB_NAME","CLOUDSQL_CONNECTION_NAME",
  "ERP_USER","ERP_PASS","ERP_HOST","ERP_PORT","ERP_DB",
  "ALLOWED_DOMAIN","CORS_ORIGINS_RAW","AUDIENCE"
)

foreach ($name in $requiredVars) {
  if (-not $envMap.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($envMap[$name])) {
    throw "Falta variable obligatoria: $name (en $ENV_SOURCE_FILE)."
  }
  if ($envMap[$name].StartsWith("CHANGE_ME_")) {
    throw "Variable inválida ($name): detectado placeholder CHANGE_ME_*."
  }
}

function Escape-Yaml([string]$value) {
  return ($value -replace '\\', '\\\\' -replace '"', '\"')
}

$tmpEnvFile = Join-Path $env:TEMP ("guadua-env-{0}.yaml" -f ([Guid]::NewGuid().ToString("N")))
$yamlLines = @(
  "DB_USER: `"$([Escape-Yaml $envMap['DB_USER'])`"",
  "DB_PASS: `"$([Escape-Yaml $envMap['DB_PASS'])`"",
  "DB_NAME: `"$([Escape-Yaml $envMap['DB_NAME'])`"",
  "CLOUDSQL_CONNECTION_NAME: `"$([Escape-Yaml $envMap['CLOUDSQL_CONNECTION_NAME'])`"",
  "ERP_USER: `"$([Escape-Yaml $envMap['ERP_USER'])`"",
  "ERP_PASS: `"$([Escape-Yaml $envMap['ERP_PASS'])`"",
  "ERP_HOST: `"$([Escape-Yaml $envMap['ERP_HOST'])`"",
  "ERP_PORT: `"$([Escape-Yaml $envMap['ERP_PORT'])`"",
  "ERP_DB: `"$([Escape-Yaml $envMap['ERP_DB'])`"",
  "ALLOWED_DOMAIN: `"$([Escape-Yaml $envMap['ALLOWED_DOMAIN'])`"",
  "CORS_ORIGINS_RAW: `"$([Escape-Yaml $envMap['CORS_ORIGINS_RAW'])`"",
  "AUDIENCE: `"$([Escape-Yaml $envMap['AUDIENCE'])`"",
  "ALLOW_LOCAL_DEBUG_BYPASS: `"$([Escape-Yaml $envMap['ALLOW_LOCAL_DEBUG_BYPASS'])`""
)
$yamlLines | Set-Content -Path $tmpEnvFile -Encoding UTF8

try {
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
    --env-vars-file $tmpEnvFile `
    --project bosque-485105 `
    --memory 2Gi --cpu 1 --cpu-boost --timeout 300

  # 3. Actualizar el JOB de Sincronización (bosque)
  Write-Host "Actualizando Job bosque..."
  gcloud run jobs update bosque `
    --image $IMAGE_URL `
    --region southamerica-east1 `
    --set-cloudsql-instances "bosque-485105:southamerica-east1:bosquebd" `
    --env-vars-file $tmpEnvFile `
    --command "python" --args "sync_novasoft.py" `
    --project bosque-485105

  # Frontend
  Write-Host "Subiendo Frontend (Arquitectura Modular)..."
  gsutil cp -r frontend/* gs://bosque-frontend
  gsutil web set -m Index.html -e Index.html gs://bosque-frontend
  gsutil setmeta -h "Content-Type:text/html; charset=utf-8" -h "Cache-Control:no-cache, max-age=0" gs://bosque-frontend/Index.html
  gsutil setmeta -h "Content-Type:text/css" -h "Cache-Control:no-cache, max-age=0" gs://bosque-frontend/css/*.css
  gsutil setmeta -h "Content-Type:application/javascript" -h "Cache-Control:no-cache, max-age=0" gs://bosque-frontend/js/*.js
  gsutil setmeta -h "Content-Type:application/javascript" -h "Cache-Control:no-cache, max-age=0" gs://bosque-frontend/js/modules/*.js
  gsutil iam ch allUsers:objectViewer gs://bosque-frontend

  Write-Host "Despliegue completado exitosamente."
}
finally {
  if (Test-Path $tmpEnvFile) { Remove-Item $tmpEnvFile -Force }
}
