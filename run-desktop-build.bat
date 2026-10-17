@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
set "CSC_IDENTITY_AUTO_DISCOVERY=false"

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ is required in PATH. Node.js 22 LTS is recommended.
  popd
  exit /b 1
)
where npx.cmd >nul 2>&1
if errorlevel 1 (
  echo npx.cmd is missing. Install npm and check PATH.
  popd
  exit /b 1
)
echo BUILD_BEGIN> build-progress.log
node -v>> build-progress.log
call npx.cmd tsc --noEmit >> build-progress.log 2>&1
set "BUILD_EXIT=%ERRORLEVEL%"
if not "%BUILD_EXIT%"=="0" (
  >> build-progress.log echo TSC_FAIL:%BUILD_EXIT%
  goto :finish
)
echo TSC_OK>> build-progress.log
call npx.cmd vite build >> build-progress.log 2>&1
set "BUILD_EXIT=%ERRORLEVEL%"
if not "%BUILD_EXIT%"=="0" (
  >> build-progress.log echo VITE_FAIL:%BUILD_EXIT%
  goto :finish
)
echo VITE_OK>> build-progress.log
call npx.cmd --yes electron-builder@24.13.3 --win portable >> build-progress.log 2>&1
set "BUILD_EXIT=%ERRORLEVEL%"
>> build-progress.log echo EB_EXIT=%BUILD_EXIT%
if not "%BUILD_EXIT%"=="0" goto :finish
dir release >> build-progress.log 2>&1
set "BUILD_EXIT=%ERRORLEVEL%"
if not "%BUILD_EXIT%"=="0" goto :finish
echo ALL_DONE>> build-progress.log

:finish
popd
exit /b %BUILD_EXIT%
