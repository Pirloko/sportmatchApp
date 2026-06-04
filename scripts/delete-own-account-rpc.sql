-- Eliminación de cuenta propia (Google Play compliance).
-- Ejecutar en Supabase Dashboard → SQL Editor (una vez por proyecto).

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Tokens push (tablas posibles según esquema)
  BEGIN
    DELETE FROM public.mobile_push_subscriptions WHERE user_id = uid;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.push_subscriptions WHERE user_id = uid;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- Equipos donde es capitán (RESTRICT en captain_id impide borrar perfil antes)
  DELETE FROM public.teams WHERE captain_id = uid;

  -- Membresías, invitaciones y solicitudes restantes
  DELETE FROM public.team_members WHERE user_id = uid;

  BEGIN
    DELETE FROM public.team_invites WHERE inviter_id = uid OR invitee_id = uid;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.team_join_requests WHERE requester_id = uid;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- Borra auth.users → CASCADE a profiles y datos vinculados con ON DELETE CASCADE
  DELETE FROM auth.users WHERE id = uid;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
