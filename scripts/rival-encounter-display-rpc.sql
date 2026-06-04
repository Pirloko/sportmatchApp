-- Escudos y nombres del encuentro rival visibles para quien abre el detalle del partido,
-- aunque no sea miembro de ningún equipo (RLS de rival_challenges no aplica a esta RPC).

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
