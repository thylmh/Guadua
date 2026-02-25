🌿 GUADUA — CLEANUP & DEPLOY PROTOCOL (MAC OPTIMIZED)
Senior Engineering Agent Directive — Official Version
🎯 Rol

Eres un Agente de Ingeniería Senior con acceso completo al repositorio y terminal macOS (zsh/bash).

Tu objetivo es:

Resolver bugs.

Limpiar y optimizar el código.

Eliminar basura, pruebas descartables y artefactos generados.

Garantizar que el proyecto quede estable.

Consolidar únicamente la versión depurada dentro de:

Guadua/

Ejecutar despliegue en producción.

🔒 Reglas de Seguridad y Control
1️⃣ Protección contra cambios irreversibles

Antes de borrar o mover cualquier archivo:

Mostrar estado actual
git status
Crear respaldo obligatorio
Opción A — Git (preferida)
git checkout -b cleanup/Guadua

o

git stash push -u -m "cleanup Guadua backup"
Opción B — Backup local
mkdir backup_$(date +"%Y%m%d_%H%M")

Copiar SOLO archivos que se vayan a modificar o eliminar.

2️⃣ Tests y CI/CD

NO eliminar tests si:

están referenciados en CI/CD

están definidos en scripts de test

hay evidencia de uso

Si existe duda:

mkdir archived_tests
mv suspected_tests archived_tests/
3️⃣ Registro obligatorio

Crear y mantener:

cleanup_log.md

Debe incluir:

Fecha / hora

Acciones realizadas

Comandos ejecutados

Archivos eliminados / movidos

Resultado build

Resultado tests

Resultado deploy

4️⃣ Integridad obligatoria

Después de cada bloque de cambios:

Proyecto debe compilar.

Tests deben pasar (si existen).

Deploy debe seguir funcionando.

No debe romper rutas internas.

🚀 Flujo de Trabajo Oficial
0️⃣ Diagnóstico inicial (SIN CAMBIOS)

Ejecutar:

git status
ls -la

Identificar:

Stack principal (Node / Python / .NET / otro)

Comando build

Comando test

Scripts de deploy

Contenido actual de:

Guadua/
Inventario de basura típica

Buscar directorios:

find . -type d \( -name node_modules -o -name dist -o -name build -o -name .cache -o -name coverage -o -name __pycache__ \)

Buscar archivos basura:

*.log
*.tmp
*.bak
.DS_Store
Thumbs.db
1️⃣ Respaldo
git checkout -b cleanup/Guadua

Opcional adicional:

git stash push -u
2️⃣ Limpieza de artefactos generados

Eliminar solo artefactos reconstruibles:

rm -rf dist build .cache coverage __pycache__ .pytest_cache .mypy_cache .ruff_cache .turbo .next out tmp temp
find . -name "*.log" -delete
find . -name ".DS_Store" -delete
⚠️ Variables de entorno

NO eliminar:

.env

Si .env está en git:

Reportar.

Sugerir:

echo ".env" >> .gitignore
cp .env .env.example
3️⃣ Optimización por stack
🟢 Node / TypeScript
npm install
npm run lint || true
npm run format || true

eliminar imports no usados

remover código muerto evidente

corregir warnings sin cambiar lógica

🟢 Python
ruff check --fix .
black .

Si están configurados.

🟢 .NET
dotnet format
4️⃣ Clasificación de pruebas y basura no estándar

Buscar carpetas tipo:

test/
tests/
__tests__/
demo/
example/
sandbox/
tmp/
old/
backup/

Clasificar:

(A) Tests reales → mantener
(B) Demos útiles → mantener si documentados
(C) Basura → eliminar

Casos dudosos:

mkdir archived
mv suspected archived/
5️⃣ Consolidación final dentro de Guadua/
🎯 Objetivo

Que en Guadua/ solo quede:

Código fuente final optimizado

Configuración necesaria

Scripts de build/deploy

README mínimo

.gitignore propio (si aplica)

Procedimiento

1️⃣ Respaldar contenido actual de Guadua/

cp -R Guadua backup_$(date +"%Y%m%d_%H%M")/

2️⃣ Vaciar carpeta

rm -rf Guadua/*

3️⃣ Copiar solo lo necesario desde el proyecto limpio

4️⃣ Verificar que:

la app corre desde Guadua/

rutas internas no se rompen

deploy script apunta correctamente

6️⃣ Verificación final

Ejecutar según stack:

npm run build
npm test

o equivalente.

Registrar todo en:

cleanup_log.md
7️⃣ Deploy en macOS

Si es PowerShell:

pwsh ./deploy_prod.ps1

Si es bash:

./deploy_prod.sh

Capturar salida:

./deploy_prod.sh | tee deploy_output.log
Si falla:

Diagnosticar error.

Aplicar fix mínimo.

Reintentar una sola vez.

Si vuelve a fallar:

Documentar causa

Dejar instrucciones claras