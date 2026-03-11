$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Root and Python
$ROOT = Get-Location
$PYTHON = "$ROOT\.venv\Scripts\python.exe"

# 1. Clean up
Write-Host "Limpiando procesos..."
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process cloud-sql-proxy -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. Proxy (Modo Publico - Sin credenciales ADC requeridas)
if (Test-Path ".\cloud-sql-proxy.exe") {
    $BATCH_PROXY = @"
@echo off
echo Iniciando Cloud SQL Proxy (Modo TCP Local)...
REM Nota: Si falla, pedira autenticacion via navegador la primera vez o podria requerir gcloud auth login
".\cloud-sql-proxy.exe" --address 127.0.0.1 --port 3306 bosque-485105:southamerica-east1:bosquebd
echo.
echo Proxy se ha detenido. 
echo Si el error es 'could not find default credentials', por favor ejecuta en tu terminal:
echo gcloud auth application-default login
pause
"@
    $BATCH_PROXY | Out-File -FilePath "$ROOT\start_proxy.bat" -Encoding ASCII
    Write-Host "Lanzando Proxy..."
    Start-Process "cmd.exe" "/c start_proxy.bat"
    
    Write-Host "Esperando 8 segundos a que el Proxy se estabilice..."
    Start-Sleep -s 8
}

# 3. Backend
$BATCH_BACKEND = @"
@echo off
IF EXIST "$ROOT\.env.local.cmd" CALL "$ROOT\.env.local.cmd"
SET "USE_TCP_CONNECTION=true"
SET "DB_HOST=127.0.0.1"
SET "DB_PORT=3306"
IF NOT DEFINED DB_USER echo ERROR: Falta DB_USER. Definelo en el entorno o en .env.local.cmd & pause & exit /b 1
IF NOT DEFINED DB_PASS echo ERROR: Falta DB_PASS. Definelo en el entorno o en .env.local.cmd & pause & exit /b 1
IF NOT DEFINED DB_NAME echo ERROR: Falta DB_NAME. Definelo en el entorno o en .env.local.cmd & pause & exit /b 1
IF NOT DEFINED CORS_ORIGINS_RAW SET "CORS_ORIGINS_RAW=http://localhost:8080,http://127.0.0.1:8080,http://localhost:8000,http://127.0.0.1:8000"
IF NOT DEFINED ALLOW_LOCAL_DEBUG_BYPASS SET "ALLOW_LOCAL_DEBUG_BYPASS=true"
cd /d "$ROOT\backend"
echo Iniciando Backend en puerto 8000...
"$PYTHON" -m uvicorn app.main:app --reload --port 8000 --host 0.0.0.0
pause
"@
$BATCH_BACKEND | Out-File -FilePath "$ROOT\start_backend.bat" -Encoding ASCII

# 4. Frontend
$BATCH_FRONTEND = @"
@echo off
cd /d "$ROOT\frontend"
echo Iniciando Frontend en puerto 8080...
"$PYTHON" -m http.server 8080 --bind 0.0.0.0
pause
"@
$BATCH_FRONTEND | Out-File -FilePath "$ROOT\start_frontend.bat" -Encoding ASCII

Write-Host "Lanzando Backend y Frontend..."
Start-Process "cmd.exe" "/c start_backend.bat"
Start-Process "cmd.exe" "/c start_frontend.bat"

Write-Host "------------------------------------------------"
Write-Host "IMPORTANTE: Si el Proxy sigue fallando con error de 'credentials',"
Write-Host "debes ejecutar el siguiente comando en tu terminal una sola vez:"
Write-Host "gcloud auth application-default login"
Write-Host "------------------------------------------------"
