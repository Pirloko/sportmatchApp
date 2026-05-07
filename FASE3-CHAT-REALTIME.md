# Fase 3 — Chat y realtime (incremental)

Fecha: 2026-05-06  
Rama: `feature-carlos`

## Objetivo (mejoras.md)

Reducir **refetch completo** del hilo y **carga innecesaria de participantes** al recibir mensajes por Supabase Realtime, **sin** romper orden ni sincronización multiusuario.

## Cambios realizados

### `lib/supabase/message-queries.ts`

- **`hydrateChatMessageFromInsert`**: mapea un payload de INSERT (realtime o fila devuelta por `.select()` tras insert) a `ChatMessageRow`, con una consulta a `profiles` para nombre y foto.

### `components/chat-screen.tsx`

- **`mergeMessageSorted`**: fusiona un mensaje nuevo en la lista existente con **deduplicación por `id`** y orden estable por `created_at` y `id`.
- **`loadMessages({ silent?: boolean })`**: en errores con `silent: true` no se muestra alerta (útil como fallback tras realtime o envío).
- **Realtime INSERT**: usa `hydrateChatMessageFromInsert` + `mergeMessageSorted`; si el mapeo falla, `loadMessages({ silent: true })`. **No** se llama `loadParticipants` en cada mensaje.
- **Participantes**: `loadParticipants` solo cuando **`showInfo` es true** (panel ℹ️ abierto), no en cada montaje permanente.
- **`handleSend`**: `insert(...).select('id, sender_id, content, created_at').single()` y merge local; si hay fila insertada, **no** se llama `loadMessages()` completo tras enviar.

## Qué no se hizo (acorde al plan incremental)

- Paginación “cargar mensajes anteriores”.
- Migración a FlashList (queda para Fase 5 / evaluación posterior).
- Optimistic send con rollback explícito (solo merge tras éxito del insert).

## Impacto esperado

- Menos round-trips al abrir chat y al recibir mensajes (especialmente en conversaciones activas).
- Menos trabajo en cada evento realtime (sin refetch de participantes ni lista completa de mensajes en el caso feliz).

## Riesgos y pruebas manuales

- Verificar con **dos cuentas/dispositivos**: orden cronológico, sin duplicados visibles al enviar y al recibir por realtime.
- Abrir panel ℹ️: lista de participantes debe cargar al mostrarse.
- Si RLS o forma del payload cambian, `hydrateChatMessageFromInsert` puede devolver `null` → debe recuperarse con `loadMessages({ silent: true })`.

## Verificación

- `npx tsc --noEmit`
- `npx expo-doctor` (17/17)

## Archivos modificados

- `lib/supabase/message-queries.ts`
- `components/chat-screen.tsx`
- Este documento

## Rollback

```bash
git revert <commit>
```

## Próximo paso sugerido

**Fase 4 — SQL y performance backend** (`mejoras.md`), o paginación/FlashList cuando se priorice UX de hilos largos.
