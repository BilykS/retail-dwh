@echo off
setlocal
set PYTHONUTF8=1
set DBT_ENGINE_MANAGE_STATE=false
"%~dp0..\.venv\Scripts\dbt.exe" %* --profiles-dir "%~dp0."
