-- Ejecutar en Supabase SQL Editor (una vez).
-- Cupos visuales rival: unirse, cambiar cupo y salir (solo miembros del equipo).

ALTER TABLE public.match_opportunity_participants
  ADD COLUMN IF NOT EXISTS lineup_slot text;

COMMENT ON COLUMN public.match_opportunity_participants.lineup_slot IS
  'Cupo visual rival: gk|def_0|def_1|med_0|med_1|del|bench_0|bench_1|bench_2';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mop_rival_lineup_slot_unique
  ON public.match_opportunity_participants (opportunity_id, pick_team, lineup_slot)
  WHERE lineup_slot IS NOT NULL
    AND status IN ('pending', 'confirmed');

-- ---------------------------------------------------------------------------
-- Helpers internos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._rival_valid_lineup_slot(p_slot text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(p_slot, ''))) IN (
    'gk', 'def_0', 'def_1', 'med_0', 'med_1', 'del',
    'bench_0', 'bench_1', 'bench_2'
  );
$$;

CREATE OR REPLACE FUNCTION public._rival_team_id_for_pick(
  p_pick_team text,
  p_challenger_team_id uuid,
  p_accepted_team_id uuid,
  p_challenged_team_id uuid
)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN upper(trim(p_pick_team)) = 'A' THEN p_challenger_team_id
    ELSE COALESCE(p_accepted_team_id, p_challenged_team_id)
  END;
$$;

CREATE OR REPLACE FUNCTION public._rival_assert_team_member(p_team_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = p_user_id
      AND tm.status IN ('confirmed', 'pending', 'invited')
  );
$$;

CREATE OR REPLACE FUNCTION public._rival_side_has_goalkeeper(
  p_opportunity_id uuid,
  p_pick_team text,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.pick_team = upper(trim(p_pick_team))
      AND p.status IN ('pending', 'confirmed')
      AND (p_exclude_user_id IS NULL OR p.user_id IS DISTINCT FROM p_exclude_user_id)
      AND (
        p.lineup_slot = 'gk'
        OR p.encounter_lineup_role = 'gk'
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Unirse a un cupo libre (nuevo participante)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_rival_match_opportunity(
  p_opportunity_id uuid,
  p_pick_team text,
  p_lineup_slot text,
  p_encounter_lineup_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
  v_team text := upper(trim(coalesce(p_pick_team, '')));
  v_slot text := lower(trim(coalesce(p_lineup_slot, '')));
  v_role text := lower(trim(coalesce(p_encounter_lineup_role, '')));
  v_required_team uuid;
  v_side_max int;
  v_side_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF v_team NOT IN ('A', 'B') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pick_team');
  END IF;

  IF v_role NOT IN ('gk', 'defensa', 'mediocampista', 'delantero') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_encounter_role');
  END IF;

  IF NOT public._rival_valid_lineup_slot(v_slot) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lineup_slot');
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_rival');
  END IF;

  IF mo.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_open');
  END IF;

  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  SELECT * INTO rc FROM public.rival_challenges WHERE opportunity_id = p_opportunity_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_challenge');
  END IF;

  v_required_team := public._rival_team_id_for_pick(
    v_team,
    rc.challenger_team_id,
    rc.accepted_team_id,
    rc.challenged_team_id
  );

  IF v_required_team IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_ready');
  END IF;

  IF NOT public._rival_assert_team_member(v_required_team, auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_team_member');
  END IF;

  v_side_max := GREATEST(1, COALESCE(mo.players_needed, 18) / 2);

  IF EXISTS (
    SELECT 1 FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.user_id = auth.uid()
      AND p.status IN ('pending', 'confirmed')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_participant');
  END IF;

  SELECT COUNT(*) INTO v_side_count
  FROM public.match_opportunity_participants p
  WHERE p.opportunity_id = p_opportunity_id
    AND p.pick_team = v_team
    AND p.status IN ('pending', 'confirmed');

  IF v_side_count >= v_side_max THEN
    RETURN jsonb_build_object('ok', false, 'error', 'side_full');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.pick_team = v_team
      AND p.lineup_slot = v_slot
      AND p.status IN ('pending', 'confirmed')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_taken');
  END IF;

  IF v_slot = 'gk' AND public._rival_side_has_goalkeeper(p_opportunity_id, v_team, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_taken');
  END IF;

  INSERT INTO public.match_opportunity_participants (
    opportunity_id,
    user_id,
    status,
    is_goalkeeper,
    pick_team,
    encounter_lineup_role,
    lineup_slot
  )
  VALUES (
    p_opportunity_id,
    auth.uid(),
    'confirmed',
    v_role = 'gk',
    v_team,
    v_role,
    v_slot
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_taken');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- Cambiar de cupo (participante ya inscrito, mismo equipo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_rival_match_lineup_slot(
  p_opportunity_id uuid,
  p_lineup_slot text,
  p_encounter_lineup_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
  cur RECORD;
  v_slot text := lower(trim(coalesce(p_lineup_slot, '')));
  v_role text := lower(trim(coalesce(p_encounter_lineup_role, '')));
  v_required_team uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF v_role NOT IN ('gk', 'defensa', 'mediocampista', 'delantero') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_encounter_role');
  END IF;

  IF NOT public._rival_valid_lineup_slot(v_slot) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lineup_slot');
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND OR mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_rival');
  END IF;

  IF mo.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_open');
  END IF;

  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  SELECT * INTO rc FROM public.rival_challenges WHERE opportunity_id = p_opportunity_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_challenge');
  END IF;

  SELECT * INTO cur
  FROM public.match_opportunity_participants p
  WHERE p.opportunity_id = p_opportunity_id
    AND p.user_id = auth.uid()
    AND p.status IN ('pending', 'confirmed')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  IF cur.pick_team IS NULL OR cur.pick_team NOT IN ('A', 'B') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pick_team');
  END IF;

  v_required_team := public._rival_team_id_for_pick(
    cur.pick_team,
    rc.challenger_team_id,
    rc.accepted_team_id,
    rc.challenged_team_id
  );

  IF NOT public._rival_assert_team_member(v_required_team, auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_team_member');
  END IF;

  IF cur.lineup_slot IS DISTINCT FROM v_slot
    AND EXISTS (
      SELECT 1 FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = p_opportunity_id
        AND p.pick_team = cur.pick_team
        AND p.lineup_slot = v_slot
        AND p.status IN ('pending', 'confirmed')
        AND p.user_id IS DISTINCT FROM auth.uid()
    )
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_taken');
  END IF;

  IF v_slot = 'gk'
    AND cur.lineup_slot IS DISTINCT FROM 'gk'
    AND public._rival_side_has_goalkeeper(p_opportunity_id, cur.pick_team, auth.uid())
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_taken');
  END IF;

  IF (cur.lineup_slot = 'gk' OR cur.encounter_lineup_role = 'gk')
    AND v_slot IS DISTINCT FROM 'gk'
    AND NOT public._rival_side_has_goalkeeper(p_opportunity_id, cur.pick_team, auth.uid())
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_needs_goalkeeper');
  END IF;

  UPDATE public.match_opportunity_participants
  SET
    lineup_slot = v_slot,
    encounter_lineup_role = v_role,
    is_goalkeeper = (v_role = 'gk')
  WHERE opportunity_id = p_opportunity_id
    AND user_id = auth.uid();

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_taken');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- Abandonar el encuentro (libera cupo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_rival_match_opportunity(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id;
  IF NOT FOUND OR mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_rival');
  END IF;

  IF mo.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_open');
  END IF;

  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  DELETE FROM public.match_opportunity_participants
  WHERE opportunity_id = p_opportunity_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_rival_match_opportunity(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_rival_match_lineup_slot(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_rival_match_opportunity(uuid) TO authenticated;

-- Detalle público del encuentro (escudos visibles sin ser miembro del equipo)
CREATE OR REPLACE FUNCTION public.get_rival_encounter_display(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo public.match_opportunities%ROWTYPE;
  rc public.rival_challenges%ROWTYPE;
  v_home jsonb;
  v_away jsonb;
  v_per_side int;
  v_away_team_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id;
  IF NOT FOUND OR mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_rival');
  END IF;

  SELECT * INTO rc FROM public.rival_challenges WHERE opportunity_id = p_opportunity_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_challenge');
  END IF;

  v_per_side := GREATEST(1, COALESCE(mo.players_needed, 18) / 2);
  v_away_team_id := COALESCE(rc.accepted_team_id, rc.challenged_team_id);

  SELECT jsonb_build_object(
    'teamId', t.id::text,
    'name', t.name,
    'logoUrl', NULLIF(trim(t.logo_url), '')
  )
  INTO v_home
  FROM public.teams t
  WHERE t.id = rc.challenger_team_id;

  IF v_away_team_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'teamId', t.id::text,
      'name', t.name,
      'logoUrl', NULLIF(trim(t.logo_url), '')
    )
    INTO v_away
    FROM public.teams t
    WHERE t.id = v_away_team_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'home', COALESCE(
      v_home,
      jsonb_build_object(
        'teamId', rc.challenger_team_id::text,
        'name', 'Equipo local',
        'logoUrl', null
      )
    ),
    'away', v_away,
    'mode', rc.mode::text,
    'challengeStatus', rc.status::text,
    'awaitingRival', rc.status = 'pending' AND rc.accepted_team_id IS NULL,
    'perSideMax', v_per_side
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rival_encounter_display(uuid) TO authenticated;
