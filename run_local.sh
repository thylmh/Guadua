#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
PYTHON="$ROOT/.venv/bin/python"
PROXY="$ROOT/cloud-sql-proxy"

echo "==================================================="
echo "  Guadua - Entorno Local"
echo "==================================================="

# 2. Matar procesos viejos si existen
echo "🧹 Limpiando procesos anteriores..."
pkill -f "cloud-sql-proxy" 2>/dev/null && echo "   (proxy detenido)" || true
pkill -f "uvicorn app.main:app" 2>/dev/null && echo "   (backend detenido)" || true
pkill -f "http.server 8080" 2>/dev/null && echo "   (frontend detenido)" || true
sleep 1

# 3. Cloud SQL Proxy
echo ""
echo "🔌 Iniciando Cloud SQL Proxy en 127.0.0.1:3306..."
"$PROXY" \
    --address 127.0.0.1 \
    --port 3306 \
    bosque-485105:southamerica-east1:bosquebd \
    > /tmp/proxy.log 2>&1 &
PROXY_PID=$!

echo "   Esperando 8 segundos a que el proxy se estabilice..."
sleep 8

# Verificar que el proxy sigue vivo
if ! kill -0 $PROXY_PID 2>/dev/null; then
    echo "❌ El proxy falló. Ver log:"
    cat /tmp/proxy.log
    echo ""
    echo "💡 Si el error es 'could not find default credentials', ejecuta:"
    echo "   gcloud auth application-default login"
    exit 1
fi
echo "✅ Proxy activo (PID $PROXY_PID)"

# 4. Backend
echo ""
echo "🚀 Iniciando Backend en http://localhost:8000 ..."
(
    export USE_TCP_CONNECTION=true
    export DB_HOST=127.0.0.1
    export DB_PORT=3306
    export DB_USER=bosquebd
    export DB_PASS=BosqueDB2026!
    export DB_NAME=bosquebd
    export CORS_ORIGINS_RAW="*"

    cd "$ROOT/backend"
    "$PYTHON" -m uvicorn app.main:app --reload --port 8000 --host 0.0.0.0 \
        > /tmp/backend.log 2>&1
) &
BACKEND_PID=$!

# 5. Frontend
echo "🌐 Iniciando Frontend en http://localhost:8080 ..."
(
    cd "$ROOT/frontend"
    "$PYTHON" -m http.server 8080 --bind 0.0.0.0 \
        > /tmp/frontend.log 2>&1
) &
FRONTEND_PID=$!

echo ""
echo "==================================================="
echo "✅ Servicios iniciados:"
echo "   🔌 Proxy   PID: $PROXY_PID   → log: /tmp/proxy.log"
echo "   🚀 Backend PID: $BACKEND_PID  → http://localhost:8000/docs"
echo "   🌐 Frontend PID: $FRONTEND_PID → http://localhost:8080"
echo ""
echo "Para detener todos los servicios:"
echo "   Ctrl+C  (o ejecuta: pkill -f 'cloud-sql-proxy|uvicorn|http.server 8080')"
echo "==================================================="

# Mantener el script activo y escuchar Ctrl+C
trap "echo ''; echo '🛑 Deteniendo todos los servicios...'; kill $PROXY_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Listo.'" EXIT INT TERM

wait
