$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$runtime = Join-Path $root '.sheetsage2-runtime'
$uv = Join-Path $runtime 'uv.exe'
$python = Join-Path $runtime 'venv\Scripts\python.exe'
$ready = Join-Path $runtime 'ready'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null

if (-not (Test-Path $uv)) {
    $zip = Join-Path $runtime 'uv.zip'
    Write-Host '正在下载 uv 和 Python 3.11...' -ForegroundColor Cyan
    & curl.exe -fL --retry 3 -o $zip 'https://github.com/astral-sh/uv/releases/download/0.13.1/uv-x86_64-pc-windows-msvc.zip'
    if ($LASTEXITCODE -ne 0) { throw '下载 uv 失败，请检查网络后重试。' }
    Expand-Archive -LiteralPath $zip -DestinationPath $runtime -Force
}
$env:UV_PYTHON_INSTALL_DIR = Join-Path $runtime 'python'
$env:UV_CACHE_DIR = Join-Path $runtime 'uv-cache'
$env:HF_HOME = Join-Path $runtime 'hf-cache'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
& $uv python install 3.11
if ($LASTEXITCODE -ne 0) { throw '安装 Python 3.11 失败。' }
if (-not (Test-Path $python)) {
    & $uv venv (Join-Path $runtime 'venv') --python 3.11
    if ($LASTEXITCODE -ne 0) { throw '创建 Python 虚拟环境失败。' }
}
Write-Host '正在安装 PyTorch CUDA 12.6（下载较大）...' -ForegroundColor Cyan
& $uv pip install --python $python 'torch==2.8.0' 'torchaudio==2.8.0' --index-url 'https://download.pytorch.org/whl/cu126'
if ($LASTEXITCODE -ne 0) { throw '安装 PyTorch 失败。' }
Write-Host '正在安装 SheetSage2 的 Python 依赖...' -ForegroundColor Cyan
& $uv pip install --python $python -r (Join-Path $PSScriptRoot 'sheetsage2-requirements.txt')
if ($LASTEXITCODE -ne 0) { throw '安装 Python 依赖失败。' }
Write-Host '正在下载 SheetSage2 与 MERT-v2 模型（约 2.8 GB）...' -ForegroundColor Cyan
& $python (Join-Path $PSScriptRoot 'download_sheetsage2.py')
if ($LASTEXITCODE -ne 0) { throw '下载模型失败；可重新运行安装脚本续传。' }
& $python -c 'import torch, transformers, pretty_midi; print(torch.cuda.is_available())'
if ($LASTEXITCODE -ne 0) { throw '模型运行环境检查失败。' }
Set-Content -LiteralPath $ready -Value 'SheetSage2 runtime ready' -Encoding UTF8
Write-Host 'SheetSage2 安装完成。现在可以双击「启动 ScoreSprout.cmd」。' -ForegroundColor Green
