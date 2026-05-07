# Auditoria Completa de Preparacion para Release Movil - SportMatch

Fecha: 2026-05-06  
Alcance: readiness técnica para lanzamiento en Google Play y Apple App Store, basada en evidencia real del proyecto.  
Fuentes: `app.json`, `eas.json`, `package.json`, `app/_layout.tsx`, `app/index.tsx`, `lib/app-provider.tsx`, `lib/push/*`, `lib/telemetry/*`, `lib/supabase/*`, `components/auth-screen.tsx`, `components/*` criticos.

---

## Resumen ejecutivo

SportMatch tiene base funcional sólida para release, pero hoy presenta bloqueantes claros para producción en stores:
- inconsistencia de deep linking,
- ausencia de Sign in with Apple (si se mantiene login social),
- gaps de compliance/privacy no evidenciados en repo,
- y desalineaciones operativas (push/env/robustez de errores).

---

## Checklist priorizado (critico / importante / opcional)

## CRITICO (obligatorio antes de producción)

- [ ] **Unificar deep links en un solo esquema**
  - Evidencia: `app.json` usa esquema `sportmatch`, pero `lib/team-invite-url.ts` construye links `pichanga://...`.
  - Riesgo: enlaces rotos, fallos en invitaciones, QA inconsistente, rechazo por funcionalidad no confiable.

- [ ] **Implementar Apple Sign-In para iOS si hay login social**
  - Evidencia: flujo Google OAuth presente; no se evidencia Apple OAuth equivalente.
  - Riesgo: rechazo App Store por guideline de autenticación social.

- [ ] **Completar compliance de privacidad para stores**
  - Evidencia: no se observa en repo paquete claro de privacy policy/terms listo para publicación.
  - Riesgo: bloqueo de publicación en App Store Connect / Play Console.

- [ ] **Alinear y sanear variables sensibles**
  - Evidencia: existen `.env`/`.env.local` con claves de entorno en workspace.
  - Riesgo: exposición operativa y mala práctica de release.
  - Acción: rotación de claves, revisión de secretos, endurecer proceso CI/CD.

## IMPORTANTE (recomendado antes de lanzamiento general)

- [ ] **Hardening de configuración de build/versionado**
  - Revisar y asegurar `android.versionCode`, `ios.buildNumber`, `runtimeVersion`, `updates`.
  - Mantener estrategia clara de incremento por release.

- [ ] **Revisar permisos y eliminar los no usados**
  - `cameraPermission` configurado, pero no hay uso claro de cámara en flujo principal.
  - Minimizar permisos reduce riesgo de rechazo/fricción de usuario.

- [ ] **Cerrar preparación de push notifications en producción**
  - Validar `projectId` EAS accesible en runtime.
  - Configurar canal Android de notificaciones.
  - Ejecutar pruebas E2E de push foreground/background/killed app.

- [ ] **Estandarizar manejo de errores de red**
  - Hoy hay patrón mixto (`{ok,error}`, silencios, alerts puntuales).
  - Definir capa transversal: timeout, retry, errores tipados, UX fallback.

- [ ] **Fortalecer manejo de sesiones**
  - Persistencia actual con AsyncStorage funciona, pero evaluar almacenamiento más seguro para tokens.
  - Validar casos extremos: token expirado, reconexión, sesión corrupta.

- [ ] **Mejorar crash handling de producción**
  - Existe captura JS + logging en DB, pero no se evidencia plataforma robusta de crash reporting nativo.
  - Añadir observabilidad de crashes nativos y trazabilidad por release.

- [ ] **Mitigar riesgos de performance mínima para stores**
  - Chat realtime con recargas completas y provider monolítico impactan experiencia.
  - Optimizar antes de escalar adquisición de usuarios.

- [ ] **Revisión de seguridad app/backend para release**
  - Confirmar políticas RLS, callbacks OAuth, URLs públicas, abuso/reintentos.
  - Auditoría de endpoints y reglas críticas de negocio.

## OPCIONAL (mejora continua post-release)

- [ ] **Estrategia offline robusta**
  - Persistencia de cache y reconcilio de mutaciones pendientes.

- [ ] **Accesibilidad sistemática**
  - Hay avances puntuales, falta cobertura uniforme en formularios y navegación crítica.

- [ ] **Optimización UX avanzada**
  - Mensajes de error más claros/no técnicos.
  - Mejoras de skeleton/loading y estados vacíos.

---

## Evaluacion completa por los 20 puntos solicitados

1. **Configuraciones faltantes**  
   Hay base Expo/EAS funcional, pero faltan evidencias de hardening completo de versionado/runtime/updates para release disciplinado.

2. **Permisos innecesarios**  
   `cameraPermission` podría ser innecesario si no se usa cámara real en producto.

3. **Riesgos de rechazo**  
   Alto: Apple Sign-In faltante (si se mantiene Google social), privacidad/disclosures incompletos, deep links inconsistentes.

4. **Deep linking**  
   Implementación parcial correcta, pero inconsistente entre esquemas (`sportmatch` vs `pichanga`).

5. **Push notifications**  
   Flujo base implementado; faltan garantías de configuración y pruebas de producción por plataforma.

6. **Auth Google/Apple**  
   Google sí; Apple no evidenciado.

7. **Manejo de sesiones**  
   Correcto funcionalmente (persist/refresh), con oportunidad de hardening en seguridad local.

8. **Manejo offline**  
   Insuficiente para experiencia robusta offline-first.

9. **Crash handling**  
   Hay captura JS, pero falta robustez típica de release (observabilidad nativa consolidada).

10. **Privacy requirements**  
    No se evidencia paquete documental final listo para stores.

11. **Data collection disclosures**  
    Se recolecta telemetría/crash; falta evidencia de mapeo formal para formularios de disclosure.

12. **App signing**  
    No se evidencia en repo (normal con EAS/console), requiere checklist operativo externo obligatorio.

13. **Build configuration**  
    `eas.json` correcto de base; falta verificación final de estrategia de release y control de versiones.

14. **Variables sensibles**  
    Riesgo operativo por exposición de valores de entorno en archivos locales.

15. **Performance mínima requerida**  
    Riesgo en chat/provider/listas grandes; debe mitigarse para evitar mala calificación inicial.

16. **Riesgos de seguridad**  
    Principalmente operativos/configuración: secretos, callbacks OAuth, robustez de validaciones y observabilidad.

17. **Manejo de errores de red**  
    Heterogéneo; falta capa unificada de resiliencia.

18. **Accesibilidad**  
    Parcial; falta cobertura sistemática para estándares de release de calidad.

19. **UX blockers**  
    Deep links inconsistentes, errores poco amigables y dependencia alta de conectividad.

20. **Qué solucionar obligatoriamente antes de producción**  
    Deep linking unificado, Apple Sign-In (si aplica), paquete privacy/disclosures, hardening push/build/env.

---

## Riesgos específicos por store

## Google Play
- Data Safety incompleta o inconsistente con telemetría/crash => riesgo de rechazo o remoción.
- Permisos no justificados (cámara si no aplica) => revisión más estricta y fricción de instalación.
- Push/configuración Android incompleta => mala experiencia y rating bajo.

## Apple App Store
- Falta de Sign in with Apple cuando hay login social => rechazo probable.
- Privacy Nutrition Labels incompletos o inconsistentes => bloqueo de publicación.
- Deep links/flows críticos inestables => rechazo por funcionalidad.

---

## Plan de salida recomendado (secuencial)

## Fase 1 - Bloqueantes de publicación
1. Corregir esquema único de deep link en todo el código.
2. Implementar Sign in with Apple y QA completo en iOS.
3. Completar privacidad legal + disclosures de datos.
4. Rotar/sanear secretos y cerrar checklist de variables.

## Fase 2 - Estabilidad de release
1. Revisar versionado/build/runtime/updates.
2. Cerrar push production E2E (Android/iOS).
3. Unificar manejo de errores de red y estados de fallo UX.
4. Endurecer observabilidad de crashes.

## Fase 3 - Calidad post-lanzamiento inmediato
1. Mejorar offline y resiliencia.
2. Mejorar accesibilidad sistemática.
3. Optimizar performance crítica (chat/listas/provider).

---

## Definicion de "listo para producción"

Se considera listo cuando:
- todos los ítems **CRITICOS** estén cerrados,
- al menos 80% de los **IMPORTANTES** estén cerrados con evidencia de QA,
- exista checklist documental completo para Play/App Store (privacidad, data safety, credenciales y testing).
