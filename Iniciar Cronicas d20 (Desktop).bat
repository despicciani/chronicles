@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Instalando dependencias do Desktop pela primeira vez...
  call npm install
)
if not exist "dist\index.html" (
  echo Compilando interface pela primeira vez...
  call npm run build
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0electron\main.cjs"
