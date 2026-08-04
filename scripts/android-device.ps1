$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$devices = @(adb devices | Select-String "`tdevice$" | ForEach-Object {
  ($_ -split "`t")[0]
})

if ($devices.Count -eq 0) {
  throw 'No authorized Android device found. Connect a device and enable USB debugging, then run adb devices.'
}

$deviceId = $devices[0]
$metroListener = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $metroListener) {
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', "cd /d `"$projectRoot`" && npx --yes node@22 node_modules/react-native/cli.js start --max-workers 1" -WorkingDirectory $projectRoot
  Write-Host 'Starting Metro with Node.js 22 in a separate terminal...'
  Start-Sleep -Seconds 5
}

adb -s $deviceId reverse tcp:8081 tcp:8081

Push-Location (Join-Path $projectRoot 'android')
try {
  $env:CMAKE_BUILD_PARALLEL_LEVEL = '1'
  $buildLogPath = Join-Path $env:TEMP 'uichat-mira-mobile-android-build.log'
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & .\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --no-daemon --no-parallel --max-workers=1 --console=plain *>&1 |
    Tee-Object -FilePath $buildLogPath
  $gradleExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference

  if ($gradleExitCode -ne 0) {
    throw "Android debug build failed. See $buildLogPath for details."
  }
} finally {
  Pop-Location
}

adb -s $deviceId install -r (Join-Path $projectRoot 'android/app/build/outputs/apk/debug/app-debug.apk')
if ($LASTEXITCODE -ne 0) {
  throw 'APK installation failed. Unlock the device, allow USB installation, and try again.'
}

adb -s $deviceId shell monkey -p io.tomz.mira.mobile 1 | Out-Null
Write-Host "Installed and opened on $deviceId. Metro is available at localhost:8081."
