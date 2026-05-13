@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "REPO_URL=https://github.com/LuisCalvo-Chino/Chino-PC-Master.git"
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

if not exist ".git\" (
    echo No hay carpeta .git en: %cd%
    echo Ejecuta "git init" y vincula el remoto, o clona el repositorio aqui.
    exit /b 1
)

echo === Repositorio: %cd% ===
echo === Git: %GIT_CMD% ===
echo === Remoto origin: %REPO_URL% ===
echo.

"%GIT_CMD%" remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo Anadiendo remoto "origin"...
    "%GIT_CMD%" remote add origin "%REPO_URL%"
    if errorlevel 1 (
        echo No se pudo anadir el remoto origin.
        exit /b 1
    )
) else (
    echo Ajustando URL de "origin" al repositorio de GitHub...
    "%GIT_CMD%" remote set-url origin "%REPO_URL%"
    if errorlevel 1 (
        echo No se pudo actualizar la URL del remoto origin.
        exit /b 1
    )
)

REM Git exige autor para commit; sin esto el script falla antes del push.
"%GIT_CMD%" config user.email >nul 2>&1
if errorlevel 1 (
    if defined CPM_GIT_USER_EMAIL (
        "%GIT_CMD%" config user.email "%CPM_GIT_USER_EMAIL%"
    ) else (
        echo Configurando correo local solo en este repo ^(no toca --global^).
        echo Para otro correo: git config user.email "tu@correo.com"
        echo O variable de entorno CPM_GIT_USER_EMAIL antes de ejecutar este .bat
        "%GIT_CMD%" config user.email "LuisCalvo-Chino@users.noreply.github.com"
    )
)
"%GIT_CMD%" config user.name >nul 2>&1
if errorlevel 1 (
    if defined CPM_GIT_USER_NAME (
        "%GIT_CMD%" config user.name "%CPM_GIT_USER_NAME%"
    ) else (
        "%GIT_CMD%" config user.name "Luis Calvo"
    )
)

for /f "tokens=* usebackq" %%B in (`"%GIT_CMD%" rev-parse --abbrev-ref HEAD 2^>nul`) do set "CURRENT_BRANCH=%%B"
if not defined CURRENT_BRANCH (
    echo No se pudo detectar la rama actual.
    exit /b 1
)
echo Rama actual: %CURRENT_BRANCH%
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
echo Enviando a origin (%CURRENT_BRANCH%)...
"%GIT_CMD%" push -u origin "%CURRENT_BRANCH%"
if errorlevel 1 (
    echo.
    echo Push fallido. Comprueba la red, la rama y las credenciales ^(GitHub CLI, token o SSH^).
    exit /b 1
)

echo.
echo Listo: push a GitHub completado.
exit /b 0
