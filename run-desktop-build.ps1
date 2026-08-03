$env:Path = 'C:\Users\17992\AppData\Local\nvm\v20.14.0;' + $env:Path
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
Set-Location 'D:\DevGame\Seed of the Abyss'
node -v | Out-File -FilePath build-progress.log -Encoding utf8
npm -v | Out-File -FilePath build-progress.log -Append -Encoding utf8
& 'C:\Users\17992\AppData\Local\nvm\v20.14.0\npx.cmd' tsc --noEmit *>> build-progress.log
if ($LASTEXITCODE -ne 0) { 'TSC_FAIL:' + $LASTEXITCODE | Out-File build-progress.log -Append; exit $LASTEXITCODE }
'VITE_START' | Out-File build-progress.log -Append
& 'C:\Users\17992\AppData\Local\nvm\v20.14.0\npx.cmd' vite build *>> build-progress.log
if ($LASTEXITCODE -ne 0) { 'VITE_FAIL:' + $LASTEXITCODE | Out-File build-progress.log -Append; exit $LASTEXITCODE }
'EB_START' | Out-File build-progress.log -Append
& 'C:\Users\17992\AppData\Local\nvm\v20.14.0\npx.cmd' --yes electron-builder@24.13.3 --win portable *>> build-progress.log
'EB_EXIT:' + $LASTEXITCODE | Out-File build-progress.log -Append
Get-ChildItem release | Out-File build-progress.log -Append
