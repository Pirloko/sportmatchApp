# Auditoria Completa de Performance Movil - SportMatch

Fecha: 2026-05-06  
Alcance: auditoria tecnica de performance React Native/Expo basada en codigo real del proyecto.  
Fuentes: `components/*`, `lib/app-provider.tsx`, `lib/supabase/*`, `app/_layout.tsx`, `app/index.tsx`, configuracion Expo.

---

## Resumen ejecutivo

Los principales riesgos de performance movil estan en:
- listas grandes renderizadas sin virtualizacion consistente,
- `AppProvider` monolitico con rerenders transversales,
- chat realtime con recarga completa de datos,
- y flujos de creacion de partido con fan-out de requests/carga de calculo en cliente.

Pantallas de mayor riesgo hoy: `chat`, `create-match`, `teams`, `venue-dashboard`, `player-home`, `explore`.

---

## 1) Riesgos de FPS bajo

Riesgo alto por:
- uso recurrente de `ScrollView + map` en pantallas grandes,
- arboles de UI extensos en archivos monoliticos,
- eventos de datos que disparan renders de grandes secciones.

Impacto esperado:
- jank de scroll,
- frames dropped en transiciones y listas densas.

## 2) Riesgos de navegacion lenta

- Gate de inicio dependiente de hidratacion de datos en `AppProvider`.
- Encadenamiento de estados `auth/onboarding/redirect`.
- Rerenders globales por cambios de contexto no relacionados con la ruta actual.

Resultado: tiempo de entrada variable y sensacion de rebote en navegacion inicial.

## 3) Riesgos de memory leaks

No se observa fuga critica sistemica, pero hay riesgos puntuales:
- timers sin cleanup consistente (ej. flujo de swipe),
- efectos async largos sin cancelacion uniforme en pantallas grandes.

Riesgo: updates post-unmount y trabajo inutil acumulado.

## 4) Riesgos en FlatList/FlashList

- `FlatList` existe en algunos puntos, pero sin tuning sistematico (`windowSize`, `maxToRenderPerBatch`, etc.).
- No hay adopcion estandar de `FlashList` para vistas de alto volumen.
- Varias pantallas siguen en `ScrollView` donde deberia haber virtualizacion.

## 5) Imagenes mal optimizadas

Patron actual:
- uso extendido de `Image` con URIs remotas,
- sin estrategia uniforme de cache/prefetch/tamaños por breakpoint.

Riesgos:
- decode cost alto,
- mayor consumo de memoria/red,
- flicker y carga visible en listas.

## 6) Re-renders innecesarios

Riesgo critico:
- `AppProvider` compone un `value` amplio que cambia frecuentemente.
- Consumidores `useApp()` en muchas pantallas reciben invalidaciones transversales.
- Callbacks/objetos inline en listas aumentan churn de props.

## 7) Componentes pesados

Componentes con mayor complejidad/tamaño:
- `components/create-match-screen.tsx`
- `components/teams-screen.tsx`
- `components/venue-dashboard-screen.tsx`
- `components/profile-screen.tsx`
- `components/chat-screen.tsx`
- `components/player-home-screen.tsx`
- `components/explore-screen.tsx`
- `components/matches-hub-screen.tsx`

Riesgo: mantenimiento dificil + alta probabilidad de regresiones de performance.

## 8) Riesgos de JS thread blocking

Casos de riesgo:
- calculo de disponibilidad/slots y alternativas de centros en cliente.
- fan-out de promesas por multiples venues en flujos de creacion.
- transformaciones de datos dentro de render en pantallas grandes.

Efecto: caida de respuesta tactil en gama media/baja.

## 9) Riesgos de battery drain

- refetch global post-mutacion en varios flujos.
- chat realtime con recarga completa por evento.
- uso de imagenes remotas sin cache avanzada.
- IO transversal de telemetry/push en arranque/navegacion.

## 10) Riesgos de realtime excesivo

Principalmente en chat:
- evento `INSERT` -> `loadMessages` + `loadParticipants` completos.
- envio local tambien refresca mensajes, creando sobrelectura.

Riesgo: red/CPU creciente proporcional al volumen de mensajes.

## 11) Riesgos de listeners acumulados

Positivo:
- hay limpieza en listeners clave (auth, push, realtime chat).

Riesgo residual:
- timers y async effects sin politica uniforme de cancelacion.
- necesidad de estandarizar lifecycle de subscripciones en hooks dedicados.

## 12) Riesgos Expo especificos

- `newArchEnabled: true` aumenta sensibilidad a compatibilidad de librerias/dispositivos.
- uso de imports internos de `expo-notifications/build/*` en bootstrap/push (fragil ante upgrades).
- push real dependiente de entorno/build correcto (esperable, pero operativo).

## 13) Riesgos Android low-end

Mayor impacto en:
- memoria por listas no virtualizadas,
- CPU por transformaciones/callbacks en render,
- red/bateria por refetch masivo y realtime no incremental.

Sintoma esperado: scroll con stutter, apertura de pantallas pesada, cierres por memoria bajo stress.

## 14) Riesgos iPhone antiguos

En chips antiguos (A11/A12):
- decode de imagenes y layouts complejos en listas largas,
- degradacion en chat si historial crece,
- lag en pantallas monoliticas con multiples secciones interactivas.

## 15) Que pantallas seran problematicas

Prioridad alta:
1. `components/chat-screen.tsx`
2. `components/create-match-screen.tsx`
3. `components/teams-screen.tsx`
4. `components/venue-dashboard-screen.tsx`

Prioridad media-alta:
5. `components/player-home-screen.tsx`
6. `components/explore-screen.tsx`
7. `components/profile-screen.tsx`
8. `components/match-detail-screen.tsx`

## 16) Que hooks necesitan memoization

Prioridad inmediata:
- `value` de `AppProvider` (memoizacion estructural).
- handlers de listas/cards en home/explore/teams/matches.
- selectores derivados pesados (filtros/sorts/grouping) hoy dentro de componentes.
- callbacks de acciones de dominio que cambian por dependencias calientes.

## 17) Que logica debe salir del render

- filtros y agrupaciones de listas grandes.
- mapeos/derivaciones repetidas de entidades de partidos/equipos.
- calculo de disponibilidad de canchas/slots.
- composicion de payloads complejos para mutaciones.

Destino recomendado: hooks de dominio + utilidades puras memoizadas.

## 18) Que deberia lazy-loadearse

- pantallas pesadas de bajo uso relativo: `admin`, `venue-dashboard`, `chat` avanzado.
- modales/composites grandes dentro de `create-match` y `teams`.
- secciones secundarias de `profile` (estadisticas/historial detallado).

Objetivo: reducir coste de bundle inicial y TTI de rutas principales.

## 19) Que pantallas deberian dividirse

Division sugerida:
- `create-match`: separar wizard, disponibilidad, resumen, modales.
- `teams`: separar hub/lista, detalle equipo, invites, join-requests, rival-challenges.
- `venue-dashboard`: separar reservas, canchas, horarios, perfil.
- `profile`: separar vista principal de settings/estadisticas.

## 20) Que metricas reales debemos medir antes de lanzar

## Rendimiento visual
- FPS UI thread y JS thread por pantalla critica.
- dropped frames por scroll y transiciones.

## Latencia UX
- TTI por ruta (`home`, `explore`, `teams`, `chat`, `create-match`).
- tiempo de navegacion entre pantallas clave.

## Memoria
- RAM pico por pantalla.
- crecimiento de memoria en sesiones de 10-15 min con chat activo.

## Red y bateria
- requests/min por flujo (chat, create-match, home refresh).
- consumo de datos por sesion.
- impacto de realtime en foreground/background.

## Estabilidad
- crash-free sessions por dispositivo/OS.
- errores JS no fatales por pantalla.

---

## Recomendaciones especificas y priorizadas

## P0 (antes de release)
1. Migrar chat a lista virtualizada y update incremental (evitar recarga completa por mensaje).
2. Reducir fan-out de `create-match` (consolidar disponibilidad server-side o cacheada por rango).
3. Estabilizar `AppProvider` (memoizar `value` y preparar separacion por dominio).

## P1 (alto impacto, corto plazo)
1. Reemplazar `ScrollView` de listas grandes por `FlatList/SectionList` con tuning.
2. Estandarizar memoizacion de handlers/selectores en pantallas de alto trafico.
3. Adoptar estrategia de imagenes (cache/prefetch/placeholders/tamaños controlados).

## P2 (mediano plazo)
1. Dividir pantallas monoliticas en subfeatures.
2. Mover logica pesada fuera de render a hooks especializados.
3. Homogeneizar capa de datos para evitar refetch global.

## P3 (hardening para escala movil real)
1. Definir budgets de performance por pantalla (FPS/TTI/memoria/red).
2. Validar en matriz de dispositivos low-end y iPhone antiguos.
3. Configurar alertas de regresion de performance por release.

---

## Criterio de salida para lanzamiento

No lanzar sin:
- chat estable con scroll fluido en historial mediano/alto,
- TTI aceptable en rutas principales bajo red movil real,
- sin picos severos de memoria en Android low-end,
- y telemetria de performance activa para deteccion temprana post-release.
