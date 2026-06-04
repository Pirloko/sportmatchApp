#!/usr/bin/env bash
# Build APK preview en tu Mac (sin cuota EAS en la nube).
# Requisitos: Android Studio + SDK, sesión EAS (eas login).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# Evita OutOfMemoryError: Metaspace en builds locales (Gradle + RN).
export GRADLE_OPTS="${GRADLE_OPTS:--Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8}"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--Xmx4096m}"
export ORG_GRADLE_PROJECT_org_gradle_jvmargs="-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError"
export ORG_GRADLE_PROJECT_org_gradle_parallel="false"
export ORG_GRADLE_PROJECT_org_gradle_workers_max="2"

if [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "❌ No se encontró Java en: $JAVA_HOME"
  echo "   Abre Android Studio una vez o instala JDK 17+."
  exit 1
fi

if [[ ! -d "$ANDROID_HOME" ]]; then
  echo "❌ ANDROID_HOME no existe: $ANDROID_HOME"
  exit 1
fi

echo "✓ JAVA_HOME=$JAVA_HOME"
java -version
echo "✓ ANDROID_HOME=$ANDROID_HOME"
adb devices 2>/dev/null || true

if [[ ! -f .env ]]; then
  echo "⚠️  Falta .env con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY"
fi

echo ""
echo "→ Iniciando EAS build LOCAL (perfil preview, APK)…"
echo "   Puede tardar 20–45 min la primera vez."
echo ""

npx eas-cli build --platform android --profile preview --local "$@"
