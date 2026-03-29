@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "GIT_CMD=git"
where "%GIT_CMD%" >nul 2>&1
if errorlevel 1 (
    if exist "%ProgramFiles%\Git\bin\git.exe" (
        set "GIT_CMD=%ProgramFiles%\Git\bin\git.exe"
    ) else if exist "%ProgramFiles%\Git\cmd\git.exe" (
        set "GIT_CMD=%ProgramFiles%\Git\cmd\git.exe"
    ) else if exist "%ProgramW6432%\Git\bin\git.exe" (
        set "GIT_CMD=%ProgramW6432%\Git\bin\git.exe"
    ) else (
        echo No se encontro "git" en el PATH ni en rutas comunes.
        echo Instala Git para Windows o agrega git.exe al PATH.
        exit /b 1
    )
)

echo === Repositorio: %cd% ===
echo === Git: %GIT_CMD% ===
echo.

"%GIT_CMD%" add -A
"%GIT_CMD%" diff --cached --quiet
if errorlevel 1 (
    if "%~1"=="" (
        "%GIT_CMD%" commit -m "chore: sincronizar cambios locales"
    ) else (
        "%GIT_CMD%" commit -m "%~1"
    )
    if errorlevel 1 (
        echo El commit fallo. Revisa el mensaje de arriba.
        exit /b 1
    )
    echo Cambios confirmados.
) else (
    echo No hay cambios nuevos que confirmar.
)

echo.
"%GIT_CMD%" push
if errorlevel 1 (
    echo.
    echo Push fallido. Comprueba la red, la rama y las credenciales.
    exit /b 1
)

echo.
echo Listo: push a GitHub completado.
exit /b 0
