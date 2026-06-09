-- MVP: prohibir auto-voto + contador de partidos ganados como MVP + RPC perfil público.
-- Ejecutar en Supabase Dashboard → SQL Editor.

-- 1) No autoelegirse MVP al enviar reseña
CREATE OR REPLACE FUNCTION public.enforce_match_rating_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.match_opportunities
    WHERE public.match_opportunities.id = NEW.opportunity_id
  ) THEN
    RAISE EXCEPTION 'Oportunidad no existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.match_opportunities
    WHERE public.match_opportunities.id = NEW.opportunity_id
      AND public.match_opportunities.status = 'completed'::public.match_status
      AND public.match_opportunities.finalized_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Solo se puede calificar un partido finalizado';
  END IF;

  IF NOT public._match_review_eligible_user(NEW.opportunity_id, NEW.rater_id) THEN
    RAISE EXCEPTION 'Solo participantes confirmados u organizador pueden dejar reseña';
  END IF;

  IF NEW.venue_rating IS NULL
     OR NEW.match_rating IS NULL
     OR NEW.level_rating IS NULL
     OR NEW.mvp_user_id IS NULL THEN
    RAISE EXCEPTION 'Completa recinto, ambiente, nivel y MVP';
  END IF;

  IF NEW.mvp_user_id = NEW.rater_id THEN
    RAISE EXCEPTION 'No puedes elegirte a ti mismo como MVP';
  END IF;

  IF NOT public._match_review_eligible_user(NEW.opportunity_id, NEW.mvp_user_id) THEN
    RAISE EXCEPTION 'El MVP debe ser un participante del partido';
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Partidos como MVP: empate en votos → cada empatado suma 1 MVP
CREATE OR REPLACE FUNCTION public.player_mvp_wins_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH vote_counts AS (
    SELECT
      mor.opportunity_id,
      mor.mvp_user_id,
      COUNT(*)::integer AS votes
    FROM public.match_opportunity_ratings mor
    WHERE mor.mvp_user_id IS NOT NULL
    GROUP BY mor.opportunity_id, mor.mvp_user_id
  ),
  max_votes AS (
    SELECT
      vote_counts.opportunity_id,
      MAX(vote_counts.votes) AS max_votes
    FROM vote_counts
    GROUP BY vote_counts.opportunity_id
  ),
  winners AS (
    SELECT vc.opportunity_id, vc.mvp_user_id
    FROM vote_counts vc
    INNER JOIN max_votes mv
      ON mv.opportunity_id = vc.opportunity_id
      AND vc.votes = mv.max_votes
  )
  SELECT COUNT(*)::integer
  FROM winners
  WHERE winners.mvp_user_id = p_user_id;
$$;

COMMENT ON FUNCTION public.player_mvp_wins_count(uuid) IS
  'Partidos donde el jugador fue MVP: si hay empate en votos, cada empatado suma 1 MVP.';

GRANT EXECUTE ON FUNCTION public.player_mvp_wins_count(uuid) TO authenticated;

-- 3) Perfil público incluye stats_mvp_wins
-- (Hay que DROP: PostgreSQL no permite cambiar OUT/RETURNS TABLE con CREATE OR REPLACE)
DROP FUNCTION IF EXISTS public.fetch_public_player_profile(uuid);

CREATE FUNCTION public.fetch_public_player_profile(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  photo_url text,
  city text,
  city_id uuid,
  level public.skill_level,
  "position" public.position,
  availability text[],
  stats_player_wins integer,
  stats_player_draws integer,
  stats_player_losses integer,
  stats_organized_completed integer,
  stats_organizer_wins integer,
  stats_mvp_wins integer,
  mod_yellow_cards integer,
  mod_red_cards integer,
  mod_suspended_until timestamptz,
  mod_banned_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.photo_url,
    COALESCE(gc.name, p.city) AS city,
    p.city_id,
    p.level,
    p.position AS "position",
    p.availability,
    p.stats_player_wins,
    p.stats_player_draws,
    p.stats_player_losses,
    p.stats_organized_completed,
    p.stats_organizer_wins,
    public.player_mvp_wins_count(p.id) AS stats_mvp_wins,
    p.mod_yellow_cards,
    p.mod_red_cards,
    p.mod_suspended_until,
    p.mod_banned_at
  FROM public.profiles p
  LEFT JOIN public.geo_cities gc ON gc.id = p.city_id
  WHERE p.id = p_user_id
    AND p.account_type = 'player'::public.account_type;
$$;

REVOKE ALL ON FUNCTION public.fetch_public_player_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_public_player_profile(uuid) TO authenticated;
