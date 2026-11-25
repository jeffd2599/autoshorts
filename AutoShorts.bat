@echo off
setlocal enabledelayedexpansion
title AutoShorts Launcher
cd /d "%~dp0"

echo ========================================================
echo                 Iniciando AutoShorts v3.0
echo ========================================================
echo.

:: 1. Detectar entorno virtual o instalacion de Python
set "PYTHON_EXE="

if exist "venv\Scripts\python.exe" (
    set "PYTHON_EXE=venv\Scripts\python.exe"
    echo [i] Entorno virtual detectado: venv
) else if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=.venv\Scripts\python.exe"
    echo [i] Entorno virtual detectado: .venv
) else if exist "env\Scripts\python.exe" (
    set "PYTHON_EXE=env\Scripts\python.exe"
    echo [i] Entorno virtual detectado: env
) else if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    echo [i] Python 3.11 detectado en LocalAppData
) else (
    where python >nul 2>&1
    if !errorlevel! equ 0 (
        set "PYTHON_EXE=python"
        echo [i] Usando Python del sistema
    )
)

if "%PYTHON_EXE%"=="" (
    echo [X] ERROR: No se encontro ninguna instalacion de Python.
    echo     Asegurate de instalar Python 3.11 y agregarlo al PATH.
    echo.
    pause
    exit /b 1
)

:: 2. Ejecutar la aplicacion
echo [*] Lanzando AutoShorts...
echo.
"%PYTHON_EXE%" run.py

if %errorlevel% neq 0 (
    echo.
    echo ========================================================
    echo [!] AutoShorts se detuvo con codigo de salida: %errorlevel%
    echo     Presiona cualquier tecla para cerrar esta ventana...
    echo ========================================================
    pause >nul
)
