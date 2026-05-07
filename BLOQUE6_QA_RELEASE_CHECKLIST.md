# BLOQUE 6 - QA y release checklist

Checklist operativo para validar salida a produccion mobile de SPORTMATCH.

## 1) QA funcional por rol

### Jugador
- [ ] Login/logout y persistencia de sesion.
- [ ] Home/Explorar/Partidos/Detalle/Chat sin errores.
- [ ] Crear partido (rival, revuelta, team_pick, reserva).
- [ ] Invitaciones de partido: aceptar/rechazar.
- [ ] Equipos: crear, invitar, solicitar ingreso.
- [ ] Team pick: exige equipo + rol.
- [ ] Finalizacion: rival/open/team_pick con reglas correctas.

### Centro (venue)
- [ ] Onboarding del centro.
- [ ] Vista de reservas y estados.
- [ ] Confirmaciones/cancelaciones de reserva.

### Admin
- [ ] Acceso a panel admin.
- [ ] Crear partido admin y abrir detalle para gestion.
- [ ] Crear usuario centro desde panel.
- [ ] Organizador visible como Sportmatch.

## 2) Push y deep links
- [ ] Permiso de notificaciones pedido correctamente.
- [ ] Token push guardado en tabla de suscripciones.
- [ ] Tap en push de chat abre `partidos/chat/:id`.
- [ ] Tap en push de invitacion abre `partidos?tab=invitaciones`.
- [ ] Tap en push de finalizado abre detalle del partido.

## 3) Observabilidad / analytics
- [ ] Se registra `app_started`.
- [ ] Se registra `screen_view`.
- [ ] Se registra `push_token_registered` o `push_token_failed`.
- [ ] Los errores fatales quedan registrados en `app_crash_logs` o fallback.

## 4) Release Android/iOS
- [ ] `eas.json` con perfiles de `preview` y `production`.
- [ ] Icon, splash, package/bundleId definitivos.
- [ ] Variables de entorno productivas configuradas.
- [ ] Build Android (`AAB`) generada y probada en dispositivo real.
- [ ] Build iOS (`IPA`) subida a TestFlight.
- [ ] Smoke test final en Android/iOS aprobado.
