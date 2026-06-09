-- Chat post-partido: mensajes permitidos hasta 24 h tras finalized_at (igual que reseñas).
-- Ejecutar en Supabase Dashboard → SQL Editor.

CREATE OR REPLACE FUNCTION public.can_send_opportunity_thread_message(p_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_opportunity_thread(p_opportunity_id)
    AND EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = p_opportunity_id
        AND mo.status IS DISTINCT FROM 'cancelled'::public.match_status
        AND (
          mo.status IS DISTINCT FROM 'completed'::public.match_status
          OR (
            mo.finalized_at IS NOT NULL
            AND now() <= mo.finalized_at + interval '24 hours'
          )
        )
    );
$$;

COMMENT ON FUNCTION public.can_send_opportunity_thread_message(uuid) IS
  'Envío de mensajes en chat: activo en partidos abiertos; en completed solo 24 h desde finalized_at.';

REVOKE ALL ON FUNCTION public.can_send_opportunity_thread_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_send_opportunity_thread_message(uuid) TO authenticated;

DROP POLICY IF EXISTS messages_insert_sender_in_thread ON public.messages;

CREATE POLICY messages_insert_sender_in_thread
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_send_opportunity_thread_message(opportunity_id)
  );
