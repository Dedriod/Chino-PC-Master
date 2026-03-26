@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where git >nul 2>&1
if errorlevel 1 (
    echo No se encontro "git" en el PATH. Instala Git para Windows o agrega git.exe al PATH.
    pause
    exit /b 1
)

echo === Repositorio: %cd% ===
echo.

git add -A
git diff --cached --quiet
if errorlevel 1 (
    if "%~1"=="" (
        git commit -m "chore: sincronizar cambios locales"
    ) else (
        git commit -m "%~1"
    )
    if errorlevel 1 (
        echo El commit fallo. Revisa el mensaje de arriba.
        pause
        exit /b 1
    )
    echo Cambios confirmados.
) else (
    echo No hay cambios nuevos que confirmar.
)

echo.
git push
if errorlevel 1 (
    echo.
    echo Push fallido. Comprueba la red, la rama y las credenciales.
    pause
    exit /b 1
)

echo.
echo Listo: push a GitHub completado.
pause
exit /b 0
