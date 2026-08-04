@echo off
setlocal

set "ADB=D:\Android\Sdk\platform-tools\adb.exe"
set "APK=%~dp0android\app\build\outputs\apk\release\app-release.apk"

if not exist "%ADB%" (
  echo Android SDK platform-tools not found:
  echo %ADB%
  pause
  exit /b 1
)

if not exist "%APK%" (
  echo Release APK not found:
  echo %APK%
  echo Build it first with the release Gradle task.
  pause
  exit /b 1
)

echo Connected devices:
"%ADB%" devices
echo.
echo Installing release APK...
"%ADB%" install -r "%APK%"
if errorlevel 1 (
  echo.
  echo Existing app data may use a different signing key (for example, a debug build).
  choice /C YN /N /M "Uninstall io.tomz.mira.mobile and retry? This removes its local app data. [Y/N] "
  if errorlevel 2 (
    echo Installation canceled.
    pause
    exit /b 1
  )
  "%ADB%" uninstall io.tomz.mira.mobile
  if errorlevel 1 (
    echo Could not uninstall the existing app.
    pause
    exit /b 1
  )
  "%ADB%" install "%APK%"
  if errorlevel 1 (
    echo Installation failed after uninstalling the existing app.
    pause
    exit /b 1
  )
)

echo.
echo Installation complete.
pause
