$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$sheetRuntime = Join-Path $root '.sheetsage2-runtime'
$reuseSheet = (Test-Path (Join-Path $sheetRuntime 'ready')) -and (Test-Path (Join-Path $sheetRuntime 'venv\Scripts\python.exe'))
$runtime = if ($reuseSheet) { $sheetRuntime } else { Join-Path $root '.piano-runtime' }
$uv = Join-Path $runtime 'uv.exe'
$python = Join-Path $runtime 'venv\Scripts\python.exe'
$weights = Join-Path $runtime 'RNNHandPartModel.pth'
$ready = Join-Path $runtime 'piano-ready'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null

if (-not (Test-Path $uv)) {
    $zip = Join-Path $runtime 'uv.zip'
    Write-Host '正在下载钢琴模型安装工具…' -ForegroundColor Cyan
    & curl.exe -fL --retry 3 -o $zip 'https://github.com/astral-sh/uv/releases/download/0.13.1/uv-x86_64-pc-windows-msvc.zip'
    if ($LASTEXITCODE -ne 0) { throw '下载 uv 失败，请检查网络后重试。' }
    Expand-Archive -LiteralPath $zip -DestinationPath $runtime -Force
}

$env:UV_PYTHON_INSTALL_DIR = Join-Path $runtime 'python'
$env:UV_CACHE_DIR = Join-Path $runtime 'uv-cache'
if (-not $reuseSheet) {
    & $uv python install 3.11
    if ($LASTEXITCODE -ne 0) { throw '安装 Python 3.11 失败。' }
    if (-not (Test-Path $python)) {
        & $uv venv (Join-Path $runtime 'venv') --python 3.11
        if ($LASTEXITCODE -ne 0) { throw '创建钢琴虚拟环境失败。' }
    }
    Write-Host '正在安装 CPU 版 PyTorch（首次下载较大）…' -ForegroundColor Cyan
    & $uv pip install --python $python 'torch==2.8.0' --index-url 'https://download.pytorch.org/whl/cpu'
    if ($LASTEXITCODE -ne 0) { throw '安装 PyTorch 失败。' }
}
Write-Host '正在安装 PianoPlayer 3.0.2…' -ForegroundColor Cyan
& $uv pip install --python $python 'pianoplayer==3.0.2'
if ($LASTEXITCODE -ne 0) { throw '安装 PianoPlayer 失败。' }

$expected = '83BDF215B2C572767CBCDD5372C432CA'
$valid = (Test-Path $weights) -and ((Get-FileHash -LiteralPath $weights -Algorithm MD5).Hash -eq $expected)
if (-not $valid) {
    Write-Host '正在下载 PM2S 官方左右手模型（约 40 MB）…' -ForegroundColor Cyan
    & curl.exe -fL --retry 3 -o $weights 'https://zenodo.org/records/10520196/files/RNNHandPartModel.pth?download=1'
    if ($LASTEXITCODE -ne 0) { throw '下载 PM2S 模型失败，请检查网络后重试。' }
}
if ((Get-FileHash -LiteralPath $weights -Algorithm MD5).Hash -ne $expected) {
    throw 'PM2S 模型校验失败，请重新运行安装脚本。'
}
& $python -c "import sys; sys.path.insert(0, r'$PSScriptRoot'); from pm2s_hand_model import load_model; import pianoplayer; load_model(r'$weights'); print('PM2S and PianoPlayer ready')"
if ($LASTEXITCODE -ne 0) { throw '钢琴模型运行检查失败。' }
Set-Content -LiteralPath $ready -Value 'PM2S + PianoPlayer ready' -Encoding UTF8
Write-Host '钢琴分手与指法模型安装完成。现在可以启动 ScoreSprout。' -ForegroundColor Green
