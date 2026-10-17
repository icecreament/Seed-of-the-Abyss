$ErrorActionPreference = 'Stop'
try {
    $node = Get-Command node -CommandType Application -ErrorAction Stop
    $npx = Get-Command npx.cmd -CommandType Application -ErrorAction Stop
    & $node.Source -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
    if ($LASTEXITCODE -ne 0) { throw 'Node.js 版本过低。' }
} catch {
    [Console]::Error.WriteLine('请在 PATH 中配置 Node.js 20 或更新版本及 npm，推荐 Node.js 22 LTS。' + $_.Exception.Message)
    exit 1
}

$previousDiscovery = $env:CSC_IDENTITY_AUTO_DISCOVERY
$locationPushed = $false
try {
    Push-Location -LiteralPath $PSScriptRoot
    $locationPushed = $true
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    'BUILD_BEGIN' | Out-File -FilePath build-progress.log -Encoding utf8
    & $node.Source -v | Out-File -FilePath build-progress.log -Append -Encoding utf8

    # Windows PowerShell 5.1 会将原生命令的标准错误映射为错误记录，实际结果以退出码为准。
    $ErrorActionPreference = 'Continue'
    & $npx.Source tsc --noEmit *>> build-progress.log
    $buildExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($buildExit -ne 0) {
        'TSC_FAIL:' + $buildExit | Out-File build-progress.log -Append -Encoding utf8
        exit $buildExit
    }
    'TSC_OK' | Out-File build-progress.log -Append -Encoding utf8
    'VITE_START' | Out-File build-progress.log -Append -Encoding utf8
    $ErrorActionPreference = 'Continue'
    & $npx.Source vite build *>> build-progress.log
    $buildExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($buildExit -ne 0) {
        'VITE_FAIL:' + $buildExit | Out-File build-progress.log -Append -Encoding utf8
        exit $buildExit
    }
    'VITE_OK' | Out-File build-progress.log -Append -Encoding utf8
    'EB_START' | Out-File build-progress.log -Append -Encoding utf8
    $ErrorActionPreference = 'Continue'
    & $npx.Source --yes electron-builder@24.13.3 --win portable *>> build-progress.log
    $buildExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    'EB_EXIT:' + $buildExit | Out-File build-progress.log -Append -Encoding utf8
    if ($buildExit -ne 0) { exit $buildExit }
    Get-ChildItem release | Out-File build-progress.log -Append -Encoding utf8
    'ALL_DONE' | Out-File build-progress.log -Append -Encoding utf8
    exit 0
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = $previousDiscovery
    if ($locationPushed) { Pop-Location }
}
