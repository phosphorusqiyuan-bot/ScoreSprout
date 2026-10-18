@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 (
  echo Cannot open the ScoreSprout folder.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing ScoreSprout dependencies for the first launch...
  where corepack >nul 2>&1
  if not errorlevel 1 (
    call corepack pnpm install --frozen-lockfile
  ) else (
    where pnpm >nul 2>&1
    if errorlevel 1 (
      echo Please install Node.js 22 or newer and pnpm 11, then double-click this file again.
      pause
      popd
      exit /b 1
    )
    call pnpm install --frozen-lockfile
  )
  if errorlevel 1 (
    echo Dependency installation failed. Check your network connection and try again.
    pause
    popd
    exit /b 1
  )
)

start "" "%CD%\node_modules\electron\dist\electron.exe" "%CD%" --no-sandbox --disable-gpu
if errorlevel 1 (
  echo ScoreSprout could not start.
  pause
  popd
  exit /b 1
)
popd
