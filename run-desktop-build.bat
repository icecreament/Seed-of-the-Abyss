@echo off
set PATH=C:\Users\17992\AppData\Local\nvm\v20.14.0;C:\Windows\System32;C:\Windows
set CSC_IDENTITY_AUTO_DISCOVERY=false
cd /d "D:\DevGame\Seed of the Abyss"
echo BUILD_BEGIN> build-progress.log
node -v>> build-progress.log
call npx tsc --noEmit >> build-progress.log 2>&1
if errorlevel 1 (echo TSC_FAIL>> build-progress.log & exit /b 1)
echo TSC_OK>> build-progress.log
call npx vite build >> build-progress.log 2>&1
if errorlevel 1 (echo VITE_FAIL>> build-progress.log & exit /b 1)
echo VITE_OK>> build-progress.log
call npx --yes electron-builder@24.13.3 --win portable >> build-progress.log 2>&1
echo EB_EXIT=%ERRORLEVEL%>> build-progress.log
dir release >> build-progress.log
echo ALL_DONE>> build-progress.log
