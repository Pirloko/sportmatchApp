#!/usr/bin/env bash
# Instala el APK preview más reciente en el emulador/dispositivo conectado.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

APK="$(ls -t build-*.apk 2>/dev/null | head -1 || true)"

if [[ -z "$APK" ]]; then
  echo "❌ No hay build-*.apk en la raíz del proyecto."
  echo "   Primero ejecuta: ./scripts/build-android-preview-local.sh"
  exit 1
fi

echo "→ Instalando: $APK"
adb devices
adb uninstall com.pichanga.expo 2>/dev/null || true
adb install "$APK"
echo "✓ Listo. Abre SportMatch en el emulador y prueba Google."
