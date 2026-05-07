# Fase 3 — Chat y realtime (100% alcance `mejoras.md`)

Fecha: 2026-05-06  
Rama: `feature-carlos`

## Objetivo (`mejoras.md` — Fase 3)

Optimizar **realtime y chat** sin romper sincronización ni orden, incluyendo:

- append / invalidación parcial incremental  
- **paginación** (“cargar anteriores”)  
- **caché local** de sesión para reentrar al hilo  
- **actualizaciones optimistas** con rollback si falla el envío  
- lista con **FlashList** (`@shopify/flash-list`, alineado a Expo SDK 54)

## Cambios realizados

### `lib/supabase/message-queries.ts`

- **`mapRawMessagesToChatRows`**: enriquece filas con perfiles (reutilizado por fetch completo y por página).
- **`CHAT_MESSAGES_PAGE_SIZE`** (40), **`ChatMessagePageCursor`**, **`fetchChatMessagesPage`**: paginación **keyset** `(created_at, id)` en orden descendente, más una fila extra para saber si hay más historial.
- **`fetchMessagesForOpportunity`**: conserva el contrato anterior (carga completa en una query) para otros usos.
- **`hydrateChatMessageFromInsert`**: sin cambio de contrato; sigue usándose en realtime y envío.

### `lib/chat/thread-session-cache.ts`

- Caché en memoria por `opportunityId` (máx. 32 entradas FIFO): último snapshot de **`ChatMessageRow[]`** + **`hasMoreOlder`**.
- **`getThreadSnapshot` / `setThreadSnapshot` / `clearThreadSnapshot`**: lectura/escritura para pintar al instante al volver al chat y tras sincronizar.

### `components/chat-screen.tsx`

- Carga inicial por **página reciente** + hidratación desde caché mientras llega red.
- **`loadOlderMessages`**: al acercarse al inicio de la lista (`onStartReached`), carga la página anterior con **`mergeOlderFirst`** (dedupe por `id`) y **`maintainVisibleContentPosition`** + **`startRenderingFromBottom`** para no “saltar” el scroll al anteponer.
- **Realtime INSERT**: elimina burbuja **`pending`** del mismo usuario y mismo texto antes de fusionar el evento (evita duplicado si el evento llega antes que la respuesta del `insert`).
- **Envío optimista**: burbuja con `pending`, texto “· …” en hora, opacidad reducida; si **`insert` falla**, se **revierte** (quita burbuja, restaura el input, alerta).
- Lista de mensajes con **`FlashList`** (sin `estimatedItemSize`; API FlashList 2.x).
- Dependencia nueva: **`@shopify/flash-list`** (vía `npx expo install`).

## Recomendación Fase 4 (SQL)

Para hilos muy largos, conviene un índice compuesto acorde al orden de paginación, por ejemplo en `messages`:

`(opportunity_id, created_at DESC, id DESC)` — validar con `EXPLAIN ANALYZE` en tu instancia.

## Verificación

- `npx tsc --noEmit`
- `npx expo-doctor` (17/17)

## Archivos tocados

- `lib/supabase/message-queries.ts`
- `lib/chat/thread-session-cache.ts`
- `components/chat-screen.tsx`
- `package.json` / `package-lock.json` (`@shopify/flash-list`)
- Este documento

## Pruebas manuales sugeridas

- Dos dispositivos: orden, sin duplicados al enviar y por realtime.
- Hilo con **>40 mensajes**: deslizar arriba, cargar anteriores, comprobar que el scroll no pierde el mensaje visible.
- Fallo de red al enviar: el mensaje optimista desaparece y el texto vuelve al input.
- Salir y volver al mismo chat: datos en caché visibles al instante y luego sustitución por la primera página fresca.

## Rollback

```bash
git revert <commit>
```

## Próximo paso sugerido

**Fase 4 — SQL y performance backend** (`mejoras.md`), empezando por índices seguros en `messages` y tablas calientes.
