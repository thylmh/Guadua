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
    # Cargar variables locales opcionales (no versionadas)
    if [ -f "$ROOT/.env.local" ]; then
        set -a
        # shellcheck disable=SC1091
        source "$ROOT/.env.local"
        set +a
    fi

    export USE_TCP_CONNECTION=true
    export DB_HOST="${DB_HOST:-127.0.0.1}"
    export DB_PORT="${DB_PORT:-3306}"
    # No sobreescribir credenciales; si vienen del entorno/.env.local se respetan.
    [ -n "${DB_USER:-}" ] && export DB_USER
    [ -n "${DB_PASS:-}" ] && export DB_PASS
    [ -n "${DB_NAME:-}" ] && export DB_NAME

    # Validación explícita para evitar arrancar contra DB con password vacío.
    if [ -z "${DB_USER:-}" ] || [ -z "${DB_PASS:-}" ] || [ -z "${DB_NAME:-}" ]; then
        echo "❌ Faltan credenciales reales de BD (DB_USER/DB_PASS/DB_NAME)."
        echo "   Define estas variables en .env.local o en tu entorno antes de iniciar."
        exit 1
    fi
    if [[ "${DB_USER}" == CHANGE_ME_* ]] || [[ "${DB_PASS}" == CHANGE_ME_* ]] || [[ "${DB_NAME}" == CHANGE_ME_* ]]; then
        echo "❌ Credenciales de BD inválidas (placeholders CHANGE_ME_* detectados)."
        echo "   Configura valores reales en .env.local."
        exit 1
    fi
    export CORS_ORIGINS_RAW="${CORS_ORIGINS_RAW:-http://localhost:8080,http://127.0.0.1:8080,http://localhost:8000,http://127.0.0.1:8000}"
    export ALLOW_LOCAL_DEBUG_BYPASS="${ALLOW_LOCAL_DEBUG_BYPASS:-true}"

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
