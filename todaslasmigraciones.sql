-- Archivo consolidado de migraciones Supabase
-- Generado automáticamente desde supabase/migrations
-- Total de archivos incluidos: 86


-- ==============================================================================
-- [001/086] 20250322180000_initial_schema.sql
-- ==============================================================================

-- Pichanga — esquema inicial Supabase (PostgreSQL)
-- Alineado con lib/types.ts: Gender, Position, Level, MatchType, MatchStatus, User, Team, TeamInvite, MatchOpportunity, Match, Message
--
-- Cómo aplicar:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar, o
--   supabase db push / supabase migration up (con CLI vinculada al proyecto)
--
-- Convenciones:
--   - IDs de usuario = auth.users.id (UUID), tabla public.profiles 1:1
--   - El chat del front usa matchId como id de oportunidad → messages.opportunity_id → match_opportunities

-- ---------------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums (equivalentes a union types en TypeScript)
-- ---------------------------------------------------------------------------
CREATE TYPE public.gender AS ENUM ('male', 'female');
CREATE TYPE public.position AS ENUM ('portero', 'defensa', 'mediocampista', 'delantero');
CREATE TYPE public.skill_level AS ENUM ('principiante', 'intermedio', 'avanzado', 'competitivo');
CREATE TYPE public.match_type AS ENUM ('rival', 'players', 'open');
CREATE TYPE public.match_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');
CREATE TYPE public.team_member_status AS ENUM ('confirmed', 'pending', 'invited');
CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE public.participant_status AS ENUM ('pending', 'confirmed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Perfiles (extiende auth.users; el email vive en auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  age INTEGER NOT NULL DEFAULT 0 CHECK (age >= 0 AND age <= 120),
  gender public.gender NOT NULL DEFAULT 'male',
  position public.position NOT NULL DEFAULT 'mediocampista',
  level public.skill_level NOT NULL DEFAULT 'intermedio',
  city TEXT NOT NULL DEFAULT 'Rancagua',
  availability TEXT[] NOT NULL DEFAULT '{}',
  photo_url TEXT NOT NULL DEFAULT '',
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_city ON public.profiles (city);
CREATE INDEX idx_profiles_gender ON public.profiles (gender);

-- ---------------------------------------------------------------------------
-- Oportunidades de partido (listados / “busco rival”, “faltan jugadores”, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE public.match_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.match_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT NOT NULL,
  venue TEXT NOT NULL,
  date_time TIMESTAMPTZ NOT NULL,
  level public.skill_level NOT NULL,
  creator_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  team_name TEXT,
  players_needed INTEGER CHECK (players_needed IS NULL OR players_needed >= 0),
  players_joined INTEGER NOT NULL DEFAULT 0 CHECK (players_joined >= 0),
  gender public.gender NOT NULL,
  status public.match_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_match_opportunities_creator ON public.match_opportunities (creator_id);
CREATE INDEX idx_match_opportunities_city_time ON public.match_opportunities (location, date_time);
CREATE INDEX idx_match_opportunities_gender ON public.match_opportunities (gender);
CREATE INDEX idx_match_opportunities_status ON public.match_opportunities (status);

-- ---------------------------------------------------------------------------
-- Quién se suma a una oportunidad (sustenta players_joined vía trigger)
-- ---------------------------------------------------------------------------
CREATE TABLE public.match_opportunity_participants (
  opportunity_id UUID NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.participant_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, user_id)
);

CREATE INDEX idx_mop_user ON public.match_opportunity_participants (user_id);

-- ---------------------------------------------------------------------------
-- Partido “confirmado” (instancia) — opcional para flujos post-oportunidad
-- ---------------------------------------------------------------------------
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES public.match_opportunities (id) ON DELETE SET NULL,
  status public.match_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.match_participants (
  match_id UUID NOT NULL REFERENCES public.matches (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  PRIMARY KEY (match_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Mensajes: en el mock matchId = id de oportunidad
-- ---------------------------------------------------------------------------
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 8000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_opportunity ON public.messages (opportunity_id, created_at);
CREATE INDEX idx_messages_sender ON public.messages (sender_id);

-- ---------------------------------------------------------------------------
-- Equipos y miembros
-- ---------------------------------------------------------------------------
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  level public.skill_level NOT NULL,
  captain_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  city TEXT NOT NULL,
  gender public.gender NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_teams_captain ON public.teams (captain_id);
CREATE INDEX idx_teams_city ON public.teams (city);

CREATE TABLE public.team_members (
  team_id UUID NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  position public.position NOT NULL,
  photo_url TEXT NOT NULL DEFAULT '',
  status public.team_member_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON public.team_members (user_id);

CREATE TABLE public.team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.invite_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_invites_no_self CHECK (inviter_id <> invitee_id)
);

CREATE INDEX idx_team_invites_invitee ON public.team_invites (invitee_id, status);
CREATE UNIQUE INDEX uq_team_invites_pending ON public.team_invites (team_id, invitee_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER trg_match_opportunities_updated
  BEFORE UPDATE ON public.match_opportunities
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER trg_teams_updated
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Mantener players_joined al insertar/actualizar/borrar participantes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_opportunity_players_joined()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target := OLD.opportunity_id;
  ELSE
    target := NEW.opportunity_id;
  END IF;

  UPDATE public.match_opportunities mo
  SET players_joined = (
    SELECT COUNT(*)::INTEGER
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = mo.id
      AND p.status IN ('pending', 'confirmed')
  )
  WHERE mo.id = target;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mop_refresh_count
  AFTER INSERT OR UPDATE OR DELETE ON public.match_opportunity_participants
  FOR EACH ROW EXECUTE PROCEDURE public.refresh_opportunity_players_joined();

-- ---------------------------------------------------------------------------
-- Perfil al registrarse (Supabase Auth → public.profiles)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime (Supabase): tablas útiles para suscripciones en el cliente
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_opportunities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_opportunity_participants;

-- ---------------------------------------------------------------------------
-- Notas para el siguiente paso (RLS)
-- ---------------------------------------------------------------------------
-- Habilitar RLS y políticas por tabla. Sin políticas, el service_role bypass;
-- el cliente anon/authenticated debe quedar restringido según tu modelo.


-- ==============================================================================
-- [002/086] 20250322180001_rls_policies.sql
-- ==============================================================================

-- Pichanga — Row Level Security (RLS)
-- Ejecutar después de 20250322180000_initial_schema.sql
--
-- Roles: el cliente usa la clave anon/public; tras login, JWT = rol authenticated.
-- auth.uid() = id del usuario en auth.users (UUID).
-- service_role y el rol postgres ignoran RLS (solo servidor/admin).

-- ---------------------------------------------------------------------------
-- Funciones auxiliares (SECURITY INVOKER por defecto: respetan RLS en subconsultas;
-- aquí solo leen tablas con políticas permisivas o usamos comparaciones directas)
-- ---------------------------------------------------------------------------

-- ¿auth.uid() es el creador de esta oportunidad?
CREATE OR REPLACE FUNCTION public.is_match_opportunity_creator(p_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_opportunities mo
    WHERE mo.id = p_opportunity_id
      AND mo.creator_id = auth.uid()
  );
$$;

-- ¿Puede ver/participar en el chat de esta oportunidad? (creador o inscrito)
CREATE OR REPLACE FUNCTION public.can_access_opportunity_thread(p_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_opportunities mo
    WHERE mo.id = p_opportunity_id
      AND mo.creator_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.user_id = auth.uid()
      AND p.status IN ('pending', 'confirmed')
  );
$$;

-- ¿auth.uid() es capitán del equipo?
CREATE OR REPLACE FUNCTION public.is_team_captain(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = p_team_id
      AND t.captain_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_match_opportunity_creator(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_opportunity_thread(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_team_captain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_match_opportunity_creator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_opportunity_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_captain(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: activar en todas las tablas de aplicación
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_opportunity_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Lectura: usuarios logueados ven perfiles (descubrimiento / listados).
CREATE POLICY profiles_select_authenticated
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Alta manual solo si coincide con el usuario de la sesión (el trigger de signup suele ir con rol service).
CREATE POLICY profiles_insert_own_id
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Solo el dueño actualiza su fila.
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Opcional: permitir borrar cuenta propia (cascade desde auth lo gestionas en Auth; esto es coherente con borrar perfil).
CREATE POLICY profiles_delete_own
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- match_opportunities
-- ---------------------------------------------------------------------------
CREATE POLICY match_opportunities_select_authenticated
  ON public.match_opportunities
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY match_opportunities_insert_creator
  ON public.match_opportunities
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY match_opportunities_update_creator
  ON public.match_opportunities
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY match_opportunities_delete_creator
  ON public.match_opportunities
  FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- ---------------------------------------------------------------------------
-- match_opportunity_participants
-- ---------------------------------------------------------------------------
CREATE POLICY mop_select_authenticated
  ON public.match_opportunity_participants
  FOR SELECT
  TO authenticated
  USING (true);

-- Uno se apunta a sí mismo a una oportunidad existente.
CREATE POLICY mop_insert_self
  ON public.match_opportunity_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.match_opportunities mo WHERE mo.id = opportunity_id
    )
  );

-- El creador de la oportunidad puede inscribir a otra persona (equipos / convocatoria).
CREATE POLICY mop_insert_as_creator
  ON public.match_opportunity_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_match_opportunity_creator(opportunity_id));

CREATE POLICY mop_update_self_or_creator
  ON public.match_opportunity_participants
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_match_opportunity_creator(opportunity_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_match_opportunity_creator(opportunity_id)
  );

CREATE POLICY mop_delete_self_or_creator
  ON public.match_opportunity_participants
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_match_opportunity_creator(opportunity_id)
  );

-- ---------------------------------------------------------------------------
-- matches (instancias de partido)
-- ---------------------------------------------------------------------------
CREATE POLICY matches_select_authenticated
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (true);

-- Crear instancia ligada a una oportunidad que yo creé (o sin oportunidad: solo si quieres flujos libres).
CREATE POLICY matches_insert_creator_of_opportunity
  ON public.matches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    opportunity_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.match_opportunities o
      WHERE o.id = opportunity_id
        AND o.creator_id = auth.uid()
    )
  );

CREATE POLICY matches_update_creator_of_opportunity
  ON public.matches
  FOR UPDATE
  TO authenticated
  USING (
    opportunity_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.match_opportunities o
      WHERE o.id = opportunity_id
        AND o.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    opportunity_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.match_opportunities o
      WHERE o.id = opportunity_id
        AND o.creator_id = auth.uid()
    )
  );

CREATE POLICY matches_delete_creator_of_opportunity
  ON public.matches
  FOR DELETE
  TO authenticated
  USING (
    opportunity_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.match_opportunities o
      WHERE o.id = opportunity_id
        AND o.creator_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- match_participants
-- ---------------------------------------------------------------------------
CREATE POLICY match_participants_select_authenticated
  ON public.match_participants
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY match_participants_insert_self_or_creator
  ON public.match_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_opportunities o ON o.id = m.opportunity_id
      WHERE m.id = match_id
        AND o.creator_id = auth.uid()
    )
  );

CREATE POLICY match_participants_delete_self_or_creator
  ON public.match_participants
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_opportunities o ON o.id = m.opportunity_id
      WHERE m.id = match_id
        AND o.creator_id = auth.uid()
    )
  );

-- Sin UPDATE explícito: borrar y volver a insertar si hace falta.

-- ---------------------------------------------------------------------------
-- messages (hilo por opportunity_id)
-- ---------------------------------------------------------------------------
CREATE POLICY messages_select_thread
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (public.can_access_opportunity_thread(opportunity_id));

CREATE POLICY messages_insert_sender_in_thread
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_opportunity_thread(opportunity_id)
  );

CREATE POLICY messages_update_sender
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY messages_delete_sender
  ON public.messages
  FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
CREATE POLICY teams_select_authenticated
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY teams_insert_as_captain
  ON public.teams
  FOR INSERT
  TO authenticated
  WITH CHECK (captain_id = auth.uid());

CREATE POLICY teams_update_captain
  ON public.teams
  FOR UPDATE
  TO authenticated
  USING (captain_id = auth.uid())
  WITH CHECK (captain_id = auth.uid());

CREATE POLICY teams_delete_captain
  ON public.teams
  FOR DELETE
  TO authenticated
  USING (captain_id = auth.uid());

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------
CREATE POLICY team_members_select_authenticated
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (true);

-- Capitán gestiona plantilla; el usuario puede insertar su propia fila (aceptar invitación / unirse si el flujo lo permite).
CREATE POLICY team_members_insert_captain
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_captain(team_id));

-- Solo unirse si existe invitación pendiente hacia este usuario (aceptar invitación).
CREATE POLICY team_members_insert_self_pending_invite
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.team_invites ti
      WHERE ti.team_id = team_id
        AND ti.invitee_id = auth.uid()
        AND ti.status = 'pending'
    )
  );

CREATE POLICY team_members_update_captain_or_self
  ON public.team_members
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_team_captain(team_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_team_captain(team_id)
  );

CREATE POLICY team_members_delete_captain_or_self
  ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_team_captain(team_id)
  );

-- ---------------------------------------------------------------------------
-- team_invites
-- ---------------------------------------------------------------------------
CREATE POLICY team_invites_select_parties
  ON public.team_invites
  FOR SELECT
  TO authenticated
  USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

-- Solo capitán envía invitación y debe figurar como inviter.
CREATE POLICY team_invites_insert_captain
  ON public.team_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    inviter_id = auth.uid()
    AND public.is_team_captain(team_id)
  );

CREATE POLICY team_invites_update_parties
  ON public.team_invites
  FOR UPDATE
  TO authenticated
  USING (inviter_id = auth.uid() OR invitee_id = auth.uid())
  WITH CHECK (inviter_id = auth.uid() OR invitee_id = auth.uid());

CREATE POLICY team_invites_delete_parties
  ON public.team_invites
  FOR DELETE
  TO authenticated
  USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Permisos de tablas para el rol authenticated (Supabase suele otorgarlos; por si acaso)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;


-- ==============================================================================
-- [003/086] 20250322190000_match_completion_and_ratings.sql
-- ==============================================================================

-- Finalización de partido por el organizador + calificaciones (ventana 48 h tras finalized_at)

CREATE TYPE public.rival_result AS ENUM ('creator_team', 'rival_team', 'draw');

ALTER TABLE public.match_opportunities
  ADD COLUMN finalized_at TIMESTAMPTZ,
  ADD COLUMN rival_result public.rival_result,
  ADD COLUMN casual_completed BOOLEAN;

COMMENT ON COLUMN public.match_opportunities.finalized_at IS 'Momento en que el organizador marcó el partido como jugado/cerrado.';
COMMENT ON COLUMN public.match_opportunities.rival_result IS 'Solo type=rival: quién ganó o empate.';
COMMENT ON COLUMN public.match_opportunities.casual_completed IS 'type=players|open: partido jugado (sin marcador de equipos).';

-- ---------------------------------------------------------------------------
-- Calificaciones: una fila por (oportunidad, quien califica)
-- El organizador no califica "al organizador" (organizer_rating NULL).
-- ---------------------------------------------------------------------------
CREATE TABLE public.match_opportunity_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  organizer_rating SMALLINT CHECK (organizer_rating IS NULL OR (organizer_rating >= 1 AND organizer_rating <= 5)),
  match_rating SMALLINT NOT NULL CHECK (match_rating >= 1 AND match_rating <= 5),
  level_rating SMALLINT NOT NULL CHECK (level_rating >= 1 AND level_rating <= 5),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, rater_id)
);

CREATE INDEX idx_mor_opportunity ON public.match_opportunity_ratings (opportunity_id);
CREATE INDEX idx_mor_rater ON public.match_opportunity_ratings (rater_id);

CREATE OR REPLACE FUNCTION public.enforce_match_rating_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID;
  mo RECORD;
BEGIN
  SELECT * INTO mo FROM public.match_opportunities WHERE id = NEW.opportunity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oportunidad no existe';
  END IF;
  IF mo.status IS DISTINCT FROM 'completed'::public.match_status OR mo.finalized_at IS NULL THEN
    RAISE EXCEPTION 'Solo se puede calificar un partido finalizado';
  END IF;
  IF now() > mo.finalized_at + interval '48 hours' THEN
    RAISE EXCEPTION 'Plazo de calificación vencido (48 h)';
  END IF;
  cid := mo.creator_id;
  IF NEW.rater_id IS DISTINCT FROM cid THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = NEW.opportunity_id
        AND p.user_id = NEW.rater_id
        AND p.status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'Solo el organizador o participantes confirmados pueden calificar';
    END IF;
  END IF;

  IF NEW.rater_id = cid THEN
    IF NEW.organizer_rating IS NOT NULL THEN
      RAISE EXCEPTION 'El organizador no califica la gestión (solo el partido en conjunto)';
    END IF;
  ELSE
    IF NEW.organizer_rating IS NULL THEN
      RAISE EXCEPTION 'Debes calificar la gestión del organizador';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_match_rating_rules
  BEFORE INSERT ON public.match_opportunity_ratings
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_match_rating_rules();

ALTER PUBLICATION supabase_realtime ADD TABLE public.match_opportunity_ratings;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.match_opportunity_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY mor_select_participants
  ON public.match_opportunity_ratings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND (
          mo.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.match_opportunity_participants p
            WHERE p.opportunity_id = mo.id
              AND p.user_id = auth.uid()
              AND p.status = 'confirmed'
          )
        )
    )
  );

CREATE POLICY mor_insert_self_eligible
  ON public.match_opportunity_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = rater_id
    AND EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND mo.status = 'completed'::public.match_status
        AND mo.finalized_at IS NOT NULL
        AND now() <= mo.finalized_at + interval '48 hours'
        AND (
          mo.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.match_opportunity_participants p
            WHERE p.opportunity_id = mo.id
              AND p.user_id = auth.uid()
              AND p.status = 'confirmed'
          )
        )
    )
  );


-- ==============================================================================
-- [004/086] 20250322193000_rival_challenges.sql
-- ==============================================================================

-- Desafíos de rival: directo a equipo o búsqueda abierta

CREATE TYPE public.rival_challenge_mode AS ENUM ('direct', 'open');
CREATE TYPE public.rival_challenge_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

CREATE TABLE public.rival_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL UNIQUE REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  challenger_team_id UUID NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  challenger_captain_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  challenged_team_id UUID REFERENCES public.teams (id) ON DELETE SET NULL,
  challenged_captain_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  accepted_team_id UUID REFERENCES public.teams (id) ON DELETE SET NULL,
  accepted_captain_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  mode public.rival_challenge_mode NOT NULL,
  status public.rival_challenge_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CHECK (
    (mode = 'direct' AND challenged_team_id IS NOT NULL AND challenged_captain_id IS NOT NULL)
    OR
    (mode = 'open')
  )
);

CREATE INDEX idx_rival_challenges_status ON public.rival_challenges (status);
CREATE INDEX idx_rival_challenges_challenged_cap ON public.rival_challenges (challenged_captain_id);
CREATE INDEX idx_rival_challenges_challenger_cap ON public.rival_challenges (challenger_captain_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rival_challenges;

ALTER TABLE public.rival_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY rival_challenges_select_related
  ON public.rival_challenges
  FOR SELECT
  TO authenticated
  USING (
    challenger_captain_id = auth.uid()
    OR challenged_captain_id = auth.uid()
    OR (
      mode = 'open'
      AND status = 'pending'
      AND EXISTS (
        SELECT 1
        FROM public.teams t
        WHERE t.captain_id = auth.uid()
          AND t.id <> challenger_team_id
      )
    )
  );

CREATE POLICY rival_challenges_insert_challenger
  ON public.rival_challenges
  FOR INSERT
  TO authenticated
  WITH CHECK (challenger_captain_id = auth.uid());

CREATE POLICY rival_challenges_update_accept_decline
  ON public.rival_challenges
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND (
      challenged_captain_id = auth.uid()
      OR (
        mode = 'open'
        AND EXISTS (
          SELECT 1
          FROM public.teams t
          WHERE t.captain_id = auth.uid()
            AND t.id <> challenger_team_id
        )
      )
      OR challenger_captain_id = auth.uid()
    )
  )
  WITH CHECK (
    (
      status IN ('accepted', 'declined')
      AND (
        challenged_captain_id = auth.uid()
        OR (
          mode = 'open'
          AND EXISTS (
            SELECT 1
            FROM public.teams t
            WHERE t.captain_id = auth.uid()
              AND t.id = accepted_team_id
          )
        )
      )
    )
    OR (status = 'cancelled' AND challenger_captain_id = auth.uid())
  );


-- ==============================================================================
-- [005/086] 20250322194000_match_suspension_reason.sql
-- ==============================================================================

-- Suspensión/cancelación de partido con motivo

ALTER TABLE public.match_opportunities
  ADD COLUMN suspended_at TIMESTAMPTZ,
  ADD COLUMN suspended_reason TEXT;

ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_suspended_reason_len
  CHECK (
    suspended_reason IS NULL
    OR (char_length(trim(suspended_reason)) >= 5 AND char_length(suspended_reason) <= 1000)
  );

COMMENT ON COLUMN public.match_opportunities.suspended_at IS 'Fecha de suspensión/cancelación del partido.';
COMMENT ON COLUMN public.match_opportunities.suspended_reason IS 'Motivo entregado por el organizador al suspender.';


-- ==============================================================================
-- [006/086] 20250324120000_team_logos_storage.sql
-- ==============================================================================

-- Bucket público para escudos de equipo (subida solo del capitán vía RLS).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
  'team-logos',
  'team-logos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'team-logos');

CREATE POLICY "team_logos_select_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'team-logos');

CREATE POLICY "team_logos_insert_captain"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'team-logos'
    AND split_part(name, '/', 1) IN (
      SELECT id::text FROM public.teams WHERE captain_id = auth.uid()
    )
  );

CREATE POLICY "team_logos_update_captain"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND split_part(name, '/', 1) IN (
      SELECT id::text FROM public.teams WHERE captain_id = auth.uid()
    )
  );

CREATE POLICY "team_logos_delete_captain"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND split_part(name, '/', 1) IN (
      SELECT id::text FROM public.teams WHERE captain_id = auth.uid()
    )
  );


-- ==============================================================================
-- [007/086] 20250325140000_anon_public_team_invite_read.sql
-- ==============================================================================

-- Lectura pública mínima para la ficha de equipo en /equipo/[id] (enlaces de invitación).
-- Los UUID no son enumerables vía PostgREST sin listar; el riesgo es compartir enlace con quien no debiera.
-- Para nombres en plantilla sin service role, la app usa solo datos de team_members (foto/posición).

CREATE POLICY teams_select_anon_public_invite
  ON public.teams
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY team_members_select_anon_public_invite
  ON public.team_members
  FOR SELECT
  TO anon
  USING (true);


-- ==============================================================================
-- [008/086] 20250325160000_revuelta_goalkeeper_and_public_read.sql
-- ==============================================================================

-- Rol arquero en revueltas (tipo open): máximo 2 por oportunidad.
ALTER TABLE public.match_opportunity_participants
  ADD COLUMN IF NOT EXISTS is_goalkeeper BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_open_revuelta_goalkeeper_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  mo_type public.match_type;
  cnt int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT type INTO mo_type
  FROM public.match_opportunities
  WHERE id = NEW.opportunity_id;

  IF mo_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF mo_type IS DISTINCT FROM 'open' THEN
    IF NEW.is_goalkeeper THEN
      RAISE EXCEPTION 'El rol arquero solo aplica en revueltas (tipo open)';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT COALESCE(NEW.is_goalkeeper, false) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int INTO cnt
  FROM public.match_opportunity_participants
  WHERE opportunity_id = NEW.opportunity_id
    AND is_goalkeeper = true
    AND user_id IS DISTINCT FROM NEW.user_id;

  IF cnt >= 2 THEN
    RAISE EXCEPTION 'Ya hay 2 arqueros en esta revuelta';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mop_goalkeeper_cap ON public.match_opportunity_participants;
CREATE TRIGGER trg_mop_goalkeeper_cap
  BEFORE INSERT OR UPDATE ON public.match_opportunity_participants
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_open_revuelta_goalkeeper_limit();

-- Lectura pública para /revuelta/[id] (enlaces de invitación)
CREATE POLICY match_opportunities_select_anon_open_active
  ON public.match_opportunities
  FOR SELECT
  TO anon
  USING (
    type = 'open'
    AND status IN ('pending', 'confirmed')
  );

CREATE POLICY mop_select_anon_open_active
  ON public.match_opportunity_participants
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND mo.type = 'open'
        AND mo.status IN ('pending', 'confirmed')
    )
  );


-- ==============================================================================
-- [009/086] 20250325180000_revuelta_lineup.sql
-- ==============================================================================

-- Sorteo de equipos A/B en revueltas (organizador, cupos completos).
ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS revuelta_lineup JSONB DEFAULT NULL;

COMMENT ON COLUMN public.match_opportunities.revuelta_lineup IS
  'JSON: { teamA: { userIds: uuid[], colorHex: string }, teamB: { ... }, createdAt: iso }';


-- ==============================================================================
-- [010/086] 20250326120000_players_seek_profile.sql
-- ==============================================================================

-- Búsqueda de jugadores: qué tipo de cupos ofrece el organizador
ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS players_seek_profile TEXT;

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_players_seek_profile_check;

ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_players_seek_profile_check
  CHECK (
    players_seek_profile IS NULL
    OR players_seek_profile IN ('gk_only', 'field_only', 'gk_and_field')
  );


-- ==============================================================================
-- [011/086] 20250326140000_profile_avatars_storage.sql
-- ==============================================================================

-- Avatares de perfil: cada usuario sube solo bajo su UUID (público para leer en la app).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
  'profile-avatars',
  'profile-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'profile-avatars');

DROP POLICY IF EXISTS "profile_avatars_select_public" ON storage.objects;
CREATE POLICY "profile_avatars_select_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS "profile_avatars_insert_own" ON storage.objects;
CREATE POLICY "profile_avatars_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_avatars_update_own" ON storage.objects;
CREATE POLICY "profile_avatars_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_avatars_delete_own" ON storage.objects;
CREATE POLICY "profile_avatars_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );


-- ==============================================================================
-- [012/086] 20250326160000_team_join_requests.sql
-- ==============================================================================

-- Solicitudes de ingreso a equipo: el jugador pide; el capitán acepta o rechaza.

CREATE TABLE public.team_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.invite_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un solo pendiente por (equipo, solicitante).
CREATE UNIQUE INDEX uq_team_join_requests_pending
  ON public.team_join_requests (team_id, requester_id)
  WHERE status = 'pending';

CREATE INDEX idx_team_join_requests_team ON public.team_join_requests (team_id, status);
CREATE INDEX idx_team_join_requests_requester ON public.team_join_requests (requester_id, status);

DROP TRIGGER IF EXISTS trg_team_join_requests_updated ON public.team_join_requests;
CREATE TRIGGER trg_team_join_requests_updated
  BEFORE UPDATE ON public.team_join_requests
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;

ALTER TABLE public.team_join_requests ENABLE ROW LEVEL SECURITY;

-- Lectura: solicitante o capitán del equipo.
CREATE POLICY team_join_requests_select
  ON public.team_join_requests
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = requester_id
    OR public.is_team_captain(team_id)
  );

-- Alta: solo el propio usuario; no capitán ni ya miembro; mismo género que el equipo.
CREATE POLICY team_join_requests_insert_requester
  ON public.team_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND NOT public.is_team_captain(team_id)
    AND NOT public.is_team_member(team_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.teams t
      INNER JOIN public.profiles p ON p.id = auth.uid()
      WHERE t.id = team_id
        AND t.gender = p.gender
    )
  );

-- Capitán: aceptar o rechazar (actualizar status).
CREATE POLICY team_join_requests_update_captain
  ON public.team_join_requests
  FOR UPDATE
  TO authenticated
  USING (public.is_team_captain(team_id))
  WITH CHECK (public.is_team_captain(team_id));

-- Solicitante: cancelar su propia solicitud pendiente (borrar).
CREATE POLICY team_join_requests_delete_requester_pending
  ON public.team_join_requests
  FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id AND status = 'pending');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_join_requests TO authenticated;


-- ==============================================================================
-- [013/086] 20250326170000_team_private_settings.sql
-- ==============================================================================

-- WhatsApp + reglas internas: solo miembros del equipo (y capitán) pueden leer; solo capitán escribe.

CREATE TABLE public.team_private_settings (
  team_id UUID PRIMARY KEY REFERENCES public.teams (id) ON DELETE CASCADE,
  whatsapp_invite_url TEXT,
  rules_text TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_team_private_settings_updated ON public.team_private_settings;
CREATE TRIGGER trg_team_private_settings_updated
  BEFORE UPDATE ON public.team_private_settings
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.team_private_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_private_settings_select_member_or_captain
  ON public.team_private_settings
  FOR SELECT
  TO authenticated
  USING (
    public.is_team_member(team_id, auth.uid())
    OR public.is_team_captain(team_id)
  );

CREATE POLICY team_private_settings_insert_captain
  ON public.team_private_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_captain(team_id));

CREATE POLICY team_private_settings_update_captain
  ON public.team_private_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_team_captain(team_id))
  WITH CHECK (public.is_team_captain(team_id));

CREATE POLICY team_private_settings_delete_captain
  ON public.team_private_settings
  FOR DELETE
  TO authenticated
  USING (public.is_team_captain(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_private_settings TO authenticated;


-- ==============================================================================
-- [014/086] 20250327100000_sports_venues_and_bookings.sql
-- ==============================================================================

-- Centros deportivos, canchas, horario semanal, reservas y vinculación opcional a partidos.
-- Cuentas `venue`: solo asignar account_type = 'venue' manualmente en DB / service_role.

CREATE TYPE public.account_type AS ENUM ('player', 'venue');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type public.account_type NOT NULL DEFAULT 'player';

DROP POLICY IF EXISTS profiles_insert_own_id ON public.profiles;
CREATE POLICY profiles_insert_own_id
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id AND account_type = 'player');

CREATE TYPE public.venue_reservation_status AS ENUM ('confirmed', 'cancelled');

CREATE TABLE public.sports_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  maps_url TEXT,
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT 'Rancagua',
  slot_duration_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (slot_duration_minutes >= 15 AND slot_duration_minutes <= 180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sports_venues_owner ON public.sports_venues (owner_id);
CREATE INDEX idx_sports_venues_city ON public.sports_venues (city);

CREATE TRIGGER trg_sports_venues_updated
  BEFORE UPDATE ON public.sports_venues
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TABLE public.venue_courts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.sports_venues (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_venue_courts_venue ON public.venue_courts (venue_id);

CREATE TABLE public.venue_weekly_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.sports_venues (id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  UNIQUE (venue_id, day_of_week)
);

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS sports_venue_id UUID REFERENCES public.sports_venues (id) ON DELETE SET NULL;

CREATE TABLE public.venue_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id UUID NOT NULL REFERENCES public.venue_courts (id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  booker_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  match_opportunity_id UUID REFERENCES public.match_opportunities (id) ON DELETE SET NULL,
  status public.venue_reservation_status NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_reservations_time_order CHECK (ends_at > starts_at)
);

CREATE INDEX idx_venue_reservations_court_time ON public.venue_reservations (court_id, starts_at);
CREATE INDEX idx_venue_reservations_booker ON public.venue_reservations (booker_user_id);
CREATE INDEX idx_venue_reservations_match ON public.venue_reservations (match_opportunity_id);

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS venue_reservation_id UUID REFERENCES public.venue_reservations (id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.venue_reservations_check_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.venue_reservations r
    WHERE r.court_id = NEW.court_id
      AND r.status = 'confirmed'
      AND r.id IS DISTINCT FROM NEW.id
      AND r.starts_at < NEW.ends_at
      AND r.ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'venue_reservation_overlap' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venue_reservations_overlap ON public.venue_reservations;
CREATE TRIGGER trg_venue_reservations_overlap
  BEFORE INSERT OR UPDATE ON public.venue_reservations
  FOR EACH ROW EXECUTE PROCEDURE public.venue_reservations_check_overlap();

CREATE OR REPLACE FUNCTION public.is_venue_owner(p_venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sports_venues v
    WHERE v.id = p_venue_id
      AND v.owner_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_venue_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_venue_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.book_venue_slot(
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_court_id uuid;
  v_res_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sports_venues v WHERE v.id = p_venue_id) THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  SELECT c.id INTO v_court_id
  FROM public.venue_courts c
  WHERE c.venue_id = p_venue_id
    AND NOT EXISTS (
      SELECT 1 FROM public.venue_reservations r
      WHERE r.court_id = c.id
        AND r.status = 'confirmed'
        AND r.starts_at < p_ends_at
        AND r.ends_at > p_starts_at
    )
  ORDER BY c.sort_order, c.name, c.id
  LIMIT 1;

  IF v_court_id IS NULL THEN
    RAISE EXCEPTION 'no_court_available';
  END IF;

  INSERT INTO public.venue_reservations (court_id, starts_at, ends_at, booker_user_id, status)
  VALUES (v_court_id, p_starts_at, p_ends_at, auth.uid(), 'confirmed')
  RETURNING id INTO v_res_id;

  RETURN v_res_id;
END;
$$;

REVOKE ALL ON FUNCTION public.book_venue_slot(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_venue_slot(uuid, timestamptz, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.sports_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_weekly_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY sports_venues_select_authenticated
  ON public.sports_venues FOR SELECT TO authenticated USING (true);

CREATE POLICY sports_venues_select_anon
  ON public.sports_venues FOR SELECT TO anon USING (true);

CREATE POLICY sports_venues_insert_venue_owner
  ON public.sports_venues FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.account_type = 'venue'
    )
  );

CREATE POLICY sports_venues_update_owner
  ON public.sports_venues FOR UPDATE TO authenticated
  USING (public.is_venue_owner(id))
  WITH CHECK (public.is_venue_owner(id));

CREATE POLICY sports_venues_delete_owner
  ON public.sports_venues FOR DELETE TO authenticated
  USING (public.is_venue_owner(id));

CREATE POLICY venue_courts_select_authenticated
  ON public.venue_courts FOR SELECT TO authenticated USING (true);

CREATE POLICY venue_courts_select_anon
  ON public.venue_courts FOR SELECT TO anon USING (true);

CREATE POLICY venue_courts_write_owner
  ON public.venue_courts FOR ALL TO authenticated
  USING (public.is_venue_owner(venue_id))
  WITH CHECK (public.is_venue_owner(venue_id));

CREATE POLICY venue_weekly_hours_select_authenticated
  ON public.venue_weekly_hours FOR SELECT TO authenticated USING (true);

CREATE POLICY venue_weekly_hours_select_anon
  ON public.venue_weekly_hours FOR SELECT TO anon USING (true);

CREATE POLICY venue_weekly_hours_write_owner
  ON public.venue_weekly_hours FOR ALL TO authenticated
  USING (public.is_venue_owner(venue_id))
  WITH CHECK (public.is_venue_owner(venue_id));

CREATE POLICY venue_reservations_select
  ON public.venue_reservations FOR SELECT TO authenticated
  USING (
    booker_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.venue_courts c
      WHERE c.id = venue_reservations.court_id
        AND public.is_venue_owner(c.venue_id)
    )
  );

CREATE POLICY venue_reservations_update
  ON public.venue_reservations FOR UPDATE TO authenticated
  USING (
    booker_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.venue_courts c
      WHERE c.id = venue_reservations.court_id
        AND public.is_venue_owner(c.venue_id)
    )
  )
  WITH CHECK (true);

CREATE POLICY venue_reservations_delete_owner
  ON public.venue_reservations FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_courts c
      WHERE c.id = venue_reservations.court_id
        AND public.is_venue_owner(c.venue_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sports_venues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_courts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_weekly_hours TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.venue_reservations TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sports_venues;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_reservations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ==============================================================================
-- [015/086] 20250327110000_venue_public_reservations_rpc.sql
-- ==============================================================================

-- Lectura pública de reservas por rango (solo filas del venue indicado); para huecos en /centro/[id].

CREATE OR REPLACE FUNCTION public.venue_public_reservations_in_range(
  p_venue_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  court_id uuid,
  starts_at timestamptz,
  ends_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.court_id, r.starts_at, r.ends_at
  FROM public.venue_reservations r
  INNER JOIN public.venue_courts c
    ON c.id = r.court_id AND c.venue_id = p_venue_id
  WHERE r.status = 'confirmed'
    AND r.starts_at < p_to
    AND r.ends_at > p_from;
$$;

REVOKE ALL ON FUNCTION public.venue_public_reservations_in_range(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.venue_public_reservations_in_range(uuid, timestamptz, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.venue_public_reservations_in_range(uuid, timestamptz, timestamptz) TO authenticated;


-- ==============================================================================
-- [016/086] 20250327120000_team_members_limit_5.sql
-- ==============================================================================

-- Limitar membresías de equipo por usuario (máx. 5 equipos totales).
-- Aplica a inserts en public.team_members (crear equipo o aceptar invitación/solicitud).

CREATE OR REPLACE FUNCTION public.enforce_team_members_limit_5()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.team_members tm
  WHERE tm.user_id = NEW.user_id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'team_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_members_limit_5 ON public.team_members;
CREATE TRIGGER trg_team_members_limit_5
  BEFORE INSERT ON public.team_members
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_team_members_limit_5();

REVOKE ALL ON FUNCTION public.enforce_team_members_limit_5() FROM PUBLIC;


-- ==============================================================================
-- [017/086] 20250327120001_teams_limit_5.sql
-- ==============================================================================

-- Bloquear creación de equipos si el capitán ya pertenece a 5 equipos.
-- Esto evita crear filas "huérfanas" en public.teams cuando falla el insert a team_members.

CREATE OR REPLACE FUNCTION public.enforce_teams_limit_5_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.captain_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.team_members tm
  WHERE tm.user_id = NEW.captain_id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'team_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teams_limit_5 ON public.teams;
CREATE TRIGGER trg_teams_limit_5
  BEFORE INSERT ON public.teams
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_teams_limit_5_on_insert();

REVOKE ALL ON FUNCTION public.enforce_teams_limit_5_on_insert() FROM PUBLIC;


-- ==============================================================================
-- [018/086] 20250327130000_revuelta_roles_and_capacity.sql
-- ==============================================================================

-- Reglas de revuelta (tipo open):
-- - players_needed obligatorio entre 10 y 12
-- - cupos internos: máximo 2 arqueros, y se reservan 2 cupos para arqueros
--   (campo máx. = players_needed - 2)

-- Normalizar revueltas existentes antes del constraint (para no fallar al aplicar en DB con data).
UPDATE public.match_opportunities
SET players_needed =
  LEAST(12, GREATEST(10, COALESCE(players_needed, 10)))
WHERE type = 'open'
  AND (players_needed IS NULL OR players_needed < 10 OR players_needed > 12);

-- Agregar constraint sin validar primero; luego VALIDATE (evita error si hay concurrencia).
ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_open_players_needed_range
  CHECK (
    type IS DISTINCT FROM 'open'
    OR (players_needed IS NOT NULL AND players_needed BETWEEN 10 AND 12)
  ) NOT VALID;

ALTER TABLE public.match_opportunities
  VALIDATE CONSTRAINT match_opportunities_open_players_needed_range;

CREATE OR REPLACE FUNCTION public.enforce_open_revuelta_role_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo_type public.match_type;
  cap int;
  gk_cnt int;
  field_cnt int;
  joined_cnt int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT mo.type, mo.players_needed
    INTO mo_type, cap
  FROM public.match_opportunities mo
  WHERE mo.id = NEW.opportunity_id;

  IF mo_type IS DISTINCT FROM 'open' THEN
    RETURN NEW;
  END IF;

  -- Conteo actual (excluye al usuario si está actualizando su fila)
  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed'))::int,
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed') AND is_goalkeeper = true)::int,
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed') AND is_goalkeeper = false)::int
  INTO joined_cnt, gk_cnt, field_cnt
  FROM public.match_opportunity_participants
  WHERE opportunity_id = NEW.opportunity_id
    AND user_id IS DISTINCT FROM NEW.user_id;

  IF cap IS NOT NULL AND cap > 0 AND joined_cnt >= cap THEN
    RAISE EXCEPTION 'No quedan cupos en este partido' USING ERRCODE = 'check_violation';
  END IF;

  -- Máx. 2 arqueros (además del trigger existente)
  IF COALESCE(NEW.is_goalkeeper, false) = true THEN
    IF gk_cnt >= 2 THEN
      RAISE EXCEPTION 'Ya hay 2 arqueros en esta revuelta' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Campo: reservar 2 cupos para arqueros => campo máx. = cap - 2
  IF cap IS NOT NULL AND cap > 0 THEN
    IF field_cnt >= GREATEST(0, cap - 2) THEN
      RAISE EXCEPTION 'Solo quedan cupos de arquero' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mop_open_revuelta_role_slots ON public.match_opportunity_participants;
CREATE TRIGGER trg_mop_open_revuelta_role_slots
  BEFORE INSERT OR UPDATE ON public.match_opportunity_participants
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_open_revuelta_role_slots();

REVOKE ALL ON FUNCTION public.enforce_open_revuelta_role_slots() FROM PUBLIC;


-- ==============================================================================
-- [019/086] 20260326112000_profiles_whatsapp_required_signup.sql
-- ==============================================================================

-- WhatsApp obligatorio para jugadores al crear cuenta.
-- Se agrega la columna en profiles y se actualiza el trigger de alta de auth.users
-- para tomar whatsapp_phone desde raw_user_meta_data.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, whatsapp_phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'whatsapp_phone', '')
  );
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_player_whatsapp_required;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_player_whatsapp_required
  CHECK (
    account_type IS DISTINCT FROM 'player'
    OR char_length(btrim(whatsapp_phone)) > 0
  ) NOT VALID;


-- ==============================================================================
-- [020/086] 20260326123000_allow_auth_user_creation_without_whatsapp.sql
-- ==============================================================================

-- Permite crear usuarios desde Supabase Authentication sin exigir
-- whatsapp_phone en el alta técnica del perfil (trigger handle_new_user).
-- El WhatsApp puede seguir pidiéndose en la app para cuentas jugador.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_player_whatsapp_required;


-- ==============================================================================
-- [021/086] 20260326200000_venue_reservations_payments_and_history.sql
-- ==============================================================================

-- Flujo de pagos para reservas de centros deportivos:
-- - venue_reservations.status: pending | confirmed | cancelled
-- - campos de precio/abono/pago + timestamps + motivo de cancelación
-- - historial (venue_reservation_events)
-- - al cancelar una reserva vinculada a un partido, se cancela el partido con motivo

DO $$
BEGIN
  -- Agregar valor 'pending' al enum si no existe.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'venue_reservation_status'
      AND e.enumlabel = 'pending'
  ) THEN
    ALTER TYPE public.venue_reservation_status ADD VALUE 'pending' BEFORE 'confirmed';
  END IF;
END
$$;

CREATE TYPE public.venue_payment_status AS ENUM ('unpaid', 'deposit_paid', 'paid');

ALTER TABLE public.venue_reservations
  ADD COLUMN IF NOT EXISTS payment_status public.venue_payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS price_per_hour INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS deposit_amount INTEGER,
  ADD COLUMN IF NOT EXISTS paid_amount INTEGER,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- Backfill: si ya están confirmadas, setear timestamp de confirmación.
UPDATE public.venue_reservations
SET confirmed_at = COALESCE(confirmed_at, created_at)
WHERE status = 'confirmed' AND confirmed_at IS NULL;

-- Historial de eventos
CREATE TABLE IF NOT EXISTS public.venue_reservation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.venue_reservations (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vre_reservation_id ON public.venue_reservation_events (reservation_id, created_at DESC);

ALTER TABLE public.venue_reservation_events ENABLE ROW LEVEL SECURITY;

-- Solo el dueño del centro (por la cancha) o el booker puede ver el historial.
DROP POLICY IF EXISTS venue_reservation_events_select ON public.venue_reservation_events;
CREATE POLICY venue_reservation_events_select
  ON public.venue_reservation_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.venue_reservations r
      JOIN public.venue_courts c ON c.id = r.court_id
      WHERE r.id = venue_reservation_events.reservation_id
        AND (
          r.booker_user_id = auth.uid()
          OR public.is_venue_owner(c.venue_id)
        )
    )
  );

-- Solo el dueño del centro puede insertar eventos (para logging interno).
DROP POLICY IF EXISTS venue_reservation_events_insert_owner ON public.venue_reservation_events;
CREATE POLICY venue_reservation_events_insert_owner
  ON public.venue_reservation_events FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.venue_reservations r
      JOIN public.venue_courts c ON c.id = r.court_id
      WHERE r.id = venue_reservation_events.reservation_id
        AND public.is_venue_owner(c.venue_id)
    )
  );

GRANT SELECT, INSERT ON public.venue_reservation_events TO authenticated;

-- Overlap: ahora pending también bloquea (para que no se duplique mientras se paga).
CREATE OR REPLACE FUNCTION public.venue_reservations_check_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.venue_reservations r
    WHERE r.court_id = NEW.court_id
      AND r.status IN ('pending', 'confirmed')
      AND r.id IS DISTINCT FROM NEW.id
      AND r.starts_at < NEW.ends_at
      AND r.ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'venue_reservation_overlap' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Reservar: ahora crea pending (no confirmed)
CREATE OR REPLACE FUNCTION public.book_venue_slot(
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_court_id uuid;
  v_res_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sports_venues v WHERE v.id = p_venue_id) THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  SELECT c.id INTO v_court_id
  FROM public.venue_courts c
  WHERE c.venue_id = p_venue_id
    AND NOT EXISTS (
      SELECT 1 FROM public.venue_reservations r
      WHERE r.court_id = c.id
        AND r.status IN ('pending', 'confirmed')
        AND r.starts_at < p_ends_at
        AND r.ends_at > p_starts_at
    )
  ORDER BY c.sort_order, c.name, c.id
  LIMIT 1;

  IF v_court_id IS NULL THEN
    RAISE EXCEPTION 'no_court_available';
  END IF;

  INSERT INTO public.venue_reservations (court_id, starts_at, ends_at, booker_user_id, status, payment_status)
  VALUES (v_court_id, p_starts_at, p_ends_at, auth.uid(), 'pending', 'unpaid')
  RETURNING id INTO v_res_id;

  RETURN v_res_id;
END;
$$;

-- Al cancelar una reserva vinculada a un partido, cancelar el partido (historial para organizador).
CREATE OR REPLACE FUNCTION public.handle_venue_reservation_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
  END IF;

  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    IF NEW.match_opportunity_id IS NOT NULL THEN
      UPDATE public.match_opportunities mo
      SET status = 'cancelled',
          suspended_at = now(),
          suspended_reason = COALESCE(NEW.cancelled_reason, 'Reserva cancelada por el centro deportivo')
      WHERE mo.id = NEW.match_opportunity_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venue_reservation_status_change ON public.venue_reservations;
CREATE TRIGGER trg_venue_reservation_status_change
  BEFORE UPDATE ON public.venue_reservations
  FOR EACH ROW EXECUTE PROCEDURE public.handle_venue_reservation_status_change();



-- ==============================================================================
-- [022/086] 20260327001000_admin_and_self_confirmed_reservations.sql
-- ==============================================================================

-- Admin global + autoconfirmación guiada por organizador/booker.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'account_type'
      AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE public.account_type ADD VALUE 'admin';
  END IF;
END
$$;

ALTER TABLE public.venue_reservations
  ADD COLUMN IF NOT EXISTS confirmed_by_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmation_source TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_note TEXT;

ALTER TABLE public.venue_reservations
  DROP CONSTRAINT IF EXISTS venue_reservations_confirmation_source_check;

ALTER TABLE public.venue_reservations
  ADD CONSTRAINT venue_reservations_confirmation_source_check
  CHECK (
    confirmation_source IS NULL
    OR confirmation_source IN ('venue_owner', 'booker_self', 'admin')
  );

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.account_type::text = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS venue_reservations_select_admin ON public.venue_reservations;
CREATE POLICY venue_reservations_select_admin
  ON public.venue_reservations
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS venue_reservations_update_admin ON public.venue_reservations;
CREATE POLICY venue_reservations_update_admin
  ON public.venue_reservations
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ==============================================================================
-- [023/086] 20260327012000_venue_manual_reservations_insert_policy.sql
-- ==============================================================================

-- Permite al dueño del centro ingresar reservas manuales desde dashboard.

DROP POLICY IF EXISTS venue_reservations_insert_owner ON public.venue_reservations;
CREATE POLICY venue_reservations_insert_owner
  ON public.venue_reservations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.venue_courts c
      WHERE c.id = venue_reservations.court_id
        AND public.is_venue_owner(c.venue_id)
    )
  );

GRANT INSERT ON public.venue_reservations TO authenticated;


-- ==============================================================================
-- [024/086] 20260329120000_geo_locations.sql
-- ==============================================================================

-- ============================================================================
-- Ubicación geográfica (Bloque 1 de N)
--
-- Plan por bloques:
--   1) Esta migración: tablas geo_* + seed Chile → VI Región → Rancagua,
--      columnas city_id + backfill + RLS + default para nuevas filas.
--   2) App: tipos, queries Supabase, leer catálogo en cliente.
--   3) UI: selects encadenados (de momento solo Rancagua visible / deshabilitado).
--   4) Admin: API + pantalla para alta país/región/ciudad.
--   5) Filtros por city_id del perfil; opcional retirar columna city TEXT antigua.
--
-- De momento solo existe un país (CL), una región (VI) y una ciudad (Rancagua).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
CREATE TABLE public.geo_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT geo_countries_iso_code_lower CHECK (iso_code = lower(iso_code)),
  CONSTRAINT geo_countries_iso_code_len CHECK (char_length(iso_code) = 2)
);

CREATE UNIQUE INDEX geo_countries_iso_code_key ON public.geo_countries (iso_code);

CREATE TABLE public.geo_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES public.geo_countries (id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT geo_regions_code_upper CHECK (code = upper(code))
);

CREATE UNIQUE INDEX geo_regions_country_code_key ON public.geo_regions (country_id, code);

CREATE INDEX idx_geo_regions_country ON public.geo_regions (country_id);

CREATE TABLE public.geo_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.geo_regions (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT geo_cities_slug_lower CHECK (slug = lower(slug))
);

CREATE UNIQUE INDEX geo_cities_region_slug_key ON public.geo_cities (region_id, slug);

CREATE INDEX idx_geo_cities_region ON public.geo_cities (region_id);

-- Seed: Chile, VI Región, Rancagua
INSERT INTO public.geo_countries (iso_code, name, is_active)
VALUES ('cl', 'Chile', true);

INSERT INTO public.geo_regions (country_id, code, name, is_active)
SELECT c.id, 'VI', 'Región del Libertador General Bernardo O''Higgins', true
FROM public.geo_countries c
WHERE c.iso_code = 'cl';

INSERT INTO public.geo_cities (region_id, name, slug, is_active)
SELECT r.id, 'Rancagua', 'rancagua', true
FROM public.geo_regions r
JOIN public.geo_countries c ON c.id = r.country_id
WHERE c.iso_code = 'cl' AND r.code = 'VI';

-- Ciudad por defecto (nuevas filas hasta que la app envíe otro city_id)
CREATE OR REPLACE FUNCTION public.default_geo_city_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.id
  FROM public.geo_cities c
  INNER JOIN public.geo_regions r ON r.id = c.region_id
  INNER JOIN public.geo_countries co ON co.id = r.country_id
  WHERE co.iso_code = 'cl'
    AND r.code = 'VI'
    AND c.slug = 'rancagua'
    AND c.is_active
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.default_geo_city_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_geo_city_id() TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- FKs en tablas de negocio (conviven con city TEXT hasta Bloque 5)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.geo_cities (id) ON DELETE RESTRICT;

ALTER TABLE public.sports_venues
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.geo_cities (id) ON DELETE RESTRICT;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.geo_cities (id) ON DELETE RESTRICT;

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES public.geo_cities (id) ON DELETE RESTRICT;

UPDATE public.profiles SET city_id = public.default_geo_city_id() WHERE city_id IS NULL;
UPDATE public.sports_venues SET city_id = public.default_geo_city_id() WHERE city_id IS NULL;
UPDATE public.teams SET city_id = public.default_geo_city_id() WHERE city_id IS NULL;
UPDATE public.match_opportunities SET city_id = public.default_geo_city_id() WHERE city_id IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN city_id SET NOT NULL,
  ALTER COLUMN city_id SET DEFAULT public.default_geo_city_id();

ALTER TABLE public.sports_venues
  ALTER COLUMN city_id SET NOT NULL,
  ALTER COLUMN city_id SET DEFAULT public.default_geo_city_id();

ALTER TABLE public.teams
  ALTER COLUMN city_id SET NOT NULL,
  ALTER COLUMN city_id SET DEFAULT public.default_geo_city_id();

ALTER TABLE public.match_opportunities
  ALTER COLUMN city_id SET NOT NULL,
  ALTER COLUMN city_id SET DEFAULT public.default_geo_city_id();

CREATE INDEX IF NOT EXISTS idx_profiles_city_id ON public.profiles (city_id);
CREATE INDEX IF NOT EXISTS idx_sports_venues_city_id ON public.sports_venues (city_id);
CREATE INDEX IF NOT EXISTS idx_teams_city_id ON public.teams (city_id);
CREATE INDEX IF NOT EXISTS idx_match_opportunities_city_id ON public.match_opportunities (city_id);
CREATE INDEX IF NOT EXISTS idx_match_opportunities_city_id_time
  ON public.match_opportunities (city_id, date_time);

-- ---------------------------------------------------------------------------
-- RLS: lectura pública del catálogo; mutación solo admin (listo para Bloque 4)
-- ---------------------------------------------------------------------------
ALTER TABLE public.geo_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY geo_countries_select_all
  ON public.geo_countries FOR SELECT
  USING (true);

CREATE POLICY geo_regions_select_all
  ON public.geo_regions FOR SELECT
  USING (true);

CREATE POLICY geo_cities_select_all
  ON public.geo_cities FOR SELECT
  USING (true);

CREATE POLICY geo_countries_admin_insert
  ON public.geo_countries FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY geo_countries_admin_update
  ON public.geo_countries FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY geo_countries_admin_delete
  ON public.geo_countries FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY geo_regions_admin_insert
  ON public.geo_regions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY geo_regions_admin_update
  ON public.geo_regions FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY geo_regions_admin_delete
  ON public.geo_regions FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY geo_cities_admin_insert
  ON public.geo_cities FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY geo_cities_admin_update
  ON public.geo_cities FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY geo_cities_admin_delete
  ON public.geo_cities FOR DELETE TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.geo_countries TO anon;
GRANT SELECT ON public.geo_regions TO anon;
GRANT SELECT ON public.geo_cities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_countries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_regions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_cities TO authenticated;
GRANT ALL ON public.geo_countries TO service_role;
GRANT ALL ON public.geo_regions TO service_role;
GRANT ALL ON public.geo_cities TO service_role;


-- ==============================================================================
-- [025/086] 20260329160000_court_price_per_hour.sql
-- ==============================================================================

-- Precio por hora (CLP) por cancha; se copia a venue_reservations al reservar vía RPC.

ALTER TABLE public.venue_courts
  ADD COLUMN IF NOT EXISTS price_per_hour INTEGER;

ALTER TABLE public.venue_courts
  DROP CONSTRAINT IF EXISTS venue_courts_price_per_hour_nonneg;

ALTER TABLE public.venue_courts
  ADD CONSTRAINT venue_courts_price_per_hour_nonneg CHECK (
    price_per_hour IS NULL OR price_per_hour >= 0
  );

COMMENT ON COLUMN public.venue_courts.price_per_hour IS
  'Precio por hora en CLP (opcional). Se guarda en venue_reservations al crear la reserva.';

-- Participantes del partido pueden leer la reserva vinculada (costo / reparto).
DROP POLICY IF EXISTS venue_reservations_select_match_participant ON public.venue_reservations;
CREATE POLICY venue_reservations_select_match_participant
  ON public.venue_reservations FOR SELECT TO authenticated
  USING (
    match_opportunity_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = venue_reservations.match_opportunity_id
        AND p.user_id = auth.uid()
        AND p.status IN ('pending', 'confirmed')
    )
  );

CREATE OR REPLACE FUNCTION public.book_venue_slot(
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_court_id uuid;
  v_res_id uuid;
  v_price integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sports_venues v WHERE v.id = p_venue_id) THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  SELECT c.id, c.price_per_hour INTO v_court_id, v_price
  FROM public.venue_courts c
  WHERE c.venue_id = p_venue_id
    AND NOT EXISTS (
      SELECT 1 FROM public.venue_reservations r
      WHERE r.court_id = c.id
        AND r.status IN ('pending', 'confirmed')
        AND r.starts_at < p_ends_at
        AND r.ends_at > p_starts_at
    )
  ORDER BY c.sort_order, c.name, c.id
  LIMIT 1;

  IF v_court_id IS NULL THEN
    RAISE EXCEPTION 'no_court_available';
  END IF;

  INSERT INTO public.venue_reservations (
    court_id,
    starts_at,
    ends_at,
    booker_user_id,
    status,
    payment_status,
    price_per_hour,
    currency
  )
  VALUES (
    v_court_id,
    p_starts_at,
    p_ends_at,
    auth.uid(),
    'pending',
    'unpaid',
    v_price,
    'CLP'
  )
  RETURNING id INTO v_res_id;

  RETURN v_res_id;
END;
$$;


-- ==============================================================================
-- [026/086] 20260330140000_team_city_immutable_and_rival_counts.sql
-- ==============================================================================

-- Ciudad de equipo inmutable tras la creación; conteo público de partidos rival completados.

CREATE OR REPLACE FUNCTION public.prevent_team_city_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.city IS DISTINCT FROM NEW.city OR OLD.city_id IS DISTINCT FROM NEW.city_id THEN
      RAISE EXCEPTION 'La ciudad del equipo no se puede modificar';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teams_city_immutable ON public.teams;
CREATE TRIGGER teams_city_immutable
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_team_city_change();

-- Conteos para carrusel "Descubre equipos" (lectura agregada, sin filtrar por usuario).
CREATE OR REPLACE FUNCTION public.team_completed_rival_counts(p_team_ids uuid[])
RETURNS TABLE (team_id uuid, match_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.uid AS team_id,
    COALESCE(
      (
        SELECT COUNT(*)::int
        FROM public.rival_challenges rc
        INNER JOIN public.match_opportunities mo ON mo.id = rc.opportunity_id
        WHERE rc.status = 'accepted'
          AND mo.type = 'rival'
          AND mo.status = 'completed'
          AND (
            rc.challenger_team_id = u.uid
            OR rc.challenged_team_id = u.uid
            OR rc.accepted_team_id = u.uid
          )
      ),
      0
    ) AS match_count
  FROM unnest(p_team_ids) AS u(uid);
$$;

GRANT EXECUTE ON FUNCTION public.team_completed_rival_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_completed_rival_counts(uuid[]) TO anon;


-- ==============================================================================
-- [027/086] 20260330180000_team_roster_max_18.sql
-- ==============================================================================

-- Máximo 18 jugadores por equipo (plantilla; capitán incluido).

CREATE OR REPLACE FUNCTION public.enforce_team_roster_max_18()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.team_members
  WHERE team_id = NEW.team_id;

  IF v_count >= 18 THEN
    RAISE EXCEPTION 'team_roster_full'
      USING ERRCODE = 'check_violation',
      DETAIL = 'La plantilla del equipo ya tiene el máximo de jugadores (18).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_roster_max_18 ON public.team_members;
CREATE TRIGGER trg_team_roster_max_18
  BEFORE INSERT ON public.team_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_team_roster_max_18();

REVOKE ALL ON FUNCTION public.enforce_team_roster_max_18() FROM PUBLIC;


-- ==============================================================================
-- [028/086] 20260331120000_profiles_player_essentials.sql
-- ==============================================================================

-- Marca cuándo el jugador confirmó datos esenciales (WhatsApp + género) en la app.
-- OAuth (Google) no envía estos datos: quedan NULL hasta completar onboarding.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS player_essentials_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.player_essentials_completed_at IS
  'Fecha en que el jugador confirmó WhatsApp y género (registro email o onboarding).';

-- Usuarios existentes con WhatsApp guardado: considerarlos ya confirmados.
UPDATE public.profiles
SET player_essentials_completed_at = COALESCE(updated_at, created_at)
WHERE (account_type IS NULL OR account_type = 'player')
  AND btrim(coalesce(whatsapp_phone, '')) <> ''
  AND player_essentials_completed_at IS NULL;


-- ==============================================================================
-- [029/086] 20260331190000_match_outcomes_stats_votes.sql
-- ==============================================================================

-- Resultados revuelta, votos de capitanes (rival), estadísticas en perfiles y trigger de aplicación.

CREATE TYPE public.revuelta_result AS ENUM ('team_a', 'team_b', 'draw');

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS revuelta_result public.revuelta_result,
  ADD COLUMN IF NOT EXISTS rival_captain_vote_challenger public.rival_result,
  ADD COLUMN IF NOT EXISTS rival_captain_vote_accepted public.rival_result,
  ADD COLUMN IF NOT EXISTS rival_outcome_disputed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_stats_applied_at TIMESTAMPTZ;

COMMENT ON COLUMN public.match_opportunities.revuelta_result IS 'Revuelta (open): ganador equipo A, B o empate.';
COMMENT ON COLUMN public.match_opportunities.rival_captain_vote_challenger IS 'Voto capitán equipo retador (creator_team/rival_team/draw).';
COMMENT ON COLUMN public.match_opportunities.rival_captain_vote_accepted IS 'Voto capitán equipo aceptado.';
COMMENT ON COLUMN public.match_opportunities.rival_outcome_disputed IS 'Votos de capitanes distintos; pendiente desempate organizador.';
COMMENT ON COLUMN public.match_opportunities.match_stats_applied_at IS 'Evita doble conteo de stats al cerrar partido.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stats_player_wins INTEGER NOT NULL DEFAULT 0 CHECK (stats_player_wins >= 0),
  ADD COLUMN IF NOT EXISTS stats_player_draws INTEGER NOT NULL DEFAULT 0 CHECK (stats_player_draws >= 0),
  ADD COLUMN IF NOT EXISTS stats_player_losses INTEGER NOT NULL DEFAULT 0 CHECK (stats_player_losses >= 0),
  ADD COLUMN IF NOT EXISTS stats_organized_completed INTEGER NOT NULL DEFAULT 0 CHECK (stats_organized_completed >= 0),
  ADD COLUMN IF NOT EXISTS stats_organizer_wins INTEGER NOT NULL DEFAULT 0 CHECK (stats_organizer_wins >= 0);

-- ---------------------------------------------------------------------------
-- Aplicar estadísticas cuando el partido queda completed (una sola vez)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_match_stats_from_outcome(p_opp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
  uid uuid;
  ids_a uuid[];
  ids_b uuid[];
  win_a boolean;
  win_b boolean;
  is_draw boolean;
  tid_chall uuid;
  tid_acc uuid;
  org_won boolean;
BEGIN
  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opp_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF mo.status IS DISTINCT FROM 'completed'::public.match_status THEN
    RETURN;
  END IF;
  IF mo.match_stats_applied_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET stats_organized_completed = stats_organized_completed + 1
  WHERE id = mo.creator_id;

  -- type players: solo organizador cuenta como organizado (ya arriba); sin W/D/L por equipo
  IF mo.type = 'players'::public.match_type THEN
    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  org_won := false;

  IF mo.type = 'rival'::public.match_type AND mo.rival_result IS NOT NULL THEN
    SELECT * INTO rc
    FROM public.rival_challenges
    WHERE opportunity_id = p_opp_id AND status = 'accepted';

    IF FOUND THEN
      tid_chall := rc.challenger_team_id;
      tid_acc := rc.accepted_team_id;
      IF tid_acc IS NULL THEN
        UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
        RETURN;
      END IF;

      IF mo.rival_result = 'draw'::public.rival_result THEN
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id IN (tid_chall, tid_acc) AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
        END LOOP;
      ELSIF mo.rival_result = 'creator_team'::public.rival_result THEN
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_chall AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
        END LOOP;
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_acc AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
        END LOOP;
        IF mo.creator_id = rc.challenger_captain_id OR EXISTS (
          SELECT 1 FROM public.team_members x WHERE x.team_id = tid_chall AND x.user_id = mo.creator_id AND x.status = 'confirmed'
        ) THEN
          org_won := true;
        END IF;
      ELSE
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_acc AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
        END LOOP;
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_chall AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
        END LOOP;
        IF EXISTS (
          SELECT 1 FROM public.team_members x WHERE x.team_id = tid_acc AND x.user_id = mo.creator_id AND x.status = 'confirmed'
        ) THEN
          org_won := true;
        END IF;
      END IF;

      IF org_won THEN
        UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
      END IF;
    END IF;

    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  IF mo.type = 'open'::public.match_type AND mo.revuelta_result IS NOT NULL AND mo.revuelta_lineup IS NOT NULL THEN
    ids_a := ARRAY(
      SELECT (jsonb_array_elements_text(mo.revuelta_lineup->'teamA'->'userIds'))::uuid
    );
    ids_b := ARRAY(
      SELECT (jsonb_array_elements_text(mo.revuelta_lineup->'teamB'->'userIds'))::uuid
    );

    IF mo.revuelta_result = 'draw'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a || ids_b LOOP
        UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
      END LOOP;
    ELSIF mo.revuelta_result = 'team_a'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_a) THEN
        org_won := true;
      END IF;
    ELSE
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_b) THEN
        org_won := true;
      END IF;
    END IF;

    IF org_won THEN
      UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
    END IF;
  END IF;

  UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_match_completed_apply_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'::public.match_status AND (OLD.status IS DISTINCT FROM 'completed'::public.match_status) THEN
    PERFORM public.apply_match_stats_from_outcome(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_completed_apply_stats ON public.match_opportunities;
CREATE TRIGGER trg_match_completed_apply_stats
  AFTER UPDATE OF status ON public.match_opportunities
  FOR EACH ROW
  WHEN (NEW.status = 'completed'::public.match_status AND OLD.status IS DISTINCT FROM 'completed'::public.match_status)
  EXECUTE PROCEDURE public.trg_match_completed_apply_stats();

-- ---------------------------------------------------------------------------
-- Voto de capitanes (rival)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_rival_captain_vote(
  p_opportunity_id uuid,
  p_vote public.rival_result
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rc RECORD;
  mo RECORD;
  v_ch public.rival_result;
  v_ac public.rival_result;
  deadline timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RAISE EXCEPTION 'not_rival';
  END IF;
  IF mo.status = 'completed'::public.match_status THEN
    RAISE EXCEPTION 'already_completed';
  END IF;

  SELECT * INTO rc FROM public.rival_challenges WHERE opportunity_id = p_opportunity_id;
  IF NOT FOUND OR rc.status IS DISTINCT FROM 'accepted'::public.rival_challenge_status THEN
    RAISE EXCEPTION 'challenge_not_accepted';
  END IF;
  IF rc.accepted_captain_id IS NULL THEN
    RAISE EXCEPTION 'no_accepted_captain';
  END IF;

  deadline := mo.date_time + interval '72 hours';

  IF auth.uid() = rc.challenger_captain_id THEN
    UPDATE public.match_opportunities
    SET rival_captain_vote_challenger = p_vote, updated_at = now()
    WHERE id = p_opportunity_id;
  ELSIF auth.uid() = rc.accepted_captain_id THEN
    UPDATE public.match_opportunities
    SET rival_captain_vote_accepted = p_vote, updated_at = now()
    WHERE id = p_opportunity_id;
  ELSE
    RAISE EXCEPTION 'not_captain';
  END IF;

  SELECT rival_captain_vote_challenger, rival_captain_vote_accepted
  INTO v_ch, v_ac
  FROM public.match_opportunities WHERE id = p_opportunity_id;

  IF v_ch IS NOT NULL AND v_ac IS NOT NULL THEN
    IF v_ch = v_ac THEN
      UPDATE public.match_opportunities
      SET
        rival_result = v_ch,
        status = 'completed'::public.match_status,
        finalized_at = now(),
        rival_outcome_disputed = false,
        updated_at = now()
      WHERE id = p_opportunity_id;
    ELSE
      UPDATE public.match_opportunities
      SET rival_outcome_disputed = true, updated_at = now()
      WHERE id = p_opportunity_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_rival_organizer_override(
  p_opportunity_id uuid,
  p_result public.rival_result
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  deadline timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_organizer';
  END IF;
  IF mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RAISE EXCEPTION 'not_rival';
  END IF;
  IF mo.status = 'completed'::public.match_status THEN
    RAISE EXCEPTION 'already_completed';
  END IF;
  IF NOT mo.rival_outcome_disputed THEN
    RAISE EXCEPTION 'not_disputed';
  END IF;

  deadline := mo.date_time + interval '72 hours';
  IF now() < deadline THEN
    RAISE EXCEPTION 'deadline_not_reached';
  END IF;

  UPDATE public.match_opportunities
  SET
    rival_result = p_result,
    status = 'completed'::public.match_status,
    finalized_at = now(),
    rival_outcome_disputed = false,
    updated_at = now()
  WHERE id = p_opportunity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_revuelta_match(
  p_opportunity_id uuid,
  p_result public.revuelta_result
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_organizer';
  END IF;
  IF mo.type IS DISTINCT FROM 'open'::public.match_type THEN
    RAISE EXCEPTION 'not_open';
  END IF;
  IF mo.status = 'completed'::public.match_status THEN
    RAISE EXCEPTION 'already_completed';
  END IF;

  UPDATE public.match_opportunities
  SET
    revuelta_result = p_result,
    rival_result = NULL,
    casual_completed = NULL,
    status = 'completed'::public.match_status,
    finalized_at = now(),
    updated_at = now()
  WHERE id = p_opportunity_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_rival_captain_vote(uuid, public.rival_result) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_rival_organizer_override(uuid, public.rival_result) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_revuelta_match(uuid, public.revuelta_result) TO authenticated;


-- ==============================================================================
-- [030/086] 20260401120000_team_stats_wdl.sql
-- ==============================================================================

-- Estadísticas de equipo (V/E/D) en partidos tipo rival cerrados.

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS stats_wins INTEGER NOT NULL DEFAULT 0 CHECK (stats_wins >= 0),
  ADD COLUMN IF NOT EXISTS stats_draws INTEGER NOT NULL DEFAULT 0 CHECK (stats_draws >= 0),
  ADD COLUMN IF NOT EXISTS stats_losses INTEGER NOT NULL DEFAULT 0 CHECK (stats_losses >= 0);

COMMENT ON COLUMN public.teams.stats_wins IS 'Victorias en partidos rival finalizados.';
COMMENT ON COLUMN public.teams.stats_draws IS 'Empates en partidos rival finalizados.';
COMMENT ON COLUMN public.teams.stats_losses IS 'Derrotas en partidos rival finalizados.';

CREATE OR REPLACE FUNCTION public.apply_match_stats_from_outcome(p_opp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
  uid uuid;
  ids_a uuid[];
  ids_b uuid[];
  win_a boolean;
  win_b boolean;
  is_draw boolean;
  tid_chall uuid;
  tid_acc uuid;
  org_won boolean;
BEGIN
  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opp_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF mo.status IS DISTINCT FROM 'completed'::public.match_status THEN
    RETURN;
  END IF;
  IF mo.match_stats_applied_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET stats_organized_completed = stats_organized_completed + 1
  WHERE id = mo.creator_id;

  IF mo.type = 'players'::public.match_type THEN
    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  org_won := false;

  IF mo.type = 'rival'::public.match_type AND mo.rival_result IS NOT NULL THEN
    SELECT * INTO rc
    FROM public.rival_challenges
    WHERE opportunity_id = p_opp_id AND status = 'accepted';

    IF FOUND THEN
      tid_chall := rc.challenger_team_id;
      tid_acc := rc.accepted_team_id;
      IF tid_acc IS NULL THEN
        UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
        RETURN;
      END IF;

      IF mo.rival_result = 'draw'::public.rival_result THEN
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id IN (tid_chall, tid_acc) AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams SET stats_draws = stats_draws + 1 WHERE id = tid_chall;
        UPDATE public.teams SET stats_draws = stats_draws + 1 WHERE id = tid_acc;
      ELSIF mo.rival_result = 'creator_team'::public.rival_result THEN
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_chall AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
        END LOOP;
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_acc AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams SET stats_wins = stats_wins + 1 WHERE id = tid_chall;
        UPDATE public.teams SET stats_losses = stats_losses + 1 WHERE id = tid_acc;
        IF mo.creator_id = rc.challenger_captain_id OR EXISTS (
          SELECT 1 FROM public.team_members x WHERE x.team_id = tid_chall AND x.user_id = mo.creator_id AND x.status = 'confirmed'
        ) THEN
          org_won := true;
        END IF;
      ELSE
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_acc AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
        END LOOP;
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_chall AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams SET stats_wins = stats_wins + 1 WHERE id = tid_acc;
        UPDATE public.teams SET stats_losses = stats_losses + 1 WHERE id = tid_chall;
        IF EXISTS (
          SELECT 1 FROM public.team_members x WHERE x.team_id = tid_acc AND x.user_id = mo.creator_id AND x.status = 'confirmed'
        ) THEN
          org_won := true;
        END IF;
      END IF;

      IF org_won THEN
        UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
      END IF;
    END IF;

    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  IF mo.type = 'open'::public.match_type AND mo.revuelta_result IS NOT NULL AND mo.revuelta_lineup IS NOT NULL THEN
    ids_a := ARRAY(
      SELECT (jsonb_array_elements_text(mo.revuelta_lineup->'teamA'->'userIds'))::uuid
    );
    ids_b := ARRAY(
      SELECT (jsonb_array_elements_text(mo.revuelta_lineup->'teamB'->'userIds'))::uuid
    );

    IF mo.revuelta_result = 'draw'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a || ids_b LOOP
        UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
      END LOOP;
    ELSIF mo.revuelta_result = 'team_a'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_a) THEN
        org_won := true;
      END IF;
    ELSE
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_b) THEN
        org_won := true;
      END IF;
    END IF;

    IF org_won THEN
      UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
    END IF;
  END IF;

  UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
END;
$$;


-- ==============================================================================
-- [031/086] 20260401140000_team_rival_streaks.sql
-- ==============================================================================

-- Rachas de victoria/derrota en partidos rival (equipos).

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS stats_win_streak INTEGER NOT NULL DEFAULT 0 CHECK (stats_win_streak >= 0),
  ADD COLUMN IF NOT EXISTS stats_loss_streak INTEGER NOT NULL DEFAULT 0 CHECK (stats_loss_streak >= 0);

COMMENT ON COLUMN public.teams.stats_win_streak IS 'Victorias consecutivas en partidos rival (se resetea en empate o derrota).';
COMMENT ON COLUMN public.teams.stats_loss_streak IS 'Derrotas consecutivas en partidos rival (se resetea en empate o victoria).';

CREATE OR REPLACE FUNCTION public.apply_match_stats_from_outcome(p_opp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
  uid uuid;
  ids_a uuid[];
  ids_b uuid[];
  tid_chall uuid;
  tid_acc uuid;
  org_won boolean;
BEGIN
  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opp_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF mo.status IS DISTINCT FROM 'completed'::public.match_status THEN
    RETURN;
  END IF;
  IF mo.match_stats_applied_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET stats_organized_completed = stats_organized_completed + 1
  WHERE id = mo.creator_id;

  IF mo.type = 'players'::public.match_type THEN
    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  org_won := false;

  IF mo.type = 'rival'::public.match_type AND mo.rival_result IS NOT NULL THEN
    SELECT * INTO rc
    FROM public.rival_challenges
    WHERE opportunity_id = p_opp_id AND status = 'accepted';

    IF FOUND THEN
      tid_chall := rc.challenger_team_id;
      tid_acc := rc.accepted_team_id;
      IF tid_acc IS NULL THEN
        UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
        RETURN;
      END IF;

      IF mo.rival_result = 'draw'::public.rival_result THEN
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id IN (tid_chall, tid_acc) AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams
        SET stats_draws = stats_draws + 1, stats_win_streak = 0, stats_loss_streak = 0
        WHERE id = tid_chall;
        UPDATE public.teams
        SET stats_draws = stats_draws + 1, stats_win_streak = 0, stats_loss_streak = 0
        WHERE id = tid_acc;
      ELSIF mo.rival_result = 'creator_team'::public.rival_result THEN
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_chall AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
        END LOOP;
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_acc AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams
        SET stats_wins = stats_wins + 1, stats_win_streak = stats_win_streak + 1, stats_loss_streak = 0
        WHERE id = tid_chall;
        UPDATE public.teams
        SET stats_losses = stats_losses + 1, stats_loss_streak = stats_loss_streak + 1, stats_win_streak = 0
        WHERE id = tid_acc;
        IF mo.creator_id = rc.challenger_captain_id OR EXISTS (
          SELECT 1 FROM public.team_members x WHERE x.team_id = tid_chall AND x.user_id = mo.creator_id AND x.status = 'confirmed'
        ) THEN
          org_won := true;
        END IF;
      ELSE
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_acc AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
        END LOOP;
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_chall AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams
        SET stats_wins = stats_wins + 1, stats_win_streak = stats_win_streak + 1, stats_loss_streak = 0
        WHERE id = tid_acc;
        UPDATE public.teams
        SET stats_losses = stats_losses + 1, stats_loss_streak = stats_loss_streak + 1, stats_win_streak = 0
        WHERE id = tid_chall;
        IF EXISTS (
          SELECT 1 FROM public.team_members x WHERE x.team_id = tid_acc AND x.user_id = mo.creator_id AND x.status = 'confirmed'
        ) THEN
          org_won := true;
        END IF;
      END IF;

      IF org_won THEN
        UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
      END IF;
    END IF;

    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  IF mo.type = 'open'::public.match_type AND mo.revuelta_result IS NOT NULL AND mo.revuelta_lineup IS NOT NULL THEN
    ids_a := ARRAY(
      SELECT (jsonb_array_elements_text(mo.revuelta_lineup->'teamA'->'userIds'))::uuid
    );
    ids_b := ARRAY(
      SELECT (jsonb_array_elements_text(mo.revuelta_lineup->'teamB'->'userIds'))::uuid
    );

    IF mo.revuelta_result = 'draw'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a || ids_b LOOP
        UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
      END LOOP;
    ELSIF mo.revuelta_result = 'team_a'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_a) THEN
        org_won := true;
      END IF;
    ELSE
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_b) THEN
        org_won := true;
      END IF;
    END IF;

    IF org_won THEN
      UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
    END IF;
  END IF;

  UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
END;
$$;


-- ==============================================================================
-- [032/086] 20260401170000_public_player_profiles_reports_sanctions.sql
-- ==============================================================================

-- Perfil público de jugador (sin WhatsApp), reportes y sanciones (tarjetas).

-- ---------------------------------------------------------------------------
-- Perfiles: columnas de moderación/sanciones
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mod_yellow_cards INTEGER NOT NULL DEFAULT 0 CHECK (mod_yellow_cards >= 0),
  ADD COLUMN IF NOT EXISTS mod_red_cards INTEGER NOT NULL DEFAULT 0 CHECK (mod_red_cards >= 0),
  ADD COLUMN IF NOT EXISTS mod_suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mod_banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mod_ban_reason TEXT;

COMMENT ON COLUMN public.profiles.mod_yellow_cards IS 'Tarjetas amarillas acumuladas (moderación).';
COMMENT ON COLUMN public.profiles.mod_red_cards IS 'Tarjetas rojas acumuladas (moderación).';
COMMENT ON COLUMN public.profiles.mod_suspended_until IS 'Si > now(), el usuario queda en modo solo lectura.';
COMMENT ON COLUMN public.profiles.mod_banned_at IS 'Baneo permanente (si no NULL).';
COMMENT ON COLUMN public.profiles.mod_ban_reason IS 'Motivo del baneo.';

-- ---------------------------------------------------------------------------
-- RPC: Perfil público de jugador (campos permitidos; nunca WhatsApp/email)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fetch_public_player_profile(p_user_id uuid)
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

-- ---------------------------------------------------------------------------
-- Reportes de jugador (moderación)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'player_report_status') THEN
    CREATE TYPE public.player_report_status AS ENUM ('pending', 'reviewed', 'dismissed', 'action_taken');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.player_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  context_type TEXT NOT NULL, -- match/chat/team/message/etc (solo referencia)
  context_id UUID, -- id del recurso si aplica
  reason TEXT NOT NULL,
  details TEXT,
  status public.player_report_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_reports_reported ON public.player_reports (reported_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_reports_status ON public.player_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_reports_reporter ON public.player_reports (reporter_id, created_at DESC);

ALTER TABLE public.player_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_reports_insert_authenticated ON public.player_reports;
CREATE POLICY player_reports_insert_authenticated
  ON public.player_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS player_reports_select_admin ON public.player_reports;
CREATE POLICY player_reports_select_admin
  ON public.player_reports
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS player_reports_update_admin ON public.player_reports;
CREATE POLICY player_reports_update_admin
  ON public.player_reports
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- RPC admin: aplicar tarjeta/sanción (amarilla/roja) y suspender/baneo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_apply_card(
  p_user_id uuid,
  p_card text, -- 'yellow' | 'red'
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prof RECORD;
  next_suspend timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT id, mod_yellow_cards, mod_red_cards, mod_suspended_until, mod_banned_at
    INTO prof
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF prof.mod_banned_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF lower(p_card) = 'yellow' THEN
    UPDATE public.profiles
    SET mod_yellow_cards = mod_yellow_cards + 1
    WHERE id = p_user_id;

    SELECT mod_yellow_cards INTO prof.mod_yellow_cards FROM public.profiles WHERE id = p_user_id;
    IF prof.mod_yellow_cards >= 3 THEN
      next_suspend := now() + interval '3 days';
      UPDATE public.profiles
      SET mod_yellow_cards = 0,
          mod_red_cards = mod_red_cards + 1,
          mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend)
      WHERE id = p_user_id;
    END IF;
    RETURN;
  ELSIF lower(p_card) = 'red' THEN
    next_suspend := now() + interval '3 days';
    UPDATE public.profiles
    SET mod_red_cards = mod_red_cards + 1,
        mod_yellow_cards = 0,
        mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend)
    WHERE id = p_user_id;
    RETURN;
  ELSE
    RAISE EXCEPTION 'invalid_card';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_card(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apply_card(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_ban_user(
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  UPDATE public.profiles
  SET mod_banned_at = COALESCE(mod_banned_at, now()),
      mod_ban_reason = COALESCE(NULLIF(p_reason, ''), mod_ban_reason)
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ban_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, text) TO authenticated;



-- ==============================================================================
-- [033/086] 20260401183000_sync_team_member_position_from_profile.sql
-- ==============================================================================

-- Sincroniza la posición mostrada en plantilla de equipos con el perfil del jugador.

-- Backfill inicial para corregir datos desfasados ya existentes.
UPDATE public.team_members tm
SET position = p.position
FROM public.profiles p
WHERE p.id = tm.user_id
  AND tm.position IS DISTINCT FROM p.position;

CREATE OR REPLACE FUNCTION public.sync_team_member_position_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.position IS DISTINCT FROM OLD.position THEN
    UPDATE public.team_members
    SET position = NEW.position
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_team_member_position_from_profile ON public.profiles;
CREATE TRIGGER trg_sync_team_member_position_from_profile
  AFTER UPDATE OF position ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_team_member_position_from_profile();



-- ==============================================================================
-- [034/086] 20260403120000_profiles_birth_date.sql
-- ==============================================================================

-- Fecha de nacimiento: edad derivada automáticamente cada año vía trigger.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date DATE;

COMMENT ON COLUMN public.profiles.birth_date IS 'Fecha de nacimiento; age se mantiene sincronizado.';

CREATE OR REPLACE FUNCTION public.profiles_sync_age_from_birth_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.birth_date IS NOT NULL THEN
    NEW.age := GREATEST(
      0,
      LEAST(
        120,
        (EXTRACT(YEAR FROM age(CURRENT_DATE::timestamp, NEW.birth_date::timestamp)))::integer
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_age_from_birth_date ON public.profiles;
CREATE TRIGGER trg_profiles_sync_age_from_birth_date
  BEFORE INSERT OR UPDATE OF birth_date ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_sync_age_from_birth_date();

-- Aproximación para perfiles existentes (solo si aún no hay fecha).
UPDATE public.profiles
SET birth_date = (CURRENT_DATE - ((age::text || ' years')::interval))::date
WHERE birth_date IS NULL
  AND age IS NOT NULL
  AND age > 0
  AND age <= 120;


-- ==============================================================================
-- [035/086] 20260404120000_private_revuelta_team.sql
-- ==============================================================================

-- Revuelta privada por equipo: solo miembros se unen directo; externos solicitan y el capitán acepta.

CREATE OR REPLACE FUNCTION public.is_confirmed_team_member(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = p_user_id
      AND tm.status = 'confirmed'
  )
  OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = p_team_id AND t.captain_id = p_user_id
  );
$$;

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS private_revuelta_team_id UUID REFERENCES public.teams (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_match_opportunities_private_team
  ON public.match_opportunities (private_revuelta_team_id)
  WHERE private_revuelta_team_id IS NOT NULL;

ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_private_revuelta_open_only
  CHECK (
    private_revuelta_team_id IS NULL
    OR type = 'open'
  );

CREATE OR REPLACE FUNCTION public.enforce_private_revuelta_creator_is_team_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.private_revuelta_team_id IS NOT NULL THEN
    IF NEW.type IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'private_revuelta_team_id solo aplica a type open';
    END IF;
    IF NOT public.is_confirmed_team_member(NEW.private_revuelta_team_id, NEW.creator_id) THEN
      RAISE EXCEPTION 'El organizador debe ser miembro confirmado del equipo de la revuelta privada';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_opportunities_private_revuelta_member ON public.match_opportunities;
CREATE TRIGGER trg_match_opportunities_private_revuelta_member
  BEFORE INSERT OR UPDATE OF private_revuelta_team_id, creator_id, type
  ON public.match_opportunities
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_private_revuelta_creator_is_team_member();

-- Participantes: bloquear auto-inserción si es revuelta privada y el usuario no es del equipo
DROP POLICY IF EXISTS mop_insert_self ON public.match_opportunity_participants;

CREATE POLICY mop_insert_self
  ON public.match_opportunity_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND (
          mo.private_revuelta_team_id IS NULL
          OR public.is_confirmed_team_member(mo.private_revuelta_team_id, auth.uid())
        )
    )
  );

CREATE TABLE public.revuelta_external_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  is_goalkeeper BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_revuelta_ext_req_one_pending
  ON public.revuelta_external_join_requests (opportunity_id, requester_id)
  WHERE status = 'pending';

CREATE INDEX idx_revuelta_ext_req_opp ON public.revuelta_external_join_requests (opportunity_id, status);
CREATE INDEX idx_revuelta_ext_req_requester ON public.revuelta_external_join_requests (requester_id);

ALTER TABLE public.revuelta_external_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY revuelta_ext_req_select_self
  ON public.revuelta_external_join_requests
  FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY revuelta_ext_req_select_captain
  ON public.revuelta_external_join_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      INNER JOIN public.teams t ON t.id = mo.private_revuelta_team_id
      WHERE mo.id = opportunity_id
        AND t.captain_id = auth.uid()
    )
  );

CREATE POLICY revuelta_ext_req_insert_non_member
  ON public.revuelta_external_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND mo.private_revuelta_team_id IS NOT NULL
        AND mo.type = 'open'
        AND mo.status IN ('pending', 'confirmed')
        AND NOT public.is_confirmed_team_member(mo.private_revuelta_team_id, auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.revuelta_external_join_requests r0
      WHERE r0.opportunity_id = revuelta_external_join_requests.opportunity_id
        AND r0.requester_id = auth.uid()
        AND r0.status IN ('pending', 'accepted')
    )
  );

GRANT SELECT, INSERT ON public.revuelta_external_join_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_revuelta_external_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  mo RECORD;
  gk_count INT;
  field_count INT;
  joined_db INT;
  cap INT;
  gk_left INT;
  field_cap INT;
  field_left INT;
  insert_as_gk BOOLEAN;
BEGIN
  SELECT * INTO r FROM public.revuelta_external_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF r.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = r.opportunity_id FOR UPDATE;
  IF mo.private_revuelta_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_private');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = mo.private_revuelta_team_id AND t.captain_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = r.opportunity_id
      AND p.user_id = r.requester_id
      AND p.status IN ('pending', 'confirmed')
  ) THEN
    UPDATE public.revuelta_external_join_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed'))::INT,
    COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed') AND is_goalkeeper = true)::INT,
    COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed') AND COALESCE(is_goalkeeper, false) = false)::INT
  INTO joined_db, gk_count, field_count
  FROM public.match_opportunity_participants
  WHERE opportunity_id = r.opportunity_id;

  cap := COALESCE(mo.players_needed, 0);
  IF cap > 0 AND joined_db >= cap THEN
    RETURN jsonb_build_object('ok', false, 'error', 'full');
  END IF;

  gk_left := GREATEST(0, 2 - gk_count);
  field_cap := GREATEST(0, cap - 2);
  field_left := GREATEST(0, field_cap - field_count);
  insert_as_gk := r.is_goalkeeper;

  IF insert_as_gk THEN
    IF gk_left <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_gk_slot');
    END IF;
  ELSE
    IF field_left <= 0 AND gk_left > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gk_only');
    END IF;
    IF field_left <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'full');
    END IF;
  END IF;

  INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
  VALUES (r.opportunity_id, r.requester_id, 'confirmed', insert_as_gk);

  UPDATE public.revuelta_external_join_requests
  SET status = 'accepted', responded_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_revuelta_external_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  mo RECORD;
BEGIN
  SELECT * INTO r FROM public.revuelta_external_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF r.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = r.opportunity_id;
  IF mo.private_revuelta_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_private');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = mo.private_revuelta_team_id AND t.captain_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.revuelta_external_join_requests
  SET status = 'declined', responded_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_revuelta_external_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_revuelta_external_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_revuelta_external_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_revuelta_external_request(UUID) TO authenticated;

-- Organizador no puede inscribir a externos en revuelta privada (solo miembros del equipo).
DROP POLICY IF EXISTS mop_insert_as_creator ON public.match_opportunity_participants;

CREATE POLICY mop_insert_as_creator
  ON public.match_opportunity_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_match_opportunity_creator(opportunity_id)
    AND EXISTS (
      SELECT 1 FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND (
          mo.private_revuelta_team_id IS NULL
          OR public.is_confirmed_team_member(mo.private_revuelta_team_id, user_id)
        )
    )
  );


-- ==============================================================================
-- [036/086] 20260405120000_revuelta_ext_requests_organizer.sql
-- ==============================================================================

-- Revuelta privada: ver y responder solicitudes externas lo hace el organizador del partido (creator_id), no el capitán del equipo.

DROP POLICY IF EXISTS revuelta_ext_req_select_captain ON public.revuelta_external_join_requests;

CREATE POLICY revuelta_ext_req_select_organizer
  ON public.revuelta_external_join_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND mo.private_revuelta_team_id IS NOT NULL
        AND mo.creator_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.accept_revuelta_external_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  mo RECORD;
  gk_count INT;
  field_count INT;
  joined_db INT;
  cap INT;
  gk_left INT;
  field_cap INT;
  field_left INT;
  insert_as_gk BOOLEAN;
BEGIN
  SELECT * INTO r FROM public.revuelta_external_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF r.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = r.opportunity_id FOR UPDATE;
  IF mo.private_revuelta_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_private');
  END IF;
  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = r.opportunity_id
      AND p.user_id = r.requester_id
      AND p.status IN ('pending', 'confirmed')
  ) THEN
    UPDATE public.revuelta_external_join_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed'))::INT,
    COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed') AND is_goalkeeper = true)::INT,
    COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed') AND COALESCE(is_goalkeeper, false) = false)::INT
  INTO joined_db, gk_count, field_count
  FROM public.match_opportunity_participants
  WHERE opportunity_id = r.opportunity_id;

  cap := COALESCE(mo.players_needed, 0);
  IF cap > 0 AND joined_db >= cap THEN
    RETURN jsonb_build_object('ok', false, 'error', 'full');
  END IF;

  gk_left := GREATEST(0, 2 - gk_count);
  field_cap := GREATEST(0, cap - 2);
  field_left := GREATEST(0, field_cap - field_count);
  insert_as_gk := r.is_goalkeeper;

  IF insert_as_gk THEN
    IF gk_left <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'no_gk_slot');
    END IF;
  ELSE
    IF field_left <= 0 AND gk_left > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gk_only');
    END IF;
    IF field_left <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'full');
    END IF;
  END IF;

  INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
  VALUES (r.opportunity_id, r.requester_id, 'confirmed', insert_as_gk);

  UPDATE public.revuelta_external_join_requests
  SET status = 'accepted', responded_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_revuelta_external_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  mo RECORD;
BEGIN
  SELECT * INTO r FROM public.revuelta_external_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF r.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = r.opportunity_id;
  IF mo.private_revuelta_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_private');
  END IF;
  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.revuelta_external_join_requests
  SET status = 'declined', responded_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ==============================================================================
-- [037/086] 20260406120000_vice_captain_and_team_limit_3.sql
-- ==============================================================================

-- Vicecapitán (un solo designado por equipo): mismos permisos de gestión que el capitán
-- excepto datos sensibles (solo capitán principal: private settings, logo en Storage ya filtrado por captain_id).
-- Límite de equipos por usuario: 3 (antes 5).

-- ---------------------------------------------------------------------------
-- teams.vice_captain_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS vice_captain_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teams_vice_captain
  ON public.teams (vice_captain_id)
  WHERE vice_captain_id IS NOT NULL;

COMMENT ON COLUMN public.teams.vice_captain_id IS 'Segundo capitán: gestión de plantilla, desafíos y solicitudes. Solo el capitán principal edita datos sensibles y private settings.';

CREATE OR REPLACE FUNCTION public.enforce_teams_vice_captain_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vice_captain_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.vice_captain_id = NEW.captain_id THEN
    RAISE EXCEPTION 'vice_captain_must_differ_from_captain' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = NEW.id
      AND tm.user_id = NEW.vice_captain_id
      AND tm.status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'vice_captain_must_be_confirmed_member' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teams_vice_captain_member ON public.teams;
CREATE TRIGGER trg_teams_vice_captain_member
  BEFORE INSERT OR UPDATE OF vice_captain_id, captain_id
  ON public.teams
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_teams_vice_captain_member();

REVOKE ALL ON FUNCTION public.enforce_teams_vice_captain_member() FROM PUBLIC;

-- Al borrar un miembro que era vice, limpiar la columna
CREATE OR REPLACE FUNCTION public.trg_team_members_clear_vice_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.teams
  SET vice_captain_id = NULL, updated_at = now()
  WHERE id = OLD.team_id
    AND vice_captain_id IS NOT NULL
    AND vice_captain_id = OLD.user_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_members_clear_vice ON public.team_members;
CREATE TRIGGER trg_team_members_clear_vice
  AFTER DELETE ON public.team_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_team_members_clear_vice_on_delete();

REVOKE ALL ON FUNCTION public.trg_team_members_clear_vice_on_delete() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Funciones de rol
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_team_primary_captain(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = p_team_id
      AND t.captain_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_staff_captain(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = p_team_id
      AND (
        t.captain_id = auth.uid()
        OR (t.vice_captain_id IS NOT NULL AND t.vice_captain_id = auth.uid())
      )
  );
$$;

-- is_team_captain: compatibilidad — ahora = staff (capitán o vice) para plantilla / invitaciones / solicitudes
CREATE OR REPLACE FUNCTION public.is_team_captain(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_team_staff_captain(p_team_id);
$$;

REVOKE ALL ON FUNCTION public.is_team_primary_captain(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_team_staff_captain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_primary_captain(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_staff_captain(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- team_private_settings: solo capitán principal
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS team_private_settings_select_member_or_captain ON public.team_private_settings;
CREATE POLICY team_private_settings_select_member_or_captain
  ON public.team_private_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_private_settings.team_id
        AND tm.user_id = auth.uid()
        AND tm.status = 'confirmed'
    )
    OR public.is_team_primary_captain(team_id)
  );

DROP POLICY IF EXISTS team_private_settings_insert_captain ON public.team_private_settings;
CREATE POLICY team_private_settings_insert_captain
  ON public.team_private_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_primary_captain(team_id));

DROP POLICY IF EXISTS team_private_settings_update_captain ON public.team_private_settings;
CREATE POLICY team_private_settings_update_captain
  ON public.team_private_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_team_primary_captain(team_id))
  WITH CHECK (public.is_team_primary_captain(team_id));

DROP POLICY IF EXISTS team_private_settings_delete_captain ON public.team_private_settings;
CREATE POLICY team_private_settings_delete_captain
  ON public.team_private_settings
  FOR DELETE
  TO authenticated
  USING (public.is_team_primary_captain(team_id));

-- ---------------------------------------------------------------------------
-- team_members UPDATE: staff no edita la fila del capitán principal (solo el propio capitán)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS team_members_update_captain_or_self ON public.team_members;

CREATE POLICY team_members_update_captain_or_self
  ON public.team_members
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      public.is_team_staff_captain(team_id)
      AND user_id <>
        (SELECT t.captain_id FROM public.teams t WHERE t.id = team_members.team_id)
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (
      public.is_team_staff_captain(team_id)
      AND user_id <>
        (SELECT t.captain_id FROM public.teams t WHERE t.id = team_members.team_id)
    )
  );

-- ---------------------------------------------------------------------------
-- team_members DELETE: staff puede sacar miembros, no la fila del capitán principal
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS team_members_delete_captain_or_self ON public.team_members;

CREATE POLICY team_members_delete_captain_or_self
  ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    (
      auth.uid() = user_id
      AND user_id <> (SELECT t.captain_id FROM public.teams t WHERE t.id = team_members.team_id)
    )
    OR (
      public.is_team_staff_captain(team_id)
      AND user_id <> (SELECT t.captain_id FROM public.teams t WHERE t.id = team_members.team_id)
    )
  );

-- ---------------------------------------------------------------------------
-- rival_challenges: staff puede ver / aceptar / rechazar por equipo
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS rival_challenges_select_related ON public.rival_challenges;
CREATE POLICY rival_challenges_select_related
  ON public.rival_challenges
  FOR SELECT
  TO authenticated
  USING (
    challenger_captain_id = auth.uid()
    OR challenged_captain_id = auth.uid()
    OR (
      challenged_team_id IS NOT NULL
      AND public.is_team_staff_captain(challenged_team_id)
    )
    OR (
      mode = 'open'
      AND status = 'pending'
      AND EXISTS (
        SELECT 1
        FROM public.teams t
        WHERE (t.captain_id = auth.uid() OR t.vice_captain_id = auth.uid())
          AND t.id <> challenger_team_id
      )
    )
  );

DROP POLICY IF EXISTS rival_challenges_update_accept_decline ON public.rival_challenges;
CREATE POLICY rival_challenges_update_accept_decline
  ON public.rival_challenges
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND (
      challenged_captain_id = auth.uid()
      OR (
        challenged_team_id IS NOT NULL
        AND public.is_team_staff_captain(challenged_team_id)
      )
      OR (
        mode = 'open'
        AND EXISTS (
          SELECT 1
          FROM public.teams t
          WHERE (t.captain_id = auth.uid() OR t.vice_captain_id = auth.uid())
            AND t.id <> challenger_team_id
        )
      )
      OR challenger_captain_id = auth.uid()
    )
  )
  WITH CHECK (
    (
      status IN ('accepted', 'declined')
      AND (
        challenged_captain_id = auth.uid()
        OR (
          challenged_team_id IS NOT NULL
          AND public.is_team_staff_captain(challenged_team_id)
        )
        OR (
          mode = 'open'
          AND EXISTS (
            SELECT 1
            FROM public.teams t
            WHERE t.id = accepted_team_id
              AND (t.captain_id = auth.uid() OR t.vice_captain_id = auth.uid())
          )
        )
      )
    )
    OR (status = 'cancelled' AND challenger_captain_id = auth.uid())
  );

DROP POLICY IF EXISTS rival_challenges_insert_challenger ON public.rival_challenges;

CREATE POLICY rival_challenges_insert_staff_challenger
  ON public.rival_challenges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    challenger_captain_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.teams t
      WHERE t.id = challenger_team_id
        AND (t.captain_id = auth.uid() OR t.vice_captain_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Límite 3 equipos por usuario
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_team_members_limit_5()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.team_members tm
  WHERE tm.user_id = NEW.user_id;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'team_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_teams_limit_5_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NEW.captain_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.team_members tm
  WHERE tm.user_id = NEW.captain_id;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'team_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


-- ==============================================================================
-- [038/086] 20260407120000_finalize_rival_match_organizer.sql
-- ==============================================================================

-- Organizador: cerrar partido tipo rival con resultado (misma idea que finalize_revuelta_match).

CREATE OR REPLACE FUNCTION public.finalize_rival_match(
  p_opportunity_id uuid,
  p_result public.rival_result
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_organizer';
  END IF;
  IF mo.type IS DISTINCT FROM 'rival'::public.match_type THEN
    RAISE EXCEPTION 'not_rival';
  END IF;
  IF mo.status = 'completed'::public.match_status THEN
    RAISE EXCEPTION 'already_completed';
  END IF;
  IF mo.status = 'cancelled'::public.match_status THEN
    RAISE EXCEPTION 'already_cancelled';
  END IF;
  IF mo.rival_outcome_disputed IS TRUE THEN
    RAISE EXCEPTION 'disputed_use_override';
  END IF;

  SELECT * INTO rc FROM public.rival_challenges WHERE opportunity_id = p_opportunity_id;
  IF NOT FOUND OR rc.status IS DISTINCT FROM 'accepted'::public.rival_challenge_status THEN
    RAISE EXCEPTION 'challenge_not_accepted';
  END IF;

  UPDATE public.match_opportunities
  SET
    rival_result = p_result,
    status = 'completed'::public.match_status,
    finalized_at = now(),
    rival_outcome_disputed = false,
    updated_at = now()
  WHERE id = p_opportunity_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_rival_match(uuid, public.rival_result) TO authenticated;


-- ==============================================================================
-- [039/086] 20260408120000_realtime_profiles_and_sync_team_photo.sql
-- ==============================================================================

-- Realtime: cambios de foto/nombre en perfiles visibles en la app sin recargar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- Mantener team_members.photo_url alineado con el perfil (la UI prioriza profiles, pero otras consultas quedan coherentes).
CREATE OR REPLACE FUNCTION public.sync_team_member_photo_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
    UPDATE public.team_members
    SET photo_url = NEW.photo_url
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_team_member_photo_from_profile ON public.profiles;
CREATE TRIGGER trg_sync_team_member_photo_from_profile
  AFTER UPDATE OF photo_url ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_team_member_photo_from_profile();


-- ==============================================================================
-- [040/086] 20260408130000_venue_reservation_rpcs.sql
-- ==============================================================================

-- RPCs para mutaciones críticas de reservas (Fase 4):
-- - confirmar/cancelar por dueño del centro
-- - confirmar por el booker (autoconfirmación)

CREATE OR REPLACE FUNCTION public.confirm_venue_reservation_as_owner(
  p_reservation_id uuid,
  p_mark_paid boolean DEFAULT true,
  p_note text DEFAULT 'Confirmada por centro deportivo'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT c.venue_id INTO v_venue_id
  FROM public.venue_reservations r
  JOIN public.venue_courts c ON c.id = r.court_id
  WHERE r.id = p_reservation_id;

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'reservation_not_found';
  END IF;

  IF NOT public.is_venue_owner(v_venue_id) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.venue_reservations
  SET status = 'confirmed',
      payment_status = CASE WHEN p_mark_paid THEN 'paid'::public.venue_payment_status ELSE payment_status END,
      confirmation_source = 'venue_owner',
      confirmed_by_user_id = auth.uid(),
      confirmation_note = COALESCE(NULLIF(TRIM(p_note), ''), 'Confirmada por centro deportivo'),
      confirmed_at = COALESCE(confirmed_at, now())
  WHERE id = p_reservation_id;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_venue_reservation_as_owner(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_venue_reservation_as_owner(uuid, boolean, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.cancel_venue_reservation_as_owner(
  p_reservation_id uuid,
  p_reason text DEFAULT 'Cancelada por el centro deportivo'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_id uuid;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT c.venue_id INTO v_venue_id
  FROM public.venue_reservations r
  JOIN public.venue_courts c ON c.id = r.court_id
  WHERE r.id = p_reservation_id;

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'reservation_not_found';
  END IF;

  IF NOT public.is_venue_owner(v_venue_id) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'Cancelada por el centro deportivo');

  UPDATE public.venue_reservations
  SET status = 'cancelled',
      cancelled_reason = v_reason,
      cancelled_at = COALESCE(cancelled_at, now())
  WHERE id = p_reservation_id;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_venue_reservation_as_owner(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_venue_reservation_as_owner(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.confirm_venue_reservation_as_booker(
  p_reservation_id uuid,
  p_note text DEFAULT 'Confirmada por organizador en flujo guiado',
  p_mark_paid boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booker_id uuid;
  v_note text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT r.booker_user_id INTO v_booker_id
  FROM public.venue_reservations r
  WHERE r.id = p_reservation_id;

  IF v_booker_id IS NULL THEN
    -- Incluye caso reserva no existe o no tiene booker: ambos son no autorizados.
    RAISE EXCEPTION 'not_booker' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_booker_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_booker' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_note := COALESCE(NULLIF(TRIM(p_note), ''), 'Confirmada por organizador en flujo guiado');

  UPDATE public.venue_reservations
  SET status = 'confirmed',
      payment_status = CASE WHEN p_mark_paid THEN 'paid'::public.venue_payment_status ELSE payment_status END,
      confirmation_source = 'booker_self',
      confirmed_by_user_id = auth.uid(),
      confirmation_note = v_note,
      confirmed_at = COALESCE(confirmed_at, now())
  WHERE id = p_reservation_id
    AND booker_user_id = auth.uid();

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_venue_reservation_as_booker(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_venue_reservation_as_booker(uuid, text, boolean) TO authenticated;



-- ==============================================================================
-- [041/086] 20260408133000_join_match_opportunity_rpc.sql
-- ==============================================================================

-- Fase 4 (joins):
-- - Validación en BD de cupos para tipo players según match_opportunities.players_seek_profile
-- - RPC para unirse a un partido (evita lógica crítica en UI)

-- ---------------------------------------------------------------------------
-- Trigger: enforce_players_seek_profile_slots()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_players_seek_profile_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo_type public.match_type;
  cap int;
  seek text;
  gk_cnt int;
  field_cnt int;
  joined_cnt int;
  max_field int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT mo.type, mo.players_needed, mo.players_seek_profile
    INTO mo_type, cap, seek
  FROM public.match_opportunities mo
  WHERE mo.id = NEW.opportunity_id;

  IF mo_type IS DISTINCT FROM 'players' THEN
    RETURN NEW;
  END IF;

  cap := COALESCE(cap, 0);

  -- Conteo actual (excluye al usuario si está actualizando su fila)
  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed'))::int,
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed') AND is_goalkeeper = true)::int,
    COUNT(*) FILTER (WHERE status IN ('pending','confirmed') AND COALESCE(is_goalkeeper, false) = false)::int
  INTO joined_cnt, gk_cnt, field_cnt
  FROM public.match_opportunity_participants
  WHERE opportunity_id = NEW.opportunity_id
    AND user_id IS DISTINCT FROM NEW.user_id;

  IF cap > 0 AND joined_cnt >= cap THEN
    RAISE EXCEPTION 'No quedan cupos en este partido' USING ERRCODE = 'check_violation';
  END IF;

  seek := COALESCE(NULLIF(TRIM(seek), ''), 'legacy');

  -- legacy: por compatibilidad, no imponemos restricciones extra (solo capacidad).
  IF seek = 'legacy' THEN
    RETURN NEW;
  END IF;

  IF seek = 'gk_only' THEN
    IF COALESCE(NEW.is_goalkeeper, false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Esta búsqueda solo admite arqueros' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF seek = 'field_only' THEN
    IF COALESCE(NEW.is_goalkeeper, false) IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Solo buscan jugadores de campo' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- gk_and_field: máximo 1 arquero, resto campo (cap-1).
  IF seek = 'gk_and_field' THEN
    max_field := GREATEST(0, cap - 1);
    IF COALESCE(NEW.is_goalkeeper, false) = true THEN
      IF gk_cnt >= 1 THEN
        RAISE EXCEPTION 'Ya hay un arquero; en esta búsqueda solo cabe uno' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      IF cap > 0 AND field_cnt >= max_field THEN
        RAISE EXCEPTION 'No quedan cupos de jugador de campo' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_players_seek_profile_slots() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_mop_players_seek_profile_slots ON public.match_opportunity_participants;
CREATE TRIGGER trg_mop_players_seek_profile_slots
  BEFORE INSERT OR UPDATE ON public.match_opportunity_participants
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_players_seek_profile_slots();

-- ---------------------------------------------------------------------------
-- RPC: join_match_opportunity()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_match_opportunity(
  p_opportunity_id uuid,
  p_is_goalkeeper boolean DEFAULT false
)
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

  SELECT *
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.creator_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'is_creator');
  END IF;

  -- Partido ya pasado: bloquea desde el inicio del día (en tz del servidor).
  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  -- Revuelta privada: solo miembros confirmados pueden unirse directo.
  IF mo.type = 'open' AND mo.private_revuelta_team_id IS NOT NULL THEN
    IF NOT public.is_confirmed_team_member(mo.private_revuelta_team_id, auth.uid()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_requires_request');
    END IF;
  END IF;

  -- Si ya existe participante activo, devolver ok (idempotente).
  IF EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.user_id = auth.uid()
      AND p.status IN ('pending','confirmed')
  ) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
  VALUES (p_opportunity_id, auth.uid(), 'confirmed', COALESCE(p_is_goalkeeper, false));

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true);
  WHEN check_violation THEN
    -- Usamos SQLERRM como mensaje amigable ya definido en triggers existentes.
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.join_match_opportunity(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_match_opportunity(uuid, boolean) TO authenticated;



-- ==============================================================================
-- [042/086] 20260408140000_request_private_revuelta_rpc.sql
-- ==============================================================================

-- Fase 4 (joins): solicitud externa para revuelta privada (no-miembro)

CREATE OR REPLACE FUNCTION public.request_revuelta_external_join(
  p_opportunity_id uuid,
  p_is_goalkeeper boolean DEFAULT false
)
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

  SELECT *
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.type IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_open');
  END IF;

  IF mo.private_revuelta_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_private');
  END IF;

  IF mo.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_active');
  END IF;

  -- Partido ya pasado: bloquea desde inicio del día (en tz del servidor).
  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  IF public.is_confirmed_team_member(mo.private_revuelta_team_id, auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  END IF;

  IF public.revuelta_ext_req_has_blocking_row_for_me(p_opportunity_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate');
  END IF;

  INSERT INTO public.revuelta_external_join_requests (
    opportunity_id,
    requester_id,
    is_goalkeeper,
    status
  )
  VALUES (
    p_opportunity_id,
    auth.uid(),
    COALESCE(p_is_goalkeeper, false),
    'pending'
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.request_revuelta_external_join(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_revuelta_external_join(uuid, boolean) TO authenticated;



-- ==============================================================================
-- [043/086] 20260408143000_admin_reports_and_clear_sanctions_rpcs.sql
-- ==============================================================================

-- Fase 4 (moderación): mover acciones admin críticas a RPC
-- - actualizar estado/resolución de player_reports
-- - limpiar suspensión / ban de perfiles

CREATE OR REPLACE FUNCTION public.admin_update_player_report_status(
  p_report_id uuid,
  p_status text, -- 'reviewed' | 'dismissed' | 'action_taken'
  p_resolution text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.player_report_status;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF lower(p_status) = 'reviewed' THEN
    v_status := 'reviewed'::public.player_report_status;
  ELSIF lower(p_status) = 'dismissed' THEN
    v_status := 'dismissed'::public.player_report_status;
  ELSIF lower(p_status) = 'action_taken' THEN
    v_status := 'action_taken'::public.player_report_status;
  ELSE
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.player_reports
  SET status = v_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      resolution = p_resolution
  WHERE id = p_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_player_report_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_player_report_status(uuid, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_clear_suspension(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.profiles
  SET mod_suspended_until = NULL
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_suspension(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_clear_suspension(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_clear_ban(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.profiles
  SET mod_banned_at = NULL,
      mod_ban_reason = NULL
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_ban(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_clear_ban(uuid) TO authenticated;



-- ==============================================================================
-- [044/086] 20260408150000_create_match_with_reservation_rpc.sql
-- ==============================================================================

-- Fase 4 (robustez): crear partido + (opcional) reservar cancha en una sola transacción.
-- Objetivo: evitar reservas colgadas o partidos creados sin link cuando hay errores intermedios.

CREATE OR REPLACE FUNCTION public.create_match_opportunity_with_optional_reservation(
  p_type public.match_type,
  p_title text,
  p_description text,
  p_location text,
  p_venue text,
  p_city_id uuid,
  p_date_time timestamptz,
  p_level public.skill_level,
  p_team_name text,
  p_players_needed int,
  p_players_joined int,
  p_players_seek_profile text,
  p_gender public.gender,
  p_status public.match_status,
  p_sports_venue_id uuid,
  p_book_court_slot boolean,
  p_court_slot_minutes int,
  p_private_revuelta_team_id uuid,
  p_creator_is_goalkeeper boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id uuid;
  v_match_id uuid;
  v_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Revuelta privada: organizador debe ser miembro confirmado del equipo.
  IF p_private_revuelta_team_id IS NOT NULL THEN
    IF p_type IS DISTINCT FROM 'open' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_only_open');
    END IF;
    IF NOT public.is_confirmed_team_member(p_private_revuelta_team_id, auth.uid()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_not_member');
    END IF;
  END IF;

  -- Reserva opcional (solo si hay venue y no es rival).
  v_reservation_id := NULL;
  IF p_book_court_slot = true AND p_sports_venue_id IS NOT NULL AND p_type IS DISTINCT FROM 'rival' THEN
    v_end := p_date_time + (GREATEST(15, LEAST(180, COALESCE(p_court_slot_minutes, 60)))::text || ' minutes')::interval;
    BEGIN
      v_reservation_id := public.book_venue_slot(p_sports_venue_id, p_date_time, v_end);
    EXCEPTION
      WHEN OTHERS THEN
        -- Normalizamos error de “sin cancha” a código estable para UI.
        IF SQLERRM ILIKE '%no_court%' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'no_court');
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'reservation_failed', 'message', SQLERRM);
    END;
  END IF;

  INSERT INTO public.match_opportunities (
    type,
    title,
    description,
    location,
    venue,
    city_id,
    date_time,
    level,
    creator_id,
    team_name,
    players_needed,
    players_joined,
    players_seek_profile,
    gender,
    status,
    sports_venue_id,
    venue_reservation_id,
    private_revuelta_team_id
  )
  VALUES (
    p_type,
    p_title,
    p_description,
    p_location,
    p_venue,
    p_city_id,
    p_date_time,
    p_level,
    auth.uid(),
    p_team_name,
    p_players_needed,
    COALESCE(p_players_joined, 0),
    CASE
      WHEN p_type = 'players' THEN NULLIF(TRIM(p_players_seek_profile), '')
      ELSE NULL
    END,
    p_gender,
    p_status,
    p_sports_venue_id,
    v_reservation_id,
    p_private_revuelta_team_id
  )
  RETURNING id INTO v_match_id;

  IF v_reservation_id IS NOT NULL THEN
    UPDATE public.venue_reservations
    SET match_opportunity_id = v_match_id
    WHERE id = v_reservation_id;
  END IF;

  -- Revuelta abierta: el organizador entra como participante confirmado.
  IF p_type = 'open' THEN
    INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
    VALUES (v_match_id, auth.uid(), 'confirmed', COALESCE(p_creator_is_goalkeeper, false));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'matchId', v_match_id,
    'reservationId', v_reservation_id
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Cleanup best-effort (por si atrapamos una excepción tras crear algo).
    IF v_match_id IS NOT NULL THEN
      DELETE FROM public.match_opportunities WHERE id = v_match_id;
    END IF;
    IF v_reservation_id IS NOT NULL THEN
      DELETE FROM public.venue_reservations WHERE id = v_reservation_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_match_opportunity_with_optional_reservation(
  public.match_type,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  text,
  int,
  int,
  text,
  public.gender,
  public.match_status,
  uuid,
  boolean,
  int,
  uuid,
  boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_match_opportunity_with_optional_reservation(
  public.match_type,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  text,
  int,
  int,
  text,
  public.gender,
  public.match_status,
  uuid,
  boolean,
  int,
  uuid,
  boolean
) TO authenticated;



-- ==============================================================================
-- [045/086] 20260408153000_team_invites_and_join_requests_rpcs.sql
-- ==============================================================================

-- Fase 4 (robustez): aceptar invitaciones y solicitudes de equipo vía RPC (transaccional + idempotente).

CREATE OR REPLACE FUNCTION public.accept_team_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  prof RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO inv
  FROM public.team_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF inv.invitee_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF inv.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Si ya es miembro, marcamos la invitación como aceptada (idempotente).
  IF EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = inv.team_id
      AND tm.user_id = auth.uid()
  ) THEN
    UPDATE public.team_invites SET status = 'accepted' WHERE id = p_invite_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT position, photo_url INTO prof
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.team_members (team_id, user_id, position, photo_url, status)
  VALUES (inv.team_id, auth.uid(), prof.position, COALESCE(prof.photo_url, ''), 'confirmed');

  UPDATE public.team_invites
  SET status = 'accepted'
  WHERE id = p_invite_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    UPDATE public.team_invites SET status = 'accepted' WHERE id = p_invite_id;
    RETURN jsonb_build_object('ok', true);
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_team_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.respond_team_join_request(
  p_request_id uuid,
  p_accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
  prof RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO req
  FROM public.team_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT public.is_team_captain(req.team_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF req.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF COALESCE(p_accept, false) IS DISTINCT FROM true THEN
    UPDATE public.team_join_requests
    SET status = 'declined',
        updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Si ya es miembro, aceptamos la solicitud (idempotente).
  IF EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = req.team_id
      AND tm.user_id = req.requester_id
  ) THEN
    UPDATE public.team_join_requests
    SET status = 'accepted',
        updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT position, photo_url INTO prof
  FROM public.profiles
  WHERE id = req.requester_id;

  INSERT INTO public.team_members (team_id, user_id, position, photo_url, status)
  VALUES (req.team_id, req.requester_id, prof.position, COALESCE(prof.photo_url, ''), 'confirmed');

  UPDATE public.team_join_requests
  SET status = 'accepted',
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    UPDATE public.team_join_requests
    SET status = 'accepted',
        updated_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true);
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_team_join_request(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_team_join_request(uuid, boolean) TO authenticated;



-- ==============================================================================
-- [046/086] 20260408160000_create_team_with_captain_rpc.sql
-- ==============================================================================

-- Fase 4 (robustez): crear equipo + registrar capitán como miembro confirmado en una sola transacción.

CREATE OR REPLACE FUNCTION public.create_team_with_captain(
  p_name text,
  p_logo_url text,
  p_level public.skill_level,
  p_city text,
  p_city_id uuid,
  p_gender public.gender,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id uuid;
  v_prof RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT position, photo_url, gender
  INTO v_prof
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  -- Coherencia básica: el equipo debe ser del mismo género del creador.
  IF v_prof.gender IS DISTINCT FROM p_gender THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gender_mismatch');
  END IF;

  INSERT INTO public.teams (
    name,
    logo_url,
    level,
    captain_id,
    city,
    city_id,
    gender,
    description
  )
  VALUES (
    p_name,
    NULLIF(TRIM(p_logo_url), ''),
    p_level,
    auth.uid(),
    p_city,
    p_city_id,
    p_gender,
    NULLIF(TRIM(p_description), '')
  )
  RETURNING id INTO v_team_id;

  INSERT INTO public.team_members (
    team_id,
    user_id,
    position,
    photo_url,
    status
  )
  VALUES (
    v_team_id,
    auth.uid(),
    v_prof.position,
    COALESCE(v_prof.photo_url, ''),
    'confirmed'
  );

  RETURN jsonb_build_object('ok', true, 'teamId', v_team_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_with_captain(
  text,
  text,
  public.skill_level,
  text,
  uuid,
  public.gender,
  text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_team_with_captain(
  text,
  text,
  public.skill_level,
  text,
  uuid,
  public.gender,
  text
) TO authenticated;



-- ==============================================================================
-- [047/086] 20260408170000_rival_challenges_rpcs.sql
-- ==============================================================================

-- Fase 4 (robustez): rival challenges vía RPC (operaciones atómicas).

CREATE OR REPLACE FUNCTION public.create_rival_challenge(
  p_mode public.rival_challenge_mode,
  p_challenger_team_id uuid,
  p_challenged_team_id uuid,
  p_venue text,
  p_location text,
  p_city_id uuid,
  p_date_time timestamptz,
  p_level public.skill_level,
  p_title text,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gender public.gender;
  v_team_name text;
  v_challenged_captain_id uuid;
  v_match_id uuid;
  v_challenge_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Challenger debe ser staff (capitán o vice).
  IF NOT public.is_team_staff_captain(p_challenger_team_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_team_staff');
  END IF;

  SELECT t.gender, t.name INTO v_gender, v_team_name
  FROM public.teams t
  WHERE t.id = p_challenger_team_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'team_not_found');
  END IF;

  IF p_mode = 'direct'::public.rival_challenge_mode THEN
    IF p_challenged_team_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'missing_challenged_team');
    END IF;
    SELECT t.captain_id INTO v_challenged_captain_id
    FROM public.teams t
    WHERE t.id = p_challenged_team_id
      AND t.gender = v_gender;
    IF NOT FOUND OR v_challenged_captain_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'challenged_team_invalid');
    END IF;
  ELSE
    -- open: no challenged team.
    v_challenged_captain_id := NULL;
  END IF;

  INSERT INTO public.match_opportunities (
    type,
    title,
    description,
    location,
    venue,
    city_id,
    date_time,
    level,
    creator_id,
    team_name,
    gender,
    status
  )
  VALUES (
    'rival',
    p_title,
    p_description,
    p_location,
    p_venue,
    p_city_id,
    p_date_time,
    p_level,
    auth.uid(),
    v_team_name,
    v_gender,
    'pending'
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.rival_challenges (
    opportunity_id,
    challenger_team_id,
    challenger_captain_id,
    challenged_team_id,
    challenged_captain_id,
    mode,
    status
  )
  VALUES (
    v_match_id,
    p_challenger_team_id,
    auth.uid(),
    CASE WHEN p_mode = 'direct' THEN p_challenged_team_id ELSE NULL END,
    CASE WHEN p_mode = 'direct' THEN v_challenged_captain_id ELSE NULL END,
    p_mode,
    'pending'
  )
  RETURNING id INTO v_challenge_id;

  RETURN jsonb_build_object('ok', true, 'opportunityId', v_match_id, 'challengeId', v_challenge_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_rival_challenge(
  public.rival_challenge_mode,
  uuid,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  text,
  text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_rival_challenge(
  public.rival_challenge_mode,
  uuid,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  text,
  text
) TO authenticated;


CREATE OR REPLACE FUNCTION public.respond_rival_challenge(
  p_challenge_id uuid,
  p_accept boolean,
  p_my_team_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ch RECORD;
  challenger_team RECORD;
  accepted_team RECORD;
  v_accepted_team_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO ch
  FROM public.rival_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF ch.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Decline: permitido a staff del equipo desafiado (direct) o a staff del equipo elegido (open),
  -- y al challenger para cancelar (no cubrimos cancel aquí; solo decline).
  IF COALESCE(p_accept, false) IS DISTINCT FROM true THEN
    IF ch.mode = 'direct' THEN
      IF ch.challenged_team_id IS NULL OR NOT public.is_team_staff_captain(ch.challenged_team_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
      END IF;
    ELSE
      -- open: solo el staff que va a tomar el desafío puede declinarlo (equivalente a no aceptar).
      IF p_my_team_id IS NULL OR NOT public.is_team_staff_captain(p_my_team_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
      END IF;
    END IF;

    UPDATE public.rival_challenges
    SET status = 'declined',
        responded_at = now(),
        accepted_team_id = NULL,
        accepted_captain_id = auth.uid()
    WHERE id = p_challenge_id;

    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Accept
  IF ch.mode = 'direct' THEN
    v_accepted_team_id := ch.challenged_team_id;
    IF v_accepted_team_id IS NULL OR NOT public.is_team_staff_captain(v_accepted_team_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  ELSE
    IF p_my_team_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'missing_team');
    END IF;
    IF NOT public.is_team_staff_captain(p_my_team_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    IF p_my_team_id = ch.challenger_team_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'same_team');
    END IF;
    v_accepted_team_id := p_my_team_id;
  END IF;

  SELECT id, name INTO challenger_team
  FROM public.teams
  WHERE id = ch.challenger_team_id;

  SELECT id, name INTO accepted_team
  FROM public.teams
  WHERE id = v_accepted_team_id;

  UPDATE public.rival_challenges
  SET status = 'accepted',
      responded_at = now(),
      accepted_team_id = v_accepted_team_id,
      accepted_captain_id = auth.uid(),
      challenged_team_id = CASE WHEN ch.mode = 'open' THEN v_accepted_team_id ELSE ch.challenged_team_id END,
      challenged_captain_id = CASE WHEN ch.mode = 'open' THEN auth.uid() ELSE ch.challenged_captain_id END
  WHERE id = p_challenge_id;

  UPDATE public.match_opportunities
  SET status = 'confirmed',
      title = CASE
        WHEN challenger_team.name IS NOT NULL AND accepted_team.name IS NOT NULL
          THEN challenger_team.name || ' vs ' || accepted_team.name
        ELSE title
      END
  WHERE id = ch.opportunity_id;

  INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
  VALUES (ch.opportunity_id, auth.uid(), 'confirmed', false)
  ON CONFLICT (opportunity_id, user_id)
  DO UPDATE SET status = 'confirmed', is_goalkeeper = false;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.respond_rival_challenge(uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_rival_challenge(uuid, boolean, uuid) TO authenticated;



-- ==============================================================================
-- [048/086] 20260409120000_seed_chile_regions_and_communes.sql
-- ==============================================================================

-- ============================================================================
-- Chile: todas las regiones + comunas del listado operativo.
-- - Ciudad cabecera (referencia principal por región): is_active = true
-- - Demás comunas del listado: is_active = false (activar desde admin)
-- - Región VI: ya existe; solo se insertan comunas nuevas (Rancagua intacta).
-- Idempotente: (country_id, code) en regiones; (region_id, slug) en ciudades.
-- ============================================================================

-- Regiones (omitir VI si ya está)
INSERT INTO public.geo_regions (country_id, code, name, is_active)
SELECT c.id, v.code, v.name, true
FROM public.geo_countries c
CROSS JOIN (
  VALUES
    ('XV', 'Región de Arica y Parinacota'),
    ('I', 'Región de Tarapacá'),
    ('II', 'Región de Antofagasta'),
    ('III', 'Región de Atacama'),
    ('IV', 'Región de Coquimbo'),
    ('V', 'Región de Valparaíso'),
    ('XIII', 'Región Metropolitana de Santiago'),
    ('VII', 'Región del Maule'),
    ('XVI', 'Región de Ñuble'),
    ('VIII', 'Región del Biobío'),
    ('IX', 'Región de La Araucanía'),
    ('XIV', 'Región de Los Ríos'),
    ('X', 'Región de Los Lagos'),
    ('XI', 'Región de Aysén'),
    ('XII', 'Región de Magallanes')
) AS v(code, name)
WHERE c.iso_code = 'cl'
  AND NOT EXISTS (
    SELECT 1
    FROM public.geo_regions r
    WHERE r.country_id = c.id
      AND r.code = v.code
  );

-- Comunas por región (slug único por región)
INSERT INTO public.geo_cities (region_id, name, slug, is_active)
SELECT r.id, x.name, x.slug, x.is_active
FROM public.geo_regions r
JOIN public.geo_countries co ON co.id = r.country_id AND co.iso_code = 'cl'
JOIN (
  VALUES
    -- XV
    ('XV', 'Arica', 'arica', true),
    ('XV', 'Camarones', 'camarones', false),
    ('XV', 'Putre', 'putre', false),
    ('XV', 'General Lagos', 'general-lagos', false),
    -- I
    ('I', 'Iquique', 'iquique', true),
    ('I', 'Alto Hospicio', 'alto-hospicio', false),
    ('I', 'Pozo Almonte', 'pozo-almonte', false),
    ('I', 'Pica', 'pica', false),
    ('I', 'Huara', 'huara', false),
    ('I', 'Camiña', 'camina', false),
    ('I', 'Colchane', 'colchane', false),
    -- II
    ('II', 'Antofagasta', 'antofagasta', true),
    ('II', 'Mejillones', 'mejillones', false),
    ('II', 'Sierra Gorda', 'sierra-gorda', false),
    ('II', 'Taltal', 'taltal', false),
    ('II', 'Calama', 'calama', false),
    ('II', 'Ollagüe', 'ollague', false),
    ('II', 'San Pedro de Atacama', 'san-pedro-de-atacama', false),
    ('II', 'Tocopilla', 'tocopilla', false),
    ('II', 'María Elena', 'maria-elena', false),
    -- III
    ('III', 'Copiapó', 'copiapo', true),
    ('III', 'Caldera', 'caldera', false),
    ('III', 'Tierra Amarilla', 'tierra-amarilla', false),
    ('III', 'Chañaral', 'chanaral', false),
    ('III', 'Diego de Almagro', 'diego-de-almagro', false),
    ('III', 'Vallenar', 'vallenar', false),
    ('III', 'Freirina', 'freirina', false),
    ('III', 'Huasco', 'huasco', false),
    ('III', 'Alto del Carmen', 'alto-del-carmen', false),
    -- IV
    ('IV', 'La Serena', 'la-serena', true),
    ('IV', 'Coquimbo', 'coquimbo', false),
    ('IV', 'Ovalle', 'ovalle', false),
    ('IV', 'Illapel', 'illapel', false),
    ('IV', 'Salamanca', 'salamanca', false),
    ('IV', 'Vicuña', 'vicuna', false),
    ('IV', 'Los Vilos', 'los-vilos', false),
    ('IV', 'Andacollo', 'andacollo', false),
    ('IV', 'Monte Patria', 'monte-patria', false),
    ('IV', 'Punitaqui', 'punitaqui', false),
    -- V
    ('V', 'Valparaíso', 'valparaiso', true),
    ('V', 'Viña del Mar', 'vina-del-mar', false),
    ('V', 'Quilpué', 'quilpue', false),
    ('V', 'Villa Alemana', 'villa-alemana', false),
    ('V', 'San Antonio', 'san-antonio', false),
    ('V', 'Quillota', 'quillota', false),
    ('V', 'Los Andes', 'los-andes', false),
    ('V', 'La Calera', 'la-calera', false),
    ('V', 'Limache', 'limache', false),
    ('V', 'Casablanca', 'casablanca', false),
    -- XIII RM
    ('XIII', 'Santiago', 'santiago', true),
    ('XIII', 'Las Condes', 'las-condes', false),
    ('XIII', 'Providencia', 'providencia', false),
    ('XIII', 'Maipú', 'maipu', false),
    ('XIII', 'Puente Alto', 'puente-alto', false),
    ('XIII', 'Ñuñoa', 'nunoa', false),
    ('XIII', 'La Florida', 'la-florida', false),
    ('XIII', 'San Bernardo', 'san-bernardo', false),
    ('XIII', 'Pudahuel', 'pudahuel', false),
    ('XIII', 'Peñalolén', 'penalolen', false),
    -- VI (cabeceras extra activas; resto comunas inactivas; Rancagua ya en seed)
    ('VI', 'Machalí', 'machali', true),
    ('VI', 'Graneros', 'graneros', true),
    ('VI', 'San Fernando', 'san-fernando', false),
    ('VI', 'Santa Cruz', 'santa-cruz', false),
    ('VI', 'Pichilemu', 'pichilemu', false),
    ('VI', 'Rengo', 'rengo', false),
    ('VI', 'Chimbarongo', 'chimbarongo', false),
    ('VI', 'San Vicente', 'san-vicente', false),
    ('VI', 'Litueche', 'litueche', false),
    -- VII
    ('VII', 'Talca', 'talca', true),
    ('VII', 'Curicó', 'curico', false),
    ('VII', 'Linares', 'linares', false),
    ('VII', 'Cauquenes', 'cauquenes', false),
    ('VII', 'Constitución', 'constitucion', false),
    ('VII', 'Molina', 'molina', false),
    ('VII', 'Parral', 'parral', false),
    ('VII', 'San Javier', 'san-javier', false),
    ('VII', 'Teno', 'teno', false),
    ('VII', 'Colbún', 'colbun', false),
    -- XVI
    ('XVI', 'Chillán', 'chillan', true),
    ('XVI', 'Chillán Viejo', 'chillan-viejo', false),
    ('XVI', 'San Carlos', 'san-carlos', false),
    ('XVI', 'Bulnes', 'bulnes', false),
    ('XVI', 'Quirihue', 'quirihue', false),
    ('XVI', 'Yungay', 'yungay', false),
    ('XVI', 'Coelemu', 'coelemu', false),
    ('XVI', 'Pinto', 'pinto', false),
    ('XVI', 'San Ignacio', 'san-ignacio', false),
    ('XVI', 'El Carmen', 'el-carmen', false),
    -- VIII
    ('VIII', 'Concepción', 'concepcion', true),
    ('VIII', 'Talcahuano', 'talcahuano', false),
    ('VIII', 'Los Ángeles', 'los-angeles', false),
    ('VIII', 'Coronel', 'coronel', false),
    ('VIII', 'San Pedro de la Paz', 'san-pedro-de-la-paz', false),
    ('VIII', 'Hualpén', 'hualpen', false),
    ('VIII', 'Lota', 'lota', false),
    ('VIII', 'Chiguayante', 'chiguayante', false),
    ('VIII', 'Tomé', 'tome', false),
    ('VIII', 'Arauco', 'arauco', false),
    -- IX
    ('IX', 'Temuco', 'temuco', true),
    ('IX', 'Padre Las Casas', 'padre-las-casas', false),
    ('IX', 'Angol', 'angol', false),
    ('IX', 'Villarrica', 'villarrica', false),
    ('IX', 'Pucón', 'pucon', false),
    ('IX', 'Lautaro', 'lautaro', false),
    ('IX', 'Victoria', 'victoria', false),
    ('IX', 'Nueva Imperial', 'nueva-imperial', false),
    ('IX', 'Carahue', 'carahue', false),
    ('IX', 'Loncoche', 'loncoche', false),
    -- XIV
    ('XIV', 'Valdivia', 'valdivia', true),
    ('XIV', 'La Unión', 'la-union', false),
    ('XIV', 'Río Bueno', 'rio-bueno', false),
    ('XIV', 'Panguipulli', 'panguipulli', false),
    ('XIV', 'Los Lagos', 'los-lagos', false),
    ('XIV', 'Paillaco', 'paillaco', false),
    ('XIV', 'Futrono', 'futrono', false),
    ('XIV', 'Lago Ranco', 'lago-ranco', false),
    ('XIV', 'Máfil', 'mafil', false),
    ('XIV', 'Corral', 'corral', false),
    -- X
    ('X', 'Puerto Montt', 'puerto-montt', true),
    ('X', 'Osorno', 'osorno', false),
    ('X', 'Castro', 'castro', false),
    ('X', 'Ancud', 'ancud', false),
    ('X', 'Puerto Varas', 'puerto-varas', false),
    ('X', 'Quellón', 'quellon', false),
    ('X', 'Calbuco', 'calbuco', false),
    ('X', 'Frutillar', 'frutillar', false),
    ('X', 'Llanquihue', 'llanquihue', false),
    ('X', 'Chonchi', 'chonchi', false),
    -- XI
    ('XI', 'Coyhaique', 'coyhaique', true),
    ('XI', 'Aysén', 'aysen', false),
    ('XI', 'Chile Chico', 'chile-chico', false),
    ('XI', 'Cochrane', 'cochrane', false),
    ('XI', 'Cisnes', 'cisnes', false),
    ('XI', 'Río Ibáñez', 'rio-ibanez', false),
    ('XI', 'Tortel', 'tortel', false),
    -- XII
    ('XII', 'Punta Arenas', 'punta-arenas', true),
    ('XII', 'Puerto Natales', 'puerto-natales', false),
    ('XII', 'Porvenir', 'porvenir', false),
    ('XII', 'Cabo de Hornos', 'cabo-de-hornos', false),
    ('XII', 'Primavera', 'primavera', false),
    ('XII', 'Timaukel', 'timaukel', false),
    ('XII', 'Laguna Blanca', 'laguna-blanca', false),
    ('XII', 'San Gregorio', 'san-gregorio', false),
    ('XII', 'Río Verde', 'rio-verde', false),
    ('XII', 'Torres del Paine', 'torres-del-paine', false)
) AS x(region_code, name, slug, is_active)
  ON r.code = x.region_code
WHERE NOT EXISTS (
  SELECT 1
  FROM public.geo_cities g
  WHERE g.region_id = r.id
    AND g.slug = x.slug
);


-- ==============================================================================
-- [049/086] 20260410120000_mod_sanction_alert_timestamps.sql
-- ==============================================================================

-- Timestamps de última tarjeta (alertas 24h en perfil del jugador).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mod_last_yellow_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mod_last_red_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.mod_last_yellow_at IS 'Última aplicación de tarjeta amarilla (aviso temporal en app).';
COMMENT ON COLUMN public.profiles.mod_last_red_at IS 'Última aplicación de tarjeta roja (aviso temporal en app).';

CREATE OR REPLACE FUNCTION public.admin_apply_card(
  p_user_id uuid,
  p_card text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prof RECORD;
  next_suspend timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT id, mod_yellow_cards, mod_red_cards, mod_suspended_until, mod_banned_at
    INTO prof
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF prof.mod_banned_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF lower(p_card) = 'yellow' THEN
    UPDATE public.profiles
    SET mod_yellow_cards = mod_yellow_cards + 1,
        mod_last_yellow_at = now()
    WHERE id = p_user_id;

    SELECT mod_yellow_cards INTO prof.mod_yellow_cards FROM public.profiles WHERE id = p_user_id;
    IF prof.mod_yellow_cards >= 3 THEN
      next_suspend := now() + interval '3 days';
      UPDATE public.profiles
      SET mod_yellow_cards = 0,
          mod_red_cards = mod_red_cards + 1,
          mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend),
          mod_last_red_at = now()
      WHERE id = p_user_id;
    END IF;
    RETURN;
  ELSIF lower(p_card) = 'red' THEN
    next_suspend := now() + interval '3 days';
    UPDATE public.profiles
    SET mod_red_cards = mod_red_cards + 1,
        mod_yellow_cards = 0,
        mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend),
        mod_last_red_at = now()
    WHERE id = p_user_id;
    RETURN;
  ELSE
    RAISE EXCEPTION 'invalid_card';
  END IF;
END;
$$;


-- ==============================================================================
-- [050/086] 20260411120000_conduct_cards_cumulative_no_reset.sql
-- ==============================================================================

-- Amarillas y rojas: contadores históricos acumulativos (nunca se reducen a 0).
-- Cada 3ª amarilla acumulada sigue generando +1 roja y suspensión 3 días, sin borrar amarillas.

COMMENT ON COLUMN public.profiles.mod_yellow_cards IS
  'Tarjetas amarillas acumuladas (moderación). Histórico: solo aumenta.';
COMMENT ON COLUMN public.profiles.mod_red_cards IS
  'Tarjetas rojas acumuladas (moderación). Histórico: solo aumenta.';

CREATE OR REPLACE FUNCTION public.admin_apply_card(
  p_user_id uuid,
  p_card text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prof RECORD;
  next_suspend timestamptz;
  y_after int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT id, mod_yellow_cards, mod_red_cards, mod_suspended_until, mod_banned_at
    INTO prof
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF prof.mod_banned_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF lower(p_card) = 'yellow' THEN
    UPDATE public.profiles
    SET mod_yellow_cards = mod_yellow_cards + 1,
        mod_last_yellow_at = now()
    WHERE id = p_user_id;

    SELECT mod_yellow_cards INTO y_after FROM public.profiles WHERE id = p_user_id;
    -- Cada múltiplo de 3 amarillas: +1 roja y suspensión (sin resetear amarillas).
    IF y_after > 0 AND y_after % 3 = 0 THEN
      next_suspend := now() + interval '3 days';
      UPDATE public.profiles
      SET mod_red_cards = mod_red_cards + 1,
          mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend),
          mod_last_red_at = now()
      WHERE id = p_user_id;
    END IF;
    RETURN;
  ELSIF lower(p_card) = 'red' THEN
    next_suspend := now() + interval '3 days';
    UPDATE public.profiles
    SET mod_red_cards = mod_red_cards + 1,
        mod_suspended_until = GREATEST(COALESCE(mod_suspended_until, now()), next_suspend),
        mod_last_red_at = now()
    WHERE id = p_user_id;
    RETURN;
  ELSE
    RAISE EXCEPTION 'invalid_card';
  END IF;
END;
$$;


-- ==============================================================================
-- [051/086] 20260412120000_sports_venues_is_paused.sql
-- ==============================================================================

-- Ocultar centros en exploración pública sin borrarlos (panel admin: pausar / reactivar).

ALTER TABLE public.sports_venues
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sports_venues.is_paused IS
  'Si true, el centro no se lista en exploración ni páginas públicas de jugadores.';


-- ==============================================================================
-- [052/086] 20260412143000_app_user_feedback.sql
-- ==============================================================================

-- Comentarios de la app (sugerencias, opiniones, errores) desde jugadores → solo admin lee.

CREATE TABLE IF NOT EXISTS public.app_user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (
    char_length(trim(message)) >= 1
    AND char_length(message) <= 4000
  ),
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_user_feedback_created
  ON public.app_user_feedback (created_at DESC);

COMMENT ON TABLE public.app_user_feedback IS
  'Mensajes de usuarios (sugerencias, opiniones, errores). Insert: autenticado; SELECT: admin.';

ALTER TABLE public.app_user_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_user_feedback_insert_own ON public.app_user_feedback;
CREATE POLICY app_user_feedback_insert_own
  ON public.app_user_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS app_user_feedback_select_admin ON public.app_user_feedback;
CREATE POLICY app_user_feedback_select_admin
  ON public.app_user_feedback
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT, INSERT ON public.app_user_feedback TO authenticated;


-- ==============================================================================
-- [053/086] 20260414123000_profile_account_merge_and_self_heal.sql
-- ==============================================================================

-- Fusión de cuentas duplicadas de perfil (mismo usuario real con distinto UUID auth).
-- Caso típico: usuario crea otra cuenta OAuth por error y "pierde" propiedad/capitanía.

CREATE OR REPLACE FUNCTION public.merge_profile_accounts(
  p_source_user_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.profiles%ROWTYPE;
  v_target public.profiles%ROWTYPE;
BEGIN
  IF p_source_user_id IS NULL OR p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'source_and_target_required';
  END IF;
  IF p_source_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'source_and_target_must_differ';
  END IF;

  SELECT * INTO v_source FROM public.profiles WHERE id = p_source_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_profile_not_found';
  END IF;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_profile_not_found';
  END IF;

  -- 1) Tablas con clave compuesta (deduplicar antes de UPDATE).
  DELETE FROM public.match_opportunity_participants src
  USING public.match_opportunity_participants dst
  WHERE src.user_id = p_source_user_id
    AND dst.user_id = p_target_user_id
    AND dst.opportunity_id = src.opportunity_id;
  UPDATE public.match_opportunity_participants
  SET user_id = p_target_user_id
  WHERE user_id = p_source_user_id;

  DELETE FROM public.match_participants src
  USING public.match_participants dst
  WHERE src.user_id = p_source_user_id
    AND dst.user_id = p_target_user_id
    AND dst.match_id = src.match_id;
  UPDATE public.match_participants
  SET user_id = p_target_user_id
  WHERE user_id = p_source_user_id;

  DELETE FROM public.team_members src
  USING public.team_members dst
  WHERE src.user_id = p_source_user_id
    AND dst.user_id = p_target_user_id
    AND dst.team_id = src.team_id;
  UPDATE public.team_members
  SET user_id = p_target_user_id
  WHERE user_id = p_source_user_id;

  DELETE FROM public.match_opportunity_ratings src
  USING public.match_opportunity_ratings dst
  WHERE src.rater_id = p_source_user_id
    AND dst.rater_id = p_target_user_id
    AND dst.opportunity_id = src.opportunity_id;
  UPDATE public.match_opportunity_ratings
  SET rater_id = p_target_user_id
  WHERE rater_id = p_source_user_id;

  -- sports_venue_reviews: una por reserva.
  DELETE FROM public.sports_venue_reviews src
  USING public.sports_venue_reviews dst
  WHERE src.reviewer_id = p_source_user_id
    AND dst.reviewer_id = p_target_user_id
    AND dst.venue_reservation_id = src.venue_reservation_id;
  UPDATE public.sports_venue_reviews
  SET reviewer_id = p_target_user_id
  WHERE reviewer_id = p_source_user_id;

  -- team_invites: deduplicar pendientes por (team_id, invitee_id).
  DELETE FROM public.team_invites src
  USING public.team_invites dst
  WHERE src.invitee_id = p_source_user_id
    AND dst.invitee_id = p_target_user_id
    AND dst.team_id = src.team_id
    AND src.status = 'pending'
    AND dst.status = 'pending';
  UPDATE public.team_invites
  SET invitee_id = p_target_user_id
  WHERE invitee_id = p_source_user_id;
  UPDATE public.team_invites
  SET inviter_id = p_target_user_id
  WHERE inviter_id = p_source_user_id;
  DELETE FROM public.team_invites
  WHERE inviter_id = invitee_id;

  -- team_join_requests: deduplicar pendientes por (team_id, requester_id).
  DELETE FROM public.team_join_requests src
  USING public.team_join_requests dst
  WHERE src.requester_id = p_source_user_id
    AND dst.requester_id = p_target_user_id
    AND dst.team_id = src.team_id
    AND src.status = 'pending'
    AND dst.status = 'pending';
  UPDATE public.team_join_requests
  SET requester_id = p_target_user_id
  WHERE requester_id = p_source_user_id;

  -- 2) Tablas simples (FK directa a profiles.id).
  UPDATE public.match_opportunities
  SET creator_id = p_target_user_id
  WHERE creator_id = p_source_user_id;

  UPDATE public.messages
  SET sender_id = p_target_user_id
  WHERE sender_id = p_source_user_id;

  UPDATE public.teams
  SET captain_id = p_target_user_id
  WHERE captain_id = p_source_user_id;

  UPDATE public.teams
  SET vice_captain_id = p_target_user_id
  WHERE vice_captain_id = p_source_user_id;

  UPDATE public.rival_challenges
  SET challenger_captain_id = p_target_user_id
  WHERE challenger_captain_id = p_source_user_id;
  UPDATE public.rival_challenges
  SET challenged_captain_id = p_target_user_id
  WHERE challenged_captain_id = p_source_user_id;
  UPDATE public.rival_challenges
  SET accepted_captain_id = p_target_user_id
  WHERE accepted_captain_id = p_source_user_id;

  UPDATE public.sports_venues
  SET owner_id = p_target_user_id
  WHERE owner_id = p_source_user_id;

  UPDATE public.venue_reservations
  SET booker_user_id = p_target_user_id
  WHERE booker_user_id = p_source_user_id;
  UPDATE public.venue_reservations
  SET confirmed_by_user_id = p_target_user_id
  WHERE confirmed_by_user_id = p_source_user_id;

  UPDATE public.venue_reservation_payment_history
  SET actor_user_id = p_target_user_id
  WHERE actor_user_id = p_source_user_id;

  UPDATE public.player_reports
  SET reporter_id = p_target_user_id
  WHERE reporter_id = p_source_user_id;
  UPDATE public.player_reports
  SET reported_user_id = p_target_user_id
  WHERE reported_user_id = p_source_user_id;
  UPDATE public.player_reports
  SET reviewed_by = p_target_user_id
  WHERE reviewed_by = p_source_user_id;

  UPDATE public.revuelta_external_join_requests
  SET requester_id = p_target_user_id
  WHERE requester_id = p_source_user_id;

  UPDATE public.app_user_feedback
  SET user_id = p_target_user_id
  WHERE user_id = p_source_user_id;

  -- 3) Consolidar algunos campos del perfil destino.
  UPDATE public.profiles
  SET
    name = CASE
      WHEN char_length(trim(coalesce(name, ''))) = 0
      THEN coalesce(NULLIF(trim(v_source.name), ''), name)
      ELSE name
    END,
    photo_url = CASE
      WHEN coalesce(trim(photo_url), '') = ''
      THEN coalesce(NULLIF(trim(v_source.photo_url), ''), photo_url)
      ELSE photo_url
    END,
    whatsapp_phone = CASE
      WHEN coalesce(trim(whatsapp_phone), '') = ''
      THEN coalesce(NULLIF(trim(v_source.whatsapp_phone), ''), whatsapp_phone)
      ELSE whatsapp_phone
    END,
    player_essentials_completed_at = coalesce(player_essentials_completed_at, v_source.player_essentials_completed_at),
    birth_date = coalesce(birth_date, v_source.birth_date),
    stats_player_wins = coalesce(stats_player_wins, 0) + coalesce(v_source.stats_player_wins, 0),
    stats_player_draws = coalesce(stats_player_draws, 0) + coalesce(v_source.stats_player_draws, 0),
    stats_player_losses = coalesce(stats_player_losses, 0) + coalesce(v_source.stats_player_losses, 0),
    stats_organized_completed = coalesce(stats_organized_completed, 0) + coalesce(v_source.stats_organized_completed, 0),
    stats_organizer_wins = coalesce(stats_organizer_wins, 0) + coalesce(v_source.stats_organizer_wins, 0),
    mod_yellow_cards = GREATEST(coalesce(mod_yellow_cards, 0), coalesce(v_source.mod_yellow_cards, 0)),
    mod_red_cards = GREATEST(coalesce(mod_red_cards, 0), coalesce(v_source.mod_red_cards, 0)),
    mod_suspended_until = GREATEST(mod_suspended_until, v_source.mod_suspended_until),
    mod_banned_at = coalesce(mod_banned_at, v_source.mod_banned_at),
    mod_ban_reason = coalesce(nullif(trim(mod_ban_reason), ''), nullif(trim(v_source.mod_ban_reason), '')),
    mod_last_yellow_at = GREATEST(mod_last_yellow_at, v_source.mod_last_yellow_at),
    mod_last_red_at = GREATEST(mod_last_red_at, v_source.mod_last_red_at),
    last_seen_at = GREATEST(last_seen_at, v_source.last_seen_at),
    updated_at = now()
  WHERE id = p_target_user_id;

  -- 4) Eliminar perfil origen ya migrado.
  DELETE FROM public.profiles WHERE id = p_source_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'sourceUserId', p_source_user_id,
    'targetUserId', p_target_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.merge_profile_accounts(uuid, uuid) IS
  'Mueve referencias de p_source_user_id a p_target_user_id y borra el perfil origen.';

REVOKE ALL ON FUNCTION public.merge_profile_accounts(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_merge_profile_accounts(
  p_source_user_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN public.merge_profile_accounts(p_source_user_id, p_target_user_id);
END;
$$;

COMMENT ON FUNCTION public.admin_merge_profile_accounts(uuid, uuid) IS
  'Wrapper admin para fusionar cuentas duplicadas.';

REVOKE ALL ON FUNCTION public.admin_merge_profile_accounts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_merge_profile_accounts(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.self_heal_duplicate_profile_by_email()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_current uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_source uuid;
  v_merged integer := 0;
BEGIN
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_auth_uid');
  END IF;
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_email_in_jwt');
  END IF;

  FOR v_source IN
    SELECT au.id
    FROM auth.users au
    INNER JOIN public.profiles p ON p.id = au.id
    WHERE au.id <> v_current
      AND lower(trim(coalesce(au.email, ''))) = v_email
    ORDER BY au.created_at ASC
  LOOP
    PERFORM public.merge_profile_accounts(v_source, v_current);
    v_merged := v_merged + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'mergedCount', v_merged,
    'targetUserId', v_current
  );
END;
$$;

COMMENT ON FUNCTION public.self_heal_duplicate_profile_by_email() IS
  'Autorrepara cuentas duplicadas con mismo email (migra referencias al auth.uid actual).';

REVOKE ALL ON FUNCTION public.self_heal_duplicate_profile_by_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_heal_duplicate_profile_by_email() TO authenticated;


-- ==============================================================================
-- [054/086] 20260414133000_match_creator_self_heal.sql
-- ==============================================================================

-- Refuerzo: re-asignar partidos creados por cuentas duplicadas al usuario actual.
-- Cubre especialmente revueltas privadas (requieren miembro confirmado del equipo).

CREATE OR REPLACE FUNCTION public.reassign_match_creators(
  p_source_user_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moved integer := 0;
BEGIN
  IF p_source_user_id IS NULL OR p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'source_and_target_required';
  END IF;
  IF p_source_user_id = p_target_user_id THEN
    RETURN jsonb_build_object('ok', true, 'moved', 0);
  END IF;

  -- Si el partido es revuelta privada, el creador debe ser miembro confirmado del equipo.
  -- Inserta al destino como miembro confirmado si aún no está, para permitir el UPDATE.
  INSERT INTO public.team_members (team_id, user_id, position, photo_url, status)
  SELECT DISTINCT
    mo.private_revuelta_team_id,
    p_target_user_id,
    coalesce(src_tm.position, prof.position, 'mediocampista'::public.position),
    coalesce(src_tm.photo_url, prof.photo_url, ''),
    'confirmed'::public.team_member_status
  FROM public.match_opportunities mo
  LEFT JOIN public.team_members src_tm
    ON src_tm.team_id = mo.private_revuelta_team_id
   AND src_tm.user_id = p_source_user_id
  LEFT JOIN public.profiles prof
    ON prof.id = p_target_user_id
  WHERE mo.creator_id = p_source_user_id
    AND mo.private_revuelta_team_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = mo.private_revuelta_team_id
        AND tm.user_id = p_target_user_id
    );

  UPDATE public.match_opportunities
  SET creator_id = p_target_user_id
  WHERE creator_id = p_source_user_id;

  GET DIAGNOSTICS v_moved = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'sourceUserId', p_source_user_id,
    'targetUserId', p_target_user_id,
    'moved', v_moved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_match_creators(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.self_heal_match_creators_by_email()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_current uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_source uuid;
  v_total integer := 0;
  v_row jsonb;
BEGIN
  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_auth_uid');
  END IF;
  IF v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_email_in_jwt');
  END IF;

  FOR v_source IN
    SELECT au.id
    FROM auth.users au
    INNER JOIN public.profiles p ON p.id = au.id
    WHERE au.id <> v_current
      AND lower(trim(coalesce(au.email, ''))) = v_email
  LOOP
    SELECT public.reassign_match_creators(v_source, v_current) INTO v_row;
    v_total := v_total + coalesce((v_row ->> 'moved')::integer, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'targetUserId', v_current,
    'moved', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.self_heal_match_creators_by_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.self_heal_match_creators_by_email() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reassign_match_creators(
  p_source_user_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN public.reassign_match_creators(p_source_user_id, p_target_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reassign_match_creators(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reassign_match_creators(uuid, uuid) TO authenticated;


-- ==============================================================================
-- [055/086] 20260414150000_match_leave_and_cancel_windows.sql
-- ==============================================================================

-- Reglas de salida/cancelación con motivo obligatorio:
-- - players/open: participante puede salirse hasta 2 horas antes.
-- - rival: cualquiera de los dos capitanes puede cancelar hasta 24 horas antes.

ALTER TABLE public.match_opportunity_participants
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

ALTER TABLE public.match_opportunity_participants
  DROP CONSTRAINT IF EXISTS mop_cancelled_reason_len;
ALTER TABLE public.match_opportunity_participants
  ADD CONSTRAINT mop_cancelled_reason_len
  CHECK (
    cancelled_reason IS NULL
    OR (
      char_length(trim(cancelled_reason)) >= 5
      AND char_length(cancelled_reason) <= 1000
    )
  );

CREATE OR REPLACE FUNCTION public.leave_match_opportunity_with_reason(
  p_opportunity_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, type, date_time, status, creator_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF mo.type NOT IN ('players', 'open') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_supported_for_type');
  END IF;

  IF mo.creator_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'creator_cannot_leave');
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_leave');
  END IF;

  UPDATE public.match_opportunity_participants
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = v_reason
  WHERE opportunity_id = p_opportunity_id
    AND user_id = auth.uid()
    AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.leave_match_opportunity_with_reason(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_match_opportunity_with_reason(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_match_opportunity_with_reason(
  p_opportunity_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  ch RECORD;
  v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, type, date_time, status, creator_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF mo.type = 'rival' THEN
    SELECT challenger_captain_id, challenged_captain_id, accepted_captain_id, status
      INTO ch
    FROM public.rival_challenges
    WHERE opportunity_id = p_opportunity_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'challenge_not_found');
    END IF;

    IF auth.uid() IS DISTINCT FROM ch.challenger_captain_id
      AND auth.uid() IS DISTINCT FROM ch.challenged_captain_id
      AND auth.uid() IS DISTINCT FROM ch.accepted_captain_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_rival_captain');
    END IF;

    IF now() > mo.date_time - interval '24 hours' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'too_late_rival_cancel');
    END IF;

    UPDATE public.rival_challenges
    SET
      status = 'cancelled',
      responded_at = coalesce(responded_at, now())
    WHERE opportunity_id = p_opportunity_id
      AND status <> 'cancelled';
  ELSE
    IF auth.uid() IS DISTINCT FROM mo.creator_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_organizer');
    END IF;
  END IF;

  UPDATE public.match_opportunities
  SET
    status = 'cancelled',
    suspended_at = now(),
    suspended_reason = v_reason,
    updated_at = now()
  WHERE id = p_opportunity_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_match_opportunity_with_reason(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_match_opportunity_with_reason(uuid, text) TO authenticated;


-- ==============================================================================
-- [056/086] 20260414163000_match_reschedule_with_reason.sql
-- ==============================================================================

-- Reprogramación por organizador con motivo y trazabilidad.
-- Permite cambiar centro (texto), ubicación, fecha y hora en un solo paso.
-- Si cambia la fecha/hora o el centro, los participantes confirmados vuelven a "pending"
-- para forzar reconfirmación del nuevo escenario.

CREATE TABLE IF NOT EXISTS public.match_opportunity_reschedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  old_venue TEXT NOT NULL,
  old_location TEXT NOT NULL,
  old_date_time TIMESTAMPTZ NOT NULL,
  new_venue TEXT NOT NULL,
  new_location TEXT NOT NULL,
  new_date_time TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_opportunity_reschedules_opp_created
  ON public.match_opportunity_reschedules (opportunity_id, created_at DESC);

ALTER TABLE public.match_opportunity_reschedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mor_select_related ON public.match_opportunity_reschedules;
CREATE POLICY mor_select_related
  ON public.match_opportunity_reschedules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND (
          mo.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.match_opportunity_participants p
            WHERE p.opportunity_id = mo.id
              AND p.user_id = auth.uid()
              AND p.status IN ('pending', 'confirmed')
          )
        )
    )
  );

REVOKE ALL ON TABLE public.match_opportunity_reschedules FROM PUBLIC;
GRANT SELECT ON TABLE public.match_opportunity_reschedules TO authenticated;

CREATE OR REPLACE FUNCTION public.reschedule_match_opportunity_with_reason(
  p_opportunity_id UUID,
  p_new_venue TEXT,
  p_new_location TEXT,
  p_new_date_time TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_new_venue TEXT := trim(coalesce(p_new_venue, ''));
  v_new_location TEXT := trim(coalesce(p_new_location, ''));
  v_reason TEXT := trim(coalesce(p_reason, ''));
  v_is_sensitive_change BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_new_venue) < 3 OR char_length(v_new_location) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_location_data');
  END IF;

  IF p_new_date_time IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_datetime');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, creator_id, status, type, date_time, venue, location, venue_reservation_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF auth.uid() IS DISTINCT FROM mo.creator_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_organizer');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF mo.venue_reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'has_venue_reservation');
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_reschedule');
  END IF;

  IF p_new_date_time < now() + interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new_time_too_soon');
  END IF;

  IF mo.date_time = p_new_date_time
    AND mo.venue = v_new_venue
    AND mo.location = v_new_location THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_changes');
  END IF;

  v_is_sensitive_change :=
    mo.date_time IS DISTINCT FROM p_new_date_time
    OR mo.venue IS DISTINCT FROM v_new_venue;

  INSERT INTO public.match_opportunity_reschedules (
    opportunity_id,
    changed_by,
    old_venue,
    old_location,
    old_date_time,
    new_venue,
    new_location,
    new_date_time,
    reason
  )
  VALUES (
    mo.id,
    auth.uid(),
    mo.venue,
    mo.location,
    mo.date_time,
    v_new_venue,
    v_new_location,
    p_new_date_time,
    v_reason
  );

  UPDATE public.match_opportunities
  SET
    venue = v_new_venue,
    location = v_new_location,
    date_time = p_new_date_time,
    sports_venue_id = NULL,
    venue_reservation_id = NULL,
    updated_at = now()
  WHERE id = mo.id;

  IF v_is_sensitive_change THEN
    UPDATE public.match_opportunity_participants
    SET status = 'pending'
    WHERE opportunity_id = mo.id
      AND user_id <> mo.creator_id
      AND status = 'confirmed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sensitive_change', v_is_sensitive_change
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_match_opportunity_with_reason(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_match_opportunity_with_reason(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;


-- ==============================================================================
-- [057/086] 20260415100000_participant_leave_reasons_privileged_rpc.sql
-- ==============================================================================

-- Motivo de salida (cancelled_reason): solo organizador del partido o cuenta admin.
-- El cliente ya no debe leer cancelled_reason vía REST; usar esta RPC.

CREATE OR REPLACE FUNCTION public.get_match_opportunity_participant_leave_reasons(
  p_opportunity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo_creator UUID;
  items JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT creator_id    INTO mo_creator FROM public.match_opportunities
  WHERE id = p_opportunity_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF auth.uid() IS DISTINCT FROM mo_creator THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.account_type = 'admin'::public.account_type
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'cancelled_reason', p.cancelled_reason,
        'cancelled_at', p.cancelled_at
      )
    ),
    '[]'::jsonb
  )
    INTO items
  FROM public.match_opportunity_participants p
  WHERE p.opportunity_id = p_opportunity_id
    AND p.status = 'cancelled'
    AND p.cancelled_reason IS NOT NULL
    AND length(trim(p.cancelled_reason)) >= 1;

  RETURN jsonb_build_object('ok', true, 'items', items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_match_opportunity_participant_leave_reasons(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_match_opportunity_participant_leave_reasons(UUID) TO authenticated;


-- ==============================================================================
-- [058/086] 20260418120000_ensure_reschedule_rpc_postgrest.sql
-- ==============================================================================

-- Si ves 404 en /rpc/reschedule_match_opportunity_with_reason: aplicar esta migración
-- (o el SQL completo en el Editor). Incluye tabla si aún no existe (idempotente).

CREATE TABLE IF NOT EXISTS public.match_opportunity_reschedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  old_venue TEXT NOT NULL,
  old_location TEXT NOT NULL,
  old_date_time TIMESTAMPTZ NOT NULL,
  new_venue TEXT NOT NULL,
  new_location TEXT NOT NULL,
  new_date_time TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_opportunity_reschedules_opp_created
  ON public.match_opportunity_reschedules (opportunity_id, created_at DESC);

ALTER TABLE public.match_opportunity_reschedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mor_select_related ON public.match_opportunity_reschedules;
CREATE POLICY mor_select_related
  ON public.match_opportunity_reschedules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND (
          mo.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.match_opportunity_participants p
            WHERE p.opportunity_id = mo.id
              AND p.user_id = auth.uid()
              AND p.status IN ('pending', 'confirmed')
          )
        )
    )
  );

REVOKE ALL ON TABLE public.match_opportunity_reschedules FROM PUBLIC;
GRANT SELECT ON TABLE public.match_opportunity_reschedules TO authenticated;

CREATE OR REPLACE FUNCTION public.reschedule_match_opportunity_with_reason(
  p_opportunity_id UUID,
  p_new_venue TEXT,
  p_new_location TEXT,
  p_new_date_time TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_new_venue TEXT := trim(coalesce(p_new_venue, ''));
  v_new_location TEXT := trim(coalesce(p_new_location, ''));
  v_reason TEXT := trim(coalesce(p_reason, ''));
  v_is_sensitive_change BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_new_venue) < 3 OR char_length(v_new_location) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_location_data');
  END IF;

  IF p_new_date_time IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_datetime');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, creator_id, status, type, date_time, venue, location, venue_reservation_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF auth.uid() IS DISTINCT FROM mo.creator_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_organizer');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF mo.venue_reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'has_venue_reservation');
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_reschedule');
  END IF;

  IF p_new_date_time < now() + interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new_time_too_soon');
  END IF;

  IF mo.date_time = p_new_date_time
    AND mo.venue = v_new_venue
    AND mo.location = v_new_location THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_changes');
  END IF;

  v_is_sensitive_change :=
    mo.date_time IS DISTINCT FROM p_new_date_time
    OR mo.venue IS DISTINCT FROM v_new_venue;

  INSERT INTO public.match_opportunity_reschedules (
    opportunity_id,
    changed_by,
    old_venue,
    old_location,
    old_date_time,
    new_venue,
    new_location,
    new_date_time,
    reason
  )
  VALUES (
    mo.id,
    auth.uid(),
    mo.venue,
    mo.location,
    mo.date_time,
    v_new_venue,
    v_new_location,
    p_new_date_time,
    v_reason
  );

  UPDATE public.match_opportunities
  SET
    venue = v_new_venue,
    location = v_new_location,
    date_time = p_new_date_time,
    sports_venue_id = NULL,
    venue_reservation_id = NULL,
    updated_at = now()
  WHERE id = mo.id;

  IF v_is_sensitive_change THEN
    UPDATE public.match_opportunity_participants
    SET status = 'pending'
    WHERE opportunity_id = mo.id
      AND user_id <> mo.creator_id
      AND status = 'confirmed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sensitive_change', v_is_sensitive_change
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_match_opportunity_with_reason(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_match_opportunity_with_reason(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [059/086] 20260418125950_team_pick_match_type_enum_values.sql
-- ==============================================================================

-- Valores nuevos de match_type en transacción propia (commit antes de usarlos en otra migración).
-- Ver: https://www.postgresql.org/docs/current/sql-altertype.html — no usar el valor nuevo
-- en la misma transacción que lo añade.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'match_type' AND e.enumlabel = 'team_pick_public'
  ) THEN
    ALTER TYPE public.match_type ADD VALUE 'team_pick_public';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'match_type' AND e.enumlabel = 'team_pick_private'
  ) THEN
    ALTER TYPE public.match_type ADD VALUE 'team_pick_private';
  END IF;
END
$$;


-- ==============================================================================
-- [060/086] 20260418130000_team_pick_match_schema.sql
-- ==============================================================================

-- Modo "selección de equipos" (6vs6): join_code, alineación por encuentro, RLS, RPC de creación.
-- Requiere migración previa 20260418125950_team_pick_match_type_enum_values.sql (valores enum en otra transacción).

-- ---------------------------------------------------------------------------
-- 1) match_opportunities: código 4 dígitos (obligatorio solo en team_pick_private)
-- ---------------------------------------------------------------------------
ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS join_code text;

COMMENT ON COLUMN public.match_opportunities.join_code IS
  'Código 4 dígitos para unirse a partidos team_pick_private; NULL en público.';

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_join_code_format;
ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_join_code_format
  CHECK (join_code IS NULL OR join_code ~ '^[0-9]{4}$');

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_team_pick_private_join_code;
ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_team_pick_private_join_code
  CHECK (
    type IS DISTINCT FROM 'team_pick_private'::public.match_type
    OR (join_code IS NOT NULL AND char_length(join_code) = 4)
  );

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_team_pick_public_no_code;
ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_team_pick_public_no_code
  CHECK (
    type IS DISTINCT FROM 'team_pick_public'::public.match_type
    OR join_code IS NULL
  );

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_team_pick_players_needed;
ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_team_pick_players_needed
  CHECK (
    type NOT IN ('team_pick_public'::public.match_type, 'team_pick_private'::public.match_type)
    OR (players_needed = 12)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_opportunities_join_code_active_private
  ON public.match_opportunities (join_code)
  WHERE type = 'team_pick_private'::public.match_type
    AND status IN ('pending', 'confirmed')
    AND join_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Participantes: bando (A/B) y rol del encuentro (gk / líneas)
-- ---------------------------------------------------------------------------
ALTER TABLE public.match_opportunity_participants
  ADD COLUMN IF NOT EXISTS pick_team char(1),
  ADD COLUMN IF NOT EXISTS encounter_lineup_role text;

COMMENT ON COLUMN public.match_opportunity_participants.pick_team IS
  'Equipo A o B solo para modos team_pick_*; NULL en otros tipos.';
COMMENT ON COLUMN public.match_opportunity_participants.encounter_lineup_role IS
  'Rol en este partido: gk, defensa, mediocampista, delantero (team_pick_*).';

ALTER TABLE public.match_opportunity_participants
  DROP CONSTRAINT IF EXISTS mop_pick_team_values;
ALTER TABLE public.match_opportunity_participants
  ADD CONSTRAINT mop_pick_team_values
  CHECK (pick_team IS NULL OR pick_team IN ('A', 'B'));

ALTER TABLE public.match_opportunity_participants
  DROP CONSTRAINT IF EXISTS mop_encounter_lineup_role_values;
ALTER TABLE public.match_opportunity_participants
  ADD CONSTRAINT mop_encounter_lineup_role_values
  CHECK (
    encounter_lineup_role IS NULL
    OR encounter_lineup_role IN ('gk', 'defensa', 'mediocampista', 'delantero')
  );

-- ---------------------------------------------------------------------------
-- 4) Arqueros en revuelta open: no bloquear team_pick_* (cupos en otro trigger)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_open_revuelta_goalkeeper_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  mo_type public.match_type;
  cnt int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT type INTO mo_type
  FROM public.match_opportunities
  WHERE id = NEW.opportunity_id;

  IF mo_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF mo_type IN ('team_pick_public'::public.match_type, 'team_pick_private'::public.match_type) THEN
    RETURN NEW;
  END IF;

  IF mo_type IS DISTINCT FROM 'open' THEN
    IF NEW.is_goalkeeper THEN
      RAISE EXCEPTION 'El rol arquero solo aplica en revueltas (tipo open)';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT COALESCE(NEW.is_goalkeeper, false) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int INTO cnt
  FROM public.match_opportunity_participants
  WHERE opportunity_id = NEW.opportunity_id
    AND is_goalkeeper = true
    AND user_id IS DISTINCT FROM NEW.user_id;

  IF cnt >= 2 THEN
    RAISE EXCEPTION 'Ya hay 2 arqueros en esta revuelta';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Sincronizar is_goalkeeper desde encounter_lineup_role (team_pick)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_encounter_lineup_goalkeeper_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  mo_type public.match_type;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT type INTO mo_type
  FROM public.match_opportunities
  WHERE id = NEW.opportunity_id;

  IF mo_type IS NULL
    OR mo_type NOT IN (
      'team_pick_public'::public.match_type,
      'team_pick_private'::public.match_type
    )
  THEN
    RETURN NEW;
  END IF;

  NEW.is_goalkeeper := NEW.encounter_lineup_role = 'gk';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mop_sync_encounter_gk ON public.match_opportunity_participants;
CREATE TRIGGER trg_mop_sync_encounter_gk
  BEFORE INSERT OR UPDATE
  ON public.match_opportunity_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_encounter_lineup_goalkeeper_flag();

-- ---------------------------------------------------------------------------
-- 6) Cupos 6vs6 por bando (1 GK + 5 campo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_team_pick_lineup_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  mo_type public.match_type;
  a_tot int;
  a_gk int;
  a_fd int;
  b_tot int;
  b_gk int;
  b_fd int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT type INTO mo_type
  FROM public.match_opportunities
  WHERE id = NEW.opportunity_id;

  IF mo_type IS NULL
    OR mo_type NOT IN (
      'team_pick_public'::public.match_type,
      'team_pick_private'::public.match_type
    )
  THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF NEW.pick_team IS NULL OR NEW.pick_team NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'Debes elegir equipo A o B' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.encounter_lineup_role IS NULL
    OR NEW.encounter_lineup_role NOT IN ('gk', 'defensa', 'mediocampista', 'delantero')
  THEN
    RAISE EXCEPTION 'Debes elegir rol para este encuentro' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE pick_team = 'A'),
    COUNT(*) FILTER (WHERE pick_team = 'A' AND encounter_lineup_role = 'gk'),
    COUNT(*) FILTER (WHERE pick_team = 'A' AND encounter_lineup_role IS DISTINCT FROM 'gk'),
    COUNT(*) FILTER (WHERE pick_team = 'B'),
    COUNT(*) FILTER (WHERE pick_team = 'B' AND encounter_lineup_role = 'gk'),
    COUNT(*) FILTER (WHERE pick_team = 'B' AND encounter_lineup_role IS DISTINCT FROM 'gk')
  INTO a_tot, a_gk, a_fd, b_tot, b_gk, b_fd
  FROM public.match_opportunity_participants
  WHERE opportunity_id = NEW.opportunity_id
    AND status IN ('pending', 'confirmed')
    AND user_id IS DISTINCT FROM NEW.user_id;

  IF NEW.pick_team = 'A' THEN
    a_tot := a_tot + 1;
    IF NEW.encounter_lineup_role = 'gk' THEN
      a_gk := a_gk + 1;
    ELSE
      a_fd := a_fd + 1;
    END IF;
  ELSE
    b_tot := b_tot + 1;
    IF NEW.encounter_lineup_role = 'gk' THEN
      b_gk := b_gk + 1;
    ELSE
      b_fd := b_fd + 1;
    END IF;
  END IF;

  IF a_gk > 1 OR b_gk > 1 THEN
    RAISE EXCEPTION 'Solo puede haber 1 arquero por equipo' USING ERRCODE = 'check_violation';
  END IF;
  IF a_fd > 5 OR b_fd > 5 THEN
    RAISE EXCEPTION 'Máximo 5 jugadores de campo por equipo' USING ERRCODE = 'check_violation';
  END IF;
  IF a_tot > 6 OR b_tot > 6 THEN
    RAISE EXCEPTION 'Máximo 6 jugadores por equipo' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mop_team_pick_slots ON public.match_opportunity_participants;
CREATE TRIGGER trg_mop_team_pick_slots
  BEFORE INSERT OR UPDATE
  ON public.match_opportunity_participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_team_pick_lineup_slots();

-- ---------------------------------------------------------------------------
-- 7) RLS: partidos team_pick_private solo creador / inscritos / admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS match_opportunities_select_authenticated ON public.match_opportunities;

CREATE POLICY match_opportunities_select_authenticated
  ON public.match_opportunities
  FOR SELECT
  TO authenticated
  USING (
    type IS DISTINCT FROM 'team_pick_private'::public.match_type
    OR creator_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = match_opportunities.id
        AND p.user_id = auth.uid()
        AND p.status IN ('pending', 'confirmed')
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS match_opportunities_select_anon_open_active ON public.match_opportunities;
CREATE POLICY match_opportunities_select_anon_open_active
  ON public.match_opportunities
  FOR SELECT
  TO anon
  USING (
    status IN ('pending', 'confirmed')
    AND (
      type = 'open'::public.match_type
      OR type = 'team_pick_public'::public.match_type
    )
  );

DROP POLICY IF EXISTS mop_select_anon_open_active ON public.match_opportunity_participants;
CREATE POLICY mop_select_anon_open_active
  ON public.match_opportunity_participants
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND mo.status IN ('pending', 'confirmed')
        AND (
          mo.type = 'open'::public.match_type
          OR mo.type = 'team_pick_public'::public.match_type
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 8) Salir del partido: incluir team_pick_*
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_match_opportunity_with_reason(
  p_opportunity_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, type, date_time, status, creator_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF mo.type NOT IN (
    'players'::public.match_type,
    'open'::public.match_type,
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_supported_for_type');
  END IF;

  IF mo.creator_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'creator_cannot_leave');
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_leave');
  END IF;

  UPDATE public.match_opportunity_participants
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = v_reason
  WHERE opportunity_id = p_opportunity_id
    AND user_id = auth.uid()
    AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) RPC: crear partido team_pick + organizador en equipo A
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_team_pick_match_opportunity(
  p_type public.match_type,
  p_title text,
  p_description text,
  p_location text,
  p_venue text,
  p_city_id uuid,
  p_date_time timestamptz,
  p_level public.skill_level,
  p_gender public.gender,
  p_status public.match_status,
  p_sports_venue_id uuid,
  p_book_court_slot boolean,
  p_court_slot_minutes int,
  p_creator_encounter_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id uuid;
  v_match_id uuid;
  v_end timestamptz;
  v_code text;
  v_i int;
  v_found boolean;
  v_role text := lower(trim(coalesce(p_creator_encounter_role, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_type NOT IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_team_pick_type');
  END IF;

  IF v_role NOT IN ('gk', 'defensa', 'mediocampista', 'delantero') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_creator_role');
  END IF;

  v_code := NULL;
  IF p_type = 'team_pick_private'::public.match_type THEN
    v_found := false;
    FOR v_i IN 1..100 LOOP
      v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
      IF NOT EXISTS (
        SELECT 1
        FROM public.match_opportunities mo
        WHERE mo.join_code = v_code
          AND mo.type = 'team_pick_private'::public.match_type
          AND mo.status IN ('pending', 'confirmed')
      ) THEN
        v_found := true;
        EXIT;
      END IF;
    END LOOP;
    IF NOT v_found THEN
      RETURN jsonb_build_object('ok', false, 'error', 'join_code_generation_failed');
    END IF;
  END IF;

  v_reservation_id := NULL;
  IF p_book_court_slot = true AND p_sports_venue_id IS NOT NULL THEN
    v_end := p_date_time
      + (GREATEST(15, LEAST(180, COALESCE(p_court_slot_minutes, 60)))::text || ' minutes')::interval;
    BEGIN
      v_reservation_id := public.book_venue_slot(p_sports_venue_id, p_date_time, v_end);
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM ILIKE '%no_court%' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'no_court');
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'reservation_failed', 'message', SQLERRM);
    END;
  END IF;

  INSERT INTO public.match_opportunities (
    type,
    title,
    description,
    location,
    venue,
    city_id,
    date_time,
    level,
    creator_id,
    team_name,
    players_needed,
    players_joined,
    players_seek_profile,
    gender,
    status,
    sports_venue_id,
    venue_reservation_id,
    private_revuelta_team_id,
    join_code
  )
  VALUES (
    p_type,
    p_title,
    p_description,
    p_location,
    p_venue,
    p_city_id,
    p_date_time,
    p_level,
    auth.uid(),
    NULL,
    12,
    0,
    NULL,
    p_gender,
    p_status,
    p_sports_venue_id,
    v_reservation_id,
    NULL,
    v_code
  )
  RETURNING id INTO v_match_id;

  IF v_reservation_id IS NOT NULL THEN
    UPDATE public.venue_reservations
    SET match_opportunity_id = v_match_id
    WHERE id = v_reservation_id;
  END IF;

  INSERT INTO public.match_opportunity_participants (
    opportunity_id,
    user_id,
    status,
    is_goalkeeper,
    pick_team,
    encounter_lineup_role
  )
  VALUES (
    v_match_id,
    auth.uid(),
    'confirmed',
    v_role = 'gk',
    'A',
    v_role
  );

  RETURN jsonb_build_object(
    'ok', true,
    'matchId', v_match_id,
    'reservationId', v_reservation_id,
    'joinCode', v_code
  );
EXCEPTION
  WHEN OTHERS THEN
    IF v_match_id IS NOT NULL THEN
      DELETE FROM public.match_opportunities WHERE id = v_match_id;
    END IF;
    IF v_reservation_id IS NOT NULL THEN
      DELETE FROM public.venue_reservations WHERE id = v_reservation_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_pick_match_opportunity(
  public.match_type,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  public.gender,
  public.match_status,
  uuid,
  boolean,
  int,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_team_pick_match_opportunity(
  public.match_type,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  public.gender,
  public.match_status,
  uuid,
  boolean,
  int,
  text
) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [061/086] 20260418130100_team_pick_reject_legacy_create_rpc.sql
-- ==============================================================================

-- Evitar crear team_pick con el RPC genérico (debe usarse create_team_pick_match_opportunity).

CREATE OR REPLACE FUNCTION public.create_match_opportunity_with_optional_reservation(
  p_type public.match_type,
  p_title text,
  p_description text,
  p_location text,
  p_venue text,
  p_city_id uuid,
  p_date_time timestamptz,
  p_level public.skill_level,
  p_team_name text,
  p_players_needed int,
  p_players_joined int,
  p_players_seek_profile text,
  p_gender public.gender,
  p_status public.match_status,
  p_sports_venue_id uuid,
  p_book_court_slot boolean,
  p_court_slot_minutes int,
  p_private_revuelta_team_id uuid,
  p_creator_is_goalkeeper boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id uuid;
  v_match_id uuid;
  v_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_type IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'use_team_pick_create_rpc');
  END IF;

  IF p_private_revuelta_team_id IS NOT NULL THEN
    IF p_type IS DISTINCT FROM 'open' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_only_open');
    END IF;
    IF NOT public.is_confirmed_team_member(p_private_revuelta_team_id, auth.uid()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_not_member');
    END IF;
  END IF;

  v_reservation_id := NULL;
  IF p_book_court_slot = true AND p_sports_venue_id IS NOT NULL AND p_type IS DISTINCT FROM 'rival' THEN
    v_end := p_date_time + (GREATEST(15, LEAST(180, COALESCE(p_court_slot_minutes, 60)))::text || ' minutes')::interval;
    BEGIN
      v_reservation_id := public.book_venue_slot(p_sports_venue_id, p_date_time, v_end);
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM ILIKE '%no_court%' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'no_court');
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'reservation_failed', 'message', SQLERRM);
    END;
  END IF;

  INSERT INTO public.match_opportunities (
    type,
    title,
    description,
    location,
    venue,
    city_id,
    date_time,
    level,
    creator_id,
    team_name,
    players_needed,
    players_joined,
    players_seek_profile,
    gender,
    status,
    sports_venue_id,
    venue_reservation_id,
    private_revuelta_team_id
  )
  VALUES (
    p_type,
    p_title,
    p_description,
    p_location,
    p_venue,
    p_city_id,
    p_date_time,
    p_level,
    auth.uid(),
    p_team_name,
    p_players_needed,
    COALESCE(p_players_joined, 0),
    CASE
      WHEN p_type = 'players' THEN NULLIF(TRIM(p_players_seek_profile), '')
      ELSE NULL
    END,
    p_gender,
    p_status,
    p_sports_venue_id,
    v_reservation_id,
    p_private_revuelta_team_id
  )
  RETURNING id INTO v_match_id;

  IF v_reservation_id IS NOT NULL THEN
    UPDATE public.venue_reservations
    SET match_opportunity_id = v_match_id
    WHERE id = v_reservation_id;
  END IF;

  IF p_type = 'open' THEN
    INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
    VALUES (v_match_id, auth.uid(), 'confirmed', COALESCE(p_creator_is_goalkeeper, false));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'matchId', v_match_id,
    'reservationId', v_reservation_id
  );
EXCEPTION
  WHEN OTHERS THEN
    IF v_match_id IS NOT NULL THEN
      DELETE FROM public.match_opportunities WHERE id = v_match_id;
    END IF;
    IF v_reservation_id IS NOT NULL THEN
      DELETE FROM public.venue_reservations WHERE id = v_reservation_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [062/086] 20260418130200_team_pick_reject_legacy_join_rpc.sql
-- ==============================================================================

-- Unirse vía join_match_opportunity no aplica a team_pick (requiere equipo + rol; siguiente bloque).

CREATE OR REPLACE FUNCTION public.join_match_opportunity(
  p_opportunity_id uuid,
  p_is_goalkeeper boolean DEFAULT false
)
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

  SELECT *
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.type IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'use_team_pick_join_rpc');
  END IF;

  IF mo.creator_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'is_creator');
  END IF;

  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  IF mo.type = 'open' AND mo.private_revuelta_team_id IS NOT NULL THEN
    IF NOT public.is_confirmed_team_member(mo.private_revuelta_team_id, auth.uid()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_requires_request');
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.user_id = auth.uid()
      AND p.status IN ('pending','confirmed')
  ) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
  VALUES (p_opportunity_id, auth.uid(), 'confirmed', COALESCE(p_is_goalkeeper, false));

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true);
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [063/086] 20260418140000_team_pick_join_rpc.sql
-- ==============================================================================

-- Unirse a partidos team_pick_* con equipo (A/B), rol de encuentro y código (privado).

CREATE OR REPLACE FUNCTION public.join_team_pick_match_opportunity(
  p_opportunity_id uuid,
  p_pick_team text,
  p_encounter_lineup_role text,
  p_join_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_team text := upper(trim(coalesce(p_pick_team, '')));
  v_role text := lower(trim(coalesce(p_encounter_lineup_role, '')));
  v_code text := trim(coalesce(p_join_code, ''));
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

  SELECT *
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.type NOT IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_team_pick');
  END IF;

  IF mo.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_open');
  END IF;

  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  IF mo.type = 'team_pick_private'::public.match_type THEN
    IF mo.join_code IS NULL OR v_code IS DISTINCT FROM mo.join_code THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_join_code');
    END IF;
  END IF;

  IF mo.creator_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'is_creator');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = p_opportunity_id
      AND p.user_id = auth.uid()
      AND p.status IN ('pending', 'confirmed')
  ) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  INSERT INTO public.match_opportunity_participants (
    opportunity_id,
    user_id,
    status,
    is_goalkeeper,
    pick_team,
    encounter_lineup_role
  )
  VALUES (
    p_opportunity_id,
    auth.uid(),
    'confirmed',
    false,
    v_team,
    v_role
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true);
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.join_team_pick_match_opportunity(
  uuid,
  text,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.join_team_pick_match_opportunity(
  uuid,
  text,
  text,
  text
) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [064/086] 20260418150000_team_pick_resolve_lineup_kick.sql
-- ==============================================================================

-- Bloque 2 (cierre): resolver partido privado por código; alineación; expulsión por organizador.

-- ---------------------------------------------------------------------------
-- 1) Vista previa + id para unirse sin haber visto el partido en listados
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_team_pick_private_join_code(p_join_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := trim(coalesce(p_join_code, ''));
  mo RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF v_code !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code_format');
  END IF;

  SELECT
    id,
    type,
    title,
    venue,
    location,
    date_time,
    level,
    gender,
    status,
    players_needed,
    players_joined
  INTO mo
  FROM public.match_opportunities
  WHERE type = 'team_pick_private'::public.match_type
    AND join_code = v_code
    AND status IN ('pending', 'confirmed')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.date_time < date_trunc('day', now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'matchId', mo.id,
    'title', mo.title,
    'venue', mo.venue,
    'location', mo.location,
    'dateTime', mo.date_time,
    'level', mo.level::text,
    'gender', mo.gender::text,
    'playersNeeded', mo.players_needed,
    'playersJoined', mo.players_joined
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_team_pick_private_join_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_team_pick_private_join_code(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Cambiar equipo/rol (uno mismo o el organizador sobre cualquiera)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_team_pick_participant_lineup(
  p_opportunity_id uuid,
  p_target_user_id uuid,
  p_pick_team text,
  p_encounter_lineup_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_team text := upper(trim(coalesce(p_pick_team, '')));
  v_role text := lower(trim(coalesce(p_encounter_lineup_role, '')));
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

  SELECT id, type, date_time, status, creator_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.type NOT IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_team_pick');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_lineup');
  END IF;

  IF NOT (
    auth.uid() = p_target_user_id
    OR auth.uid() = mo.creator_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.match_opportunity_participants
  SET
    pick_team = v_team,
    encounter_lineup_role = v_role
  WHERE opportunity_id = p_opportunity_id
    AND user_id = p_target_user_id
    AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rule', 'message', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.set_team_pick_participant_lineup(
  uuid,
  uuid,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_team_pick_participant_lineup(
  uuid,
  uuid,
  text,
  text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Expulsar participante (solo organizador; no al creador)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.organizer_remove_team_pick_participant(
  p_opportunity_id uuid,
  p_target_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_reason text := trim(coalesce(p_reason, ''));
  v_note text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, type, date_time, status, creator_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF mo.creator_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF mo.type NOT IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_team_pick');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_remove');
  END IF;

  IF p_target_user_id = mo.creator_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_remove_creator');
  END IF;

  v_note := 'Organizador: ' || v_reason;

  UPDATE public.match_opportunity_participants
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = v_note
  WHERE opportunity_id = p_opportunity_id
    AND user_id = p_target_user_id
    AND status IN ('pending', 'confirmed');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_remove_team_pick_participant(
  uuid,
  uuid,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.organizer_remove_team_pick_participant(
  uuid,
  uuid,
  text
) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [065/086] 20260418210000_team_pick_team_colors.sql
-- ==============================================================================

-- Colores identificadores Equipo A / B para modos team_pick_* + ampliación del RPC de creación.

ALTER TABLE public.match_opportunities
  ADD COLUMN IF NOT EXISTS team_pick_color_a text,
  ADD COLUMN IF NOT EXISTS team_pick_color_b text;

COMMENT ON COLUMN public.match_opportunities.team_pick_color_a IS
  'Color equipo A (#RRGGBB). Solo team_pick_public / team_pick_private.';
COMMENT ON COLUMN public.match_opportunities.team_pick_color_b IS
  'Color equipo B (#RRGGBB). Solo team_pick_public / team_pick_private.';

UPDATE public.match_opportunities
SET
  team_pick_color_a = coalesce(team_pick_color_a, '#16a34a'),
  team_pick_color_b = coalesce(team_pick_color_b, '#2563eb')
WHERE type IN (
  'team_pick_public'::public.match_type,
  'team_pick_private'::public.match_type
);

ALTER TABLE public.match_opportunities
  DROP CONSTRAINT IF EXISTS match_opportunities_team_pick_colors_hex_ck;

ALTER TABLE public.match_opportunities
  ADD CONSTRAINT match_opportunities_team_pick_colors_hex_ck
  CHECK (
    (type IS DISTINCT FROM 'team_pick_public'::public.match_type
     AND type IS DISTINCT FROM 'team_pick_private'::public.match_type)
    OR (
      team_pick_color_a IS NOT NULL
      AND team_pick_color_b IS NOT NULL
      AND team_pick_color_a ~ '^#[0-9A-Fa-f]{6}$'
      AND team_pick_color_b ~ '^#[0-9A-Fa-f]{6}$'
    )
  );

-- Reemplazar firma del RPC (añade colores).
DROP FUNCTION IF EXISTS public.create_team_pick_match_opportunity(
  public.match_type,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  public.gender,
  public.match_status,
  uuid,
  boolean,
  int,
  text
);

CREATE OR REPLACE FUNCTION public.create_team_pick_match_opportunity(
  p_type public.match_type,
  p_title text,
  p_description text,
  p_location text,
  p_venue text,
  p_city_id uuid,
  p_date_time timestamptz,
  p_level public.skill_level,
  p_gender public.gender,
  p_status public.match_status,
  p_sports_venue_id uuid,
  p_book_court_slot boolean,
  p_court_slot_minutes int,
  p_creator_encounter_role text,
  p_team_pick_color_a text,
  p_team_pick_color_b text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id uuid;
  v_match_id uuid;
  v_end timestamptz;
  v_code text;
  v_i int;
  v_found boolean;
  v_role text := lower(trim(coalesce(p_creator_encounter_role, '')));
  v_ca text := trim(coalesce(p_team_pick_color_a, ''));
  v_cb text := trim(coalesce(p_team_pick_color_b, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_type NOT IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_team_pick_type');
  END IF;

  IF v_role NOT IN ('gk', 'defensa', 'mediocampista', 'delantero') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_creator_role');
  END IF;

  IF v_ca !~ '^#[0-9A-Fa-f]{6}$' OR v_cb !~ '^#[0-9A-Fa-f]{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_team_colors');
  END IF;

  v_code := NULL;
  IF p_type = 'team_pick_private'::public.match_type THEN
    v_found := false;
    FOR v_i IN 1..100 LOOP
      v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
      IF NOT EXISTS (
        SELECT 1
        FROM public.match_opportunities mo
        WHERE mo.join_code = v_code
          AND mo.type = 'team_pick_private'::public.match_type
          AND mo.status IN ('pending', 'confirmed')
      ) THEN
        v_found := true;
        EXIT;
      END IF;
    END LOOP;
    IF NOT v_found THEN
      RETURN jsonb_build_object('ok', false, 'error', 'join_code_generation_failed');
    END IF;
  END IF;

  v_reservation_id := NULL;
  IF p_book_court_slot = true AND p_sports_venue_id IS NOT NULL THEN
    v_end := p_date_time
      + (GREATEST(15, LEAST(180, COALESCE(p_court_slot_minutes, 60)))::text || ' minutes')::interval;
    BEGIN
      v_reservation_id := public.book_venue_slot(p_sports_venue_id, p_date_time, v_end);
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM ILIKE '%no_court%' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'no_court');
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'reservation_failed', 'message', SQLERRM);
    END;
  END IF;

  INSERT INTO public.match_opportunities (
    type,
    title,
    description,
    location,
    venue,
    city_id,
    date_time,
    level,
    creator_id,
    team_name,
    players_needed,
    players_joined,
    players_seek_profile,
    gender,
    status,
    sports_venue_id,
    venue_reservation_id,
    private_revuelta_team_id,
    join_code,
    team_pick_color_a,
    team_pick_color_b
  )
  VALUES (
    p_type,
    p_title,
    p_description,
    p_location,
    p_venue,
    p_city_id,
    p_date_time,
    p_level,
    auth.uid(),
    NULL,
    12,
    0,
    NULL,
    p_gender,
    p_status,
    p_sports_venue_id,
    v_reservation_id,
    NULL,
    v_code,
    lower(v_ca),
    lower(v_cb)
  )
  RETURNING id INTO v_match_id;

  IF v_reservation_id IS NOT NULL THEN
    UPDATE public.venue_reservations
    SET match_opportunity_id = v_match_id
    WHERE id = v_reservation_id;
  END IF;

  INSERT INTO public.match_opportunity_participants (
    opportunity_id,
    user_id,
    status,
    is_goalkeeper,
    pick_team,
    encounter_lineup_role
  )
  VALUES (
    v_match_id,
    auth.uid(),
    'confirmed',
    v_role = 'gk',
    'A',
    v_role
  );

  RETURN jsonb_build_object(
    'ok', true,
    'matchId', v_match_id,
    'reservationId', v_reservation_id,
    'joinCode', v_code
  );
EXCEPTION
  WHEN OTHERS THEN
    IF v_match_id IS NOT NULL THEN
      DELETE FROM public.match_opportunities WHERE id = v_match_id;
    END IF;
    IF v_reservation_id IS NOT NULL THEN
      DELETE FROM public.venue_reservations WHERE id = v_reservation_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_pick_match_opportunity(
  public.match_type,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  public.gender,
  public.match_status,
  uuid,
  boolean,
  int,
  text,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_team_pick_match_opportunity(
  public.match_type,
  text,
  text,
  text,
  text,
  uuid,
  timestamptz,
  public.skill_level,
  public.gender,
  public.match_status,
  uuid,
  boolean,
  int,
  text,
  text,
  text
) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [066/086] 20260419153000_team_pick_private_public_listing.sql
-- ==============================================================================

-- 6vs6 privado visible en listados como el público; el código de unión solo lo ven
-- organizador, participantes activos y admin (vista cliente).

DROP POLICY IF EXISTS match_opportunities_select_authenticated ON public.match_opportunities;

CREATE POLICY match_opportunities_select_authenticated
  ON public.match_opportunities
  FOR SELECT
  TO authenticated
  USING (
    (
      type IS DISTINCT FROM 'team_pick_private'::public.match_type
    )
    OR (
      type = 'team_pick_private'::public.match_type
      AND (
        status IN ('pending', 'confirmed')
        OR creator_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.match_opportunity_participants p
          WHERE p.opportunity_id = match_opportunities.id
            AND p.user_id = auth.uid()
        )
        OR public.is_admin()
      )
    )
  );

DROP POLICY IF EXISTS match_opportunities_select_anon_open_active ON public.match_opportunities;

CREATE POLICY match_opportunities_select_anon_open_active
  ON public.match_opportunities
  FOR SELECT
  TO anon
  USING (
    status IN ('pending', 'confirmed')
    AND (
      type = 'open'::public.match_type
      OR type = 'team_pick_public'::public.match_type
      OR type = 'team_pick_private'::public.match_type
    )
  );

DROP VIEW IF EXISTS public.match_opportunities_masked;

CREATE VIEW public.match_opportunities_masked
WITH (security_invoker = false)
AS
SELECT
  mo.id,
  mo.type,
  mo.title,
  mo.description,
  mo.location,
  mo.venue,
  mo.city_id,
  mo.date_time,
  mo.level,
  mo.creator_id,
  mo.team_name,
  mo.players_needed,
  mo.players_joined,
  mo.players_seek_profile,
  mo.gender,
  mo.status,
  mo.created_at,
  mo.finalized_at,
  mo.rival_result,
  mo.casual_completed,
  mo.suspended_at,
  mo.suspended_reason,
  mo.revuelta_lineup,
  mo.revuelta_result,
  mo.rival_captain_vote_challenger,
  mo.rival_captain_vote_accepted,
  mo.rival_outcome_disputed,
  mo.match_stats_applied_at,
  mo.sports_venue_id,
  mo.venue_reservation_id,
  mo.private_revuelta_team_id,
  CASE
    WHEN mo.type IS DISTINCT FROM 'team_pick_private'::public.match_type THEN mo.join_code
    WHEN mo.creator_id IS NOT DISTINCT FROM auth.uid() THEN mo.join_code
    WHEN EXISTS (
      SELECT 1
      FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = mo.id
        AND p.user_id IS NOT DISTINCT FROM auth.uid()
        AND p.status IN ('pending', 'confirmed')
    ) THEN mo.join_code
    WHEN public.is_admin() THEN mo.join_code
    ELSE NULL
  END AS join_code,
  mo.team_pick_color_a,
  mo.team_pick_color_b
FROM public.match_opportunities mo;

COMMENT ON VIEW public.match_opportunities_masked IS
  'Lectura de oportunidades para el cliente: join_code solo en team_pick_private si aplica.';

GRANT SELECT ON public.match_opportunities_masked TO anon, authenticated, service_role;

-- La vista usa is_admin(); sin esto una lectura anon fallaría al evaluar la expresión.
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [067/086] 20260419170000_team_pick_join_code_column_privileges.sql
-- ==============================================================================

-- Cierra la filtración del código por SELECT directo a match_opportunities:
-- - Vista match_opportunities_masked con privilegios del propietario (security_invoker=false)
--   así el CASE puede leer mo.join_code sin conceder esa columna a anon/authenticated.
-- - REVOKE SELECT(join_code) en la tabla para anon/authenticated (las lecturas REST van por la vista).

DROP VIEW IF EXISTS public.match_opportunities_masked;

CREATE VIEW public.match_opportunities_masked
WITH (security_invoker = false)
AS
SELECT
  mo.id,
  mo.type,
  mo.title,
  mo.description,
  mo.location,
  mo.venue,
  mo.city_id,
  mo.date_time,
  mo.level,
  mo.creator_id,
  mo.team_name,
  mo.players_needed,
  mo.players_joined,
  mo.players_seek_profile,
  mo.gender,
  mo.status,
  mo.created_at,
  mo.finalized_at,
  mo.rival_result,
  mo.casual_completed,
  mo.suspended_at,
  mo.suspended_reason,
  mo.revuelta_lineup,
  mo.revuelta_result,
  mo.rival_captain_vote_challenger,
  mo.rival_captain_vote_accepted,
  mo.rival_outcome_disputed,
  mo.match_stats_applied_at,
  mo.sports_venue_id,
  mo.venue_reservation_id,
  mo.private_revuelta_team_id,
  CASE
    WHEN mo.type IS DISTINCT FROM 'team_pick_private'::public.match_type THEN mo.join_code
    WHEN mo.creator_id IS NOT DISTINCT FROM auth.uid() THEN mo.join_code
    WHEN EXISTS (
      SELECT 1
      FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = mo.id
        AND p.user_id IS NOT DISTINCT FROM auth.uid()
        AND p.status IN ('pending', 'confirmed')
    ) THEN mo.join_code
    WHEN public.is_admin() THEN mo.join_code
    ELSE NULL
  END AS join_code,
  mo.team_pick_color_a,
  mo.team_pick_color_b
FROM public.match_opportunities mo;

COMMENT ON VIEW public.match_opportunities_masked IS
  'Lectura cliente PostgREST: join_code en team_pick_private solo si aplica; invocación con privilegios del dueño de la vista sobre la tabla base.';

GRANT SELECT ON public.match_opportunities_masked TO anon, authenticated, service_role;

-- Sin acceso directo al código en la tabla para roles del cliente (PostgREST).
REVOKE SELECT (join_code) ON public.match_opportunities FROM PUBLIC;
REVOKE SELECT (join_code) ON public.match_opportunities FROM anon;
REVOKE SELECT (join_code) ON public.match_opportunities FROM authenticated;

-- Scripts servidor / panel con service_role pueden seguir leyendo la columna en la tabla.
GRANT SELECT (join_code) ON public.match_opportunities TO service_role;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [068/086] 20260423100000_in_app_notifications.sql
-- ==============================================================================

-- Notificaciones in-app por usuario
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (
    type in (
      'chat_message',
      'match_invitation',
      'match_upcoming_2h',
      'match_finished_review_pending'
    )
  ),
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

create index if not exists idx_notifications_user_created_desc
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_read_created_desc
  on public.notifications (user_id, is_read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists notifications_insert_service_role on public.notifications;
create policy notifications_insert_service_role
  on public.notifications
  for insert
  to service_role
  with check (true);

drop policy if exists notifications_delete_service_role on public.notifications;
create policy notifications_delete_service_role
  on public.notifications
  for delete
  to service_role
  using (true);

grant select, update on public.notifications to authenticated;

-- Mantiene solo 30 notificaciones por usuario y limpia >30 días.
create or replace function public.prune_notifications_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  delete from public.notifications
  where user_id = p_user_id
    and created_at < now() - interval '30 days';

  delete from public.notifications n
  where n.user_id = p_user_id
    and n.id in (
      select x.id
      from (
        select id,
               row_number() over (order by created_at desc, id desc) as rn
        from public.notifications
        where user_id = p_user_id
      ) as x
      where x.rn > 30
    );
end;
$$;

revoke all on function public.prune_notifications_for_user(uuid) from public;
grant execute on function public.prune_notifications_for_user(uuid) to service_role;

create or replace function public.notifications_after_write_prune()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.prune_notifications_for_user(new.user_id);
  return new;
end;
$$;

drop trigger if exists trg_notifications_after_insert_prune on public.notifications;
create trigger trg_notifications_after_insert_prune
after insert on public.notifications
for each row execute function public.notifications_after_write_prune();

-- Marca todas las notificaciones propias como leídas
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_count integer := 0;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return 0;
  end if;

  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where user_id = v_uid
    and is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;


-- ==============================================================================
-- [069/086] 20260423110000_notifications_event_triggers.sql
-- ==============================================================================

-- Generación automática de notificaciones in-app desde eventos existentes:
-- 1) Mensajes de chat del partido
-- 2) Partido finalizado pendiente de reseña

create or replace function public.notify_match_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_title text;
  v_sender_name text;
  v_body text;
begin
  select mo.title
    into v_match_title
  from public.match_opportunities mo
  where mo.id = new.opportunity_id;

  select p.name
    into v_sender_name
  from public.profiles p
  where p.id = new.sender_id;

  v_match_title := coalesce(nullif(trim(v_match_title), ''), 'Partido');
  v_sender_name := coalesce(nullif(trim(v_sender_name), ''), 'Jugador');
  v_body := coalesce(left(trim(new.content), 140), '');

  insert into public.notifications (user_id, type, title, body, payload)
  select recipient_id,
         'chat_message',
         v_sender_name || ' envió un mensaje',
         case
           when v_body <> '' then v_body
           else 'Nuevo mensaje en "' || v_match_title || '".'
         end,
         jsonb_build_object(
           'targetTab', 'chats',
           'matchId', new.opportunity_id::text,
           'chatId', new.opportunity_id::text
         )
  from (
    select mo.creator_id as recipient_id
    from public.match_opportunities mo
    where mo.id = new.opportunity_id
    union
    select p.user_id as recipient_id
    from public.match_opportunity_participants p
    where p.opportunity_id = new.opportunity_id
      and p.status in ('pending', 'confirmed', 'invited')
  ) recipients
  where recipient_id is not null
    and recipient_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_match_chat_message on public.messages;
create trigger trg_notify_match_chat_message
after insert on public.messages
for each row execute function public.notify_match_chat_message();

create or replace function public.notify_match_finished_review_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_title text;
begin
  if not (
    old.status is distinct from new.status
    and new.status = 'completed'::public.match_status
    and new.finalized_at is not null
  ) then
    return new;
  end if;

  v_match_title := coalesce(nullif(trim(new.title), ''), 'Partido');

  insert into public.notifications (user_id, type, title, body, payload)
  select recipient_id,
         'match_finished_review_pending',
         'Partido finalizado: deja tu reseña',
         'El partido "' || v_match_title || '" finalizó. Comparte tu reseña.',
         jsonb_build_object(
           'targetTab', 'finished',
           'matchId', new.id::text
         )
  from (
    select new.creator_id as recipient_id
    union
    select p.user_id as recipient_id
    from public.match_opportunity_participants p
    where p.opportunity_id = new.id
      and p.status = 'confirmed'
  ) recipients
  where recipient_id is not null
    and not exists (
      select 1
      from public.match_opportunity_ratings mor
      where mor.opportunity_id = new.id
        and mor.rater_id = recipient_id
    );

  return new;
end;
$$;

drop trigger if exists trg_notify_match_finished_review_pending on public.match_opportunities;
create trigger trg_notify_match_finished_review_pending
after update on public.match_opportunities
for each row execute function public.notify_match_finished_review_pending();


-- ==============================================================================
-- [070/086] 20260423113000_notifications_invitation_and_upcoming.sql
-- ==============================================================================

-- Notificaciones automáticas:
-- 1) Invitación a partido cuando se inserta participante con status='invited'
-- 2) Recordatorio 2h antes (ejecutable vía cron/API)

create or replace function public.notify_match_invitation_on_participant_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_title text;
begin
  if new.status is distinct from 'invited'::public.participant_status then
    return new;
  end if;

  select mo.title
    into v_match_title
  from public.match_opportunities mo
  where mo.id = new.opportunity_id;

  v_match_title := coalesce(nullif(trim(v_match_title), ''), 'Partido');

  insert into public.notifications (user_id, type, title, body, payload)
  select new.user_id,
         'match_invitation',
         'Te invitaron a un partido',
         'Tienes una invitación para "' || v_match_title || '".',
         jsonb_build_object(
           'targetTab', 'invitations',
           'matchId', new.opportunity_id::text
         )
  where not exists (
    select 1
    from public.notifications n
    where n.user_id = new.user_id
      and n.type = 'match_invitation'
      and coalesce(n.payload->>'matchId', '') = new.opportunity_id::text
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_match_invitation_on_participant_insert on public.match_opportunity_participants;
create trigger trg_notify_match_invitation_on_participant_insert
after insert on public.match_opportunity_participants
for each row execute function public.notify_match_invitation_on_participant_insert();

create or replace function public.create_match_upcoming_2h_notifications(
  p_window_from timestamptz default (now() + interval '1 hour 50 minutes'),
  p_window_to timestamptz default (now() + interval '2 hours 10 minutes')
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  insert into public.notifications (user_id, type, title, body, payload)
  select recipients.user_id,
         'match_upcoming_2h',
         'Tu partido empieza en 2 horas',
         'Recuerda tu partido "' || recipients.match_title || '" en ' || recipients.venue || '.',
         jsonb_build_object(
           'targetTab', 'upcoming',
           'matchId', recipients.match_id::text
         )
  from (
    select mo.id as match_id,
           mo.title as match_title,
           mo.venue,
           mo.creator_id as user_id
    from public.match_opportunities mo
    where mo.status in ('pending'::public.match_status, 'confirmed'::public.match_status)
      and mo.date_time >= p_window_from
      and mo.date_time < p_window_to
    union
    select mo.id as match_id,
           mo.title as match_title,
           mo.venue,
           p.user_id
    from public.match_opportunities mo
    join public.match_opportunity_participants p
      on p.opportunity_id = mo.id
    where mo.status in ('pending'::public.match_status, 'confirmed'::public.match_status)
      and mo.date_time >= p_window_from
      and mo.date_time < p_window_to
      and p.status in ('pending'::public.participant_status, 'confirmed'::public.participant_status, 'invited'::public.participant_status)
  ) recipients
  where recipients.user_id is not null
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = recipients.user_id
        and n.type = 'match_upcoming_2h'
        and coalesce(n.payload->>'matchId', '') = recipients.match_id::text
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.create_match_upcoming_2h_notifications(timestamptz, timestamptz) from public;
grant execute on function public.create_match_upcoming_2h_notifications(timestamptz, timestamptz) to service_role;


-- ==============================================================================
-- [071/086] 20260423120000_participant_status_invited_fix.sql
-- ==============================================================================

-- Fix crítico: agregar estado 'invited' al enum participant_status.
-- Sin esto, los triggers de notificaciones que referencian 'invited'
-- pueden romper inserciones en messages con error 400.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'participant_status'
      and e.enumlabel = 'invited'
  ) then
    alter type public.participant_status add value 'invited';
  end if;
end
$$;


-- ==============================================================================
-- [072/086] 20260423123000_notifications_push_dispatch.sql
-- ==============================================================================

-- Marca de despacho push para notificaciones in-app.
alter table public.notifications
  add column if not exists push_sent_at timestamptz null;

create index if not exists idx_notifications_push_pending
  on public.notifications (created_at asc)
  where push_sent_at is null;


-- ==============================================================================
-- [073/086] 20260424021000_team_pick_outcome_stats.sql
-- ==============================================================================

-- Soporta resultado (A/B/empate) en selección de equipos pública/privada
-- para aplicar estadísticas de jugadores al finalizar.

CREATE OR REPLACE FUNCTION public.apply_match_stats_from_outcome(p_opp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  rc RECORD;
  uid uuid;
  ids_a uuid[];
  ids_b uuid[];
  tid_chall uuid;
  tid_acc uuid;
  org_won boolean;
BEGIN
  SELECT * INTO mo FROM public.match_opportunities WHERE id = p_opp_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF mo.status IS DISTINCT FROM 'completed'::public.match_status THEN
    RETURN;
  END IF;
  IF mo.match_stats_applied_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET stats_organized_completed = stats_organized_completed + 1
  WHERE id = mo.creator_id;

  IF mo.type = 'players'::public.match_type THEN
    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  org_won := false;

  IF mo.type = 'rival'::public.match_type AND mo.rival_result IS NOT NULL THEN
    SELECT * INTO rc
    FROM public.rival_challenges
    WHERE opportunity_id = p_opp_id AND status = 'accepted';

    IF FOUND THEN
      tid_chall := rc.challenger_team_id;
      tid_acc := rc.accepted_team_id;
      IF tid_acc IS NULL THEN
        UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
        RETURN;
      END IF;

      IF mo.rival_result = 'draw'::public.rival_result THEN
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id IN (tid_chall, tid_acc) AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams
        SET stats_draws = stats_draws + 1, stats_win_streak = 0, stats_loss_streak = 0
        WHERE id = tid_chall;
        UPDATE public.teams
        SET stats_draws = stats_draws + 1, stats_win_streak = 0, stats_loss_streak = 0
        WHERE id = tid_acc;
      ELSIF mo.rival_result = 'creator_team'::public.rival_result THEN
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_chall AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
        END LOOP;
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_acc AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams
        SET stats_wins = stats_wins + 1, stats_win_streak = stats_win_streak + 1, stats_loss_streak = 0
        WHERE id = tid_chall;
        UPDATE public.teams
        SET stats_losses = stats_losses + 1, stats_loss_streak = stats_loss_streak + 1, stats_win_streak = 0
        WHERE id = tid_acc;
        IF mo.creator_id = rc.challenger_captain_id OR EXISTS (
          SELECT 1 FROM public.team_members x WHERE x.team_id = tid_chall AND x.user_id = mo.creator_id AND x.status = 'confirmed'
        ) THEN
          org_won := true;
        END IF;
      ELSE
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_acc AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
        END LOOP;
        FOR uid IN
          SELECT tm.user_id FROM public.team_members tm
          WHERE tm.team_id = tid_chall AND tm.status = 'confirmed'::public.team_member_status
        LOOP
          UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
        END LOOP;
        UPDATE public.teams
        SET stats_wins = stats_wins + 1, stats_win_streak = stats_win_streak + 1, stats_loss_streak = 0
        WHERE id = tid_acc;
        UPDATE public.teams
        SET stats_losses = stats_losses + 1, stats_loss_streak = stats_loss_streak + 1, stats_win_streak = 0
        WHERE id = tid_chall;
        IF EXISTS (
          SELECT 1 FROM public.team_members x WHERE x.team_id = tid_acc AND x.user_id = mo.creator_id AND x.status = 'confirmed'
        ) THEN
          org_won := true;
        END IF;
      END IF;

      IF org_won THEN
        UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
      END IF;
    END IF;

    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  IF (mo.type = 'team_pick_public'::public.match_type OR mo.type = 'team_pick_private'::public.match_type)
     AND mo.revuelta_result IS NOT NULL THEN
    ids_a := ARRAY(
      SELECT mop.user_id
      FROM public.match_opportunity_participants mop
      WHERE mop.opportunity_id = p_opp_id
        AND mop.pick_team = 'A'
        AND mop.status IN ('confirmed'::public.participant_status, 'pending'::public.participant_status)
    );
    ids_b := ARRAY(
      SELECT mop.user_id
      FROM public.match_opportunity_participants mop
      WHERE mop.opportunity_id = p_opp_id
        AND mop.pick_team = 'B'
        AND mop.status IN ('confirmed'::public.participant_status, 'pending'::public.participant_status)
    );

    IF mo.revuelta_result = 'draw'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a || ids_b LOOP
        UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
      END LOOP;
    ELSIF mo.revuelta_result = 'team_a'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_a) THEN
        org_won := true;
      END IF;
    ELSE
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_b) THEN
        org_won := true;
      END IF;
    END IF;

    IF org_won THEN
      UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
    END IF;

    UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
    RETURN;
  END IF;

  IF mo.type = 'open'::public.match_type AND mo.revuelta_result IS NOT NULL AND mo.revuelta_lineup IS NOT NULL THEN
    ids_a := ARRAY(
      SELECT (jsonb_array_elements_text(mo.revuelta_lineup->'teamA'->'userIds'))::uuid
    );
    ids_b := ARRAY(
      SELECT (jsonb_array_elements_text(mo.revuelta_lineup->'teamB'->'userIds'))::uuid
    );

    IF mo.revuelta_result = 'draw'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a || ids_b LOOP
        UPDATE public.profiles SET stats_player_draws = stats_player_draws + 1 WHERE id = uid;
      END LOOP;
    ELSIF mo.revuelta_result = 'team_a'::public.revuelta_result THEN
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_a) THEN
        org_won := true;
      END IF;
    ELSE
      FOREACH uid IN ARRAY ids_b LOOP
        UPDATE public.profiles SET stats_player_wins = stats_player_wins + 1 WHERE id = uid;
      END LOOP;
      FOREACH uid IN ARRAY ids_a LOOP
        UPDATE public.profiles SET stats_player_losses = stats_player_losses + 1 WHERE id = uid;
      END LOOP;
      IF mo.creator_id = ANY (ids_b) THEN
        org_won := true;
      END IF;
    END IF;

    IF org_won THEN
      UPDATE public.profiles SET stats_organizer_wins = stats_organizer_wins + 1 WHERE id = mo.creator_id;
    END IF;
  END IF;

  UPDATE public.match_opportunities SET match_stats_applied_at = now() WHERE id = p_opp_id;
END;
$$;


-- ==============================================================================
-- [074/086] 20260424023000_team_pick_gk_sync_null_safe.sql
-- ==============================================================================

-- Evita NULL en is_goalkeeper para team_pick cuando encounter_lineup_role venga null.

CREATE OR REPLACE FUNCTION public.sync_encounter_lineup_goalkeeper_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  mo_type public.match_type;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT type INTO mo_type
  FROM public.match_opportunities
  WHERE id = NEW.opportunity_id;

  IF mo_type IS NULL
    OR mo_type NOT IN (
      'team_pick_public'::public.match_type,
      'team_pick_private'::public.match_type
    )
  THEN
    RETURN NEW;
  END IF;

  NEW.is_goalkeeper := COALESCE(NEW.encounter_lineup_role = 'gk', false);
  RETURN NEW;
END;
$$;


-- ==============================================================================
-- [075/086] 20260429120000_profiles_last_seen_at.sql
-- ==============================================================================

-- Presencia aproximada: el cliente actualiza last_seen_at (Supabase RLS, sin API heartbeat).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_seen_at IS
  'Última actividad reportada por el cliente (heartbeat). Usado para "en línea" en admin.';

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at_recent
  ON public.profiles (last_seen_at DESC)
  WHERE last_seen_at IS NOT NULL;


-- ==============================================================================
-- [076/086] 20260429200000_sports_venue_reviews.sql
-- ==============================================================================

-- Reseñas de jugadores a centros deportivos (solo reservas cancha sin partido).

CREATE TABLE public.sports_venue_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.sports_venues (id) ON DELETE CASCADE,
  venue_reservation_id UUID NOT NULL REFERENCES public.venue_reservations (id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  court_quality SMALLINT NOT NULL CHECK (court_quality >= 1 AND court_quality <= 5),
  management_rating SMALLINT NOT NULL CHECK (management_rating >= 1 AND management_rating <= 5),
  facilities_rating SMALLINT NOT NULL CHECK (facilities_rating >= 1 AND facilities_rating <= 5),
  comment TEXT,
  reviewer_name_snapshot TEXT NOT NULL CHECK (
    char_length(trim(reviewer_name_snapshot)) >= 1
    AND char_length(reviewer_name_snapshot) <= 80
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sports_venue_reviews_one_per_reservation UNIQUE (venue_reservation_id)
);

CREATE INDEX idx_sports_venue_reviews_venue ON public.sports_venue_reviews (venue_id);
CREATE INDEX idx_sports_venue_reviews_created ON public.sports_venue_reviews (venue_id, created_at DESC);

COMMENT ON TABLE public.sports_venue_reviews IS
  'Opiniones de jugadores tras reservar solo cancha; una fila por reserva.';

-- Agregados para ficha pública (lectura anon).
CREATE OR REPLACE VIEW public.sports_venue_review_stats AS
SELECT
  venue_id,
  count(*)::integer AS review_count,
  round(avg(court_quality)::numeric, 1) AS avg_court_quality,
  round(avg(management_rating)::numeric, 1) AS avg_management,
  round(avg(facilities_rating)::numeric, 1) AS avg_facilities,
  round(
    (
      avg(court_quality) + avg(management_rating) + avg(facilities_rating)
    )::numeric / 3,
    1
  ) AS avg_overall
FROM public.sports_venue_reviews
GROUP BY venue_id;

ALTER TABLE public.sports_venue_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY sports_venue_reviews_select_public
  ON public.sports_venue_reviews
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY sports_venue_reviews_insert_booker
  ON public.sports_venue_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.venue_reservations vr
      INNER JOIN public.venue_courts vc ON vc.id = vr.court_id
      WHERE vr.id = sports_venue_reviews.venue_reservation_id
        AND vr.booker_user_id = auth.uid()
        AND vr.match_opportunity_id IS NULL
        AND vr.status = 'confirmed'
        AND vc.venue_id = sports_venue_reviews.venue_id
        AND vr.ends_at < now()
    )
  );

GRANT SELECT ON public.sports_venue_reviews TO anon, authenticated;
GRANT INSERT ON public.sports_venue_reviews TO authenticated;
GRANT SELECT ON public.sports_venue_review_stats TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sports_venue_reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sports_venue_reviews;
  END IF;
END $$;


-- ==============================================================================
-- [077/086] 20260430120000_fix_revuelta_ext_req_rls_recursion.sql
-- ==============================================================================

-- Evita "infinite recursion detected in policy for relation revuelta_external_join_requests":
-- el WITH CHECK del INSERT hacía NOT EXISTS (SELECT … FROM la misma tabla), lo que reevalúa RLS en bucle.
-- Esta función corre como definer y lee la tabla sin pasar por políticas.

CREATE OR REPLACE FUNCTION public.revuelta_ext_req_has_blocking_row_for_me(p_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.revuelta_external_join_requests r0
    WHERE r0.opportunity_id = p_opportunity_id
      AND r0.requester_id = auth.uid()
      AND r0.status IN ('pending', 'accepted')
  );
$$;

REVOKE ALL ON FUNCTION public.revuelta_ext_req_has_blocking_row_for_me(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revuelta_ext_req_has_blocking_row_for_me(uuid) TO authenticated;

DROP POLICY IF EXISTS revuelta_ext_req_insert_non_member ON public.revuelta_external_join_requests;

CREATE POLICY revuelta_ext_req_insert_non_member
  ON public.revuelta_external_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_opportunities mo
      WHERE mo.id = opportunity_id
        AND mo.private_revuelta_team_id IS NOT NULL
        AND mo.type = 'open'
        AND mo.status IN ('pending', 'confirmed')
        AND NOT public.is_confirmed_team_member(mo.private_revuelta_team_id, auth.uid())
    )
    AND NOT public.revuelta_ext_req_has_blocking_row_for_me(opportunity_id)
  );


-- ==============================================================================
-- [078/086] 20260431130000_matches_hub_and_detail_ratings_bundle_rpc.sql
-- ==============================================================================

-- Fase 4: un solo round-trip PostgREST para datos del hub de partidos y para el bloque de reseñas en detalle.
-- SECURITY INVOKER: aplica RLS de messages, match_opportunity_ratings y sports_venue_reviews.

CREATE OR REPLACE FUNCTION public.matches_hub_secondary_bundle(
  p_finished_opp_ids uuid[],
  p_chat_opp_ids uuid[],
  p_reservation_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'rating_rows',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT
            mor.opportunity_id,
            mor.organizer_rating,
            mor.match_rating,
            mor.level_rating
          FROM public.match_opportunity_ratings mor
          WHERE mor.opportunity_id = ANY (COALESCE(p_finished_opp_ids, '{}'::uuid[]))
        ) t
      ),
      '[]'::jsonb
    ),
    'last_messages',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT DISTINCT ON (m.opportunity_id)
            m.opportunity_id,
            m.content,
            m.created_at
          FROM public.messages m
          WHERE m.opportunity_id = ANY (COALESCE(p_chat_opp_ids, '{}'::uuid[]))
          ORDER BY m.opportunity_id, m.created_at DESC
        ) t
      ),
      '[]'::jsonb
    ),
    'venue_reviews',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT
            r.venue_reservation_id,
            r.court_quality,
            r.management_rating,
            r.facilities_rating,
            r.comment
          FROM public.sports_venue_reviews r
          WHERE r.venue_reservation_id = ANY (COALESCE(p_reservation_ids, '{}'::uuid[]))
        ) t
      ),
      '[]'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.matches_hub_secondary_bundle(uuid[], uuid[], uuid[]) IS
  'Hub Partidos: ratings por oportunidad, último mensaje por chat y reseñas de reservas solo (Fase 4).';

CREATE OR REPLACE FUNCTION public.match_detail_ratings_bundle(p_opportunity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'rating_rows',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT
            mor.opportunity_id,
            mor.organizer_rating,
            mor.match_rating,
            mor.level_rating
          FROM public.match_opportunity_ratings mor
          WHERE mor.opportunity_id = p_opportunity_id
        ) t
      ),
      '[]'::jsonb
    ),
    'comments',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT mor.comment, mor.created_at
          FROM public.match_opportunity_ratings mor
          WHERE mor.opportunity_id = p_opportunity_id
            AND mor.comment IS NOT NULL
            AND trim(mor.comment) <> ''
          ORDER BY mor.created_at DESC
          LIMIT 4
        ) t
      ),
      '[]'::jsonb
    ),
    'my_rating',
    (
      SELECT to_jsonb(t)
      FROM (
        SELECT
          mor.id,
          mor.opportunity_id,
          mor.rater_id,
          mor.organizer_rating,
          mor.match_rating,
          mor.level_rating,
          mor.comment,
          mor.created_at
        FROM public.match_opportunity_ratings mor
        WHERE mor.opportunity_id = p_opportunity_id
          AND mor.rater_id = auth.uid()
        LIMIT 1
      ) t
    )
  );
$$;

COMMENT ON FUNCTION public.match_detail_ratings_bundle(uuid) IS
  'Detalle partido: filas de reseñas, comentarios recientes y mi reseña (Fase 4).';

GRANT EXECUTE ON FUNCTION public.matches_hub_secondary_bundle(uuid[], uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_detail_ratings_bundle(uuid) TO authenticated;


-- ==============================================================================
-- [079/086] 20260431140000_reschedule_match_unlink_venue_reservation.sql
-- ==============================================================================

-- Reprogramar con reserva vinculada: desvincular y cancelar la reserva como organizador/reservador
-- sin disparar la cancelación del partido (trigger exige match_opportunity_id NULL al pasar a cancelled).

CREATE OR REPLACE FUNCTION public.reschedule_match_opportunity_with_reason(
  p_opportunity_id UUID,
  p_new_venue TEXT,
  p_new_location TEXT,
  p_new_date_time TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_new_venue TEXT := trim(coalesce(p_new_venue, ''));
  v_new_location TEXT := trim(coalesce(p_new_location, ''));
  v_reason TEXT := trim(coalesce(p_reason, ''));
  v_is_sensitive_change BOOLEAN := false;
  v_res_booker UUID;
  v_res_status public.venue_reservation_status;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_new_venue) < 3 OR char_length(v_new_location) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_location_data');
  END IF;

  IF p_new_date_time IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_datetime');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, creator_id, status, type, date_time, venue, location, venue_reservation_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF auth.uid() IS DISTINCT FROM mo.creator_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_organizer');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF mo.venue_reservation_id IS NOT NULL THEN
    SELECT booker_user_id, status
      INTO v_res_booker, v_res_status
    FROM public.venue_reservations
    WHERE id = mo.venue_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reservation_not_found');
    END IF;

    IF v_res_booker IS DISTINCT FROM auth.uid() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_reservation_booker');
    END IF;

    IF v_res_status IN ('pending', 'confirmed') THEN
      UPDATE public.venue_reservations
      SET
        match_opportunity_id = NULL,
        status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, now()),
        cancelled_reason = COALESCE(
          NULLIF(TRIM(cancelled_reason), ''),
          'Reprogramación del partido por el organizador'
        )
      WHERE id = mo.venue_reservation_id;
    ELSIF v_res_status = 'cancelled' THEN
      UPDATE public.match_opportunities
      SET
        venue_reservation_id = NULL,
        updated_at = now()
      WHERE id = mo.id;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'reservation_status_unsupported');
    END IF;
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_reschedule');
  END IF;

  IF p_new_date_time < now() + interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new_time_too_soon');
  END IF;

  IF mo.date_time = p_new_date_time
    AND mo.venue = v_new_venue
    AND mo.location = v_new_location THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_changes');
  END IF;

  v_is_sensitive_change :=
    mo.date_time IS DISTINCT FROM p_new_date_time
    OR mo.venue IS DISTINCT FROM v_new_venue;

  INSERT INTO public.match_opportunity_reschedules (
    opportunity_id,
    changed_by,
    old_venue,
    old_location,
    old_date_time,
    new_venue,
    new_location,
    new_date_time,
    reason
  )
  VALUES (
    mo.id,
    auth.uid(),
    mo.venue,
    mo.location,
    mo.date_time,
    v_new_venue,
    v_new_location,
    p_new_date_time,
    v_reason
  );

  UPDATE public.match_opportunities
  SET
    venue = v_new_venue,
    location = v_new_location,
    date_time = p_new_date_time,
    sports_venue_id = NULL,
    venue_reservation_id = NULL,
    updated_at = now()
  WHERE id = mo.id;

  IF v_is_sensitive_change THEN
    UPDATE public.match_opportunity_participants
    SET status = 'pending'
    WHERE opportunity_id = mo.id
      AND user_id <> mo.creator_id
      AND status = 'confirmed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sensitive_change', v_is_sensitive_change
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_match_opportunity_with_reason(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_match_opportunity_with_reason(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [080/086] 20260431150000_reschedule_preserve_sports_venue_when_same_text.sql
-- ==============================================================================

-- Si solo cambia fecha/hora (mismo centro y ubicación en texto), mantener sports_venue_id
-- para que sigan cargándose teléfono/WhatsApp desde sports_venues.
-- Comparación insensible a mayúsculas y espacios extremos.

CREATE OR REPLACE FUNCTION public.reschedule_match_opportunity_with_reason(
  p_opportunity_id UUID,
  p_new_venue TEXT,
  p_new_location TEXT,
  p_new_date_time TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mo RECORD;
  v_new_venue TEXT := trim(coalesce(p_new_venue, ''));
  v_new_location TEXT := trim(coalesce(p_new_location, ''));
  v_reason TEXT := trim(coalesce(p_reason, ''));
  v_is_sensitive_change BOOLEAN := false;
  v_res_booker UUID;
  v_res_status public.venue_reservation_status;
  v_same_venue_text BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF char_length(v_new_venue) < 3 OR char_length(v_new_location) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_location_data');
  END IF;

  IF p_new_date_time IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_datetime');
  END IF;

  IF char_length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT
    id,
    creator_id,
    status,
    type,
    date_time,
    venue,
    location,
    venue_reservation_id,
    sports_venue_id
    INTO mo
  FROM public.match_opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF auth.uid() IS DISTINCT FROM mo.creator_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_organizer');
  END IF;

  IF mo.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  IF mo.venue_reservation_id IS NOT NULL THEN
    SELECT booker_user_id, status
      INTO v_res_booker, v_res_status
    FROM public.venue_reservations
    WHERE id = mo.venue_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reservation_not_found');
    END IF;

    IF v_res_booker IS DISTINCT FROM auth.uid() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_reservation_booker');
    END IF;

    IF v_res_status IN ('pending', 'confirmed') THEN
      UPDATE public.venue_reservations
      SET
        match_opportunity_id = NULL,
        status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, now()),
        cancelled_reason = COALESCE(
          NULLIF(TRIM(cancelled_reason), ''),
          'Reprogramación del partido por el organizador'
        )
      WHERE id = mo.venue_reservation_id;
    ELSIF v_res_status = 'cancelled' THEN
      UPDATE public.match_opportunities
      SET
        venue_reservation_id = NULL,
        updated_at = now()
      WHERE id = mo.id;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'reservation_status_unsupported');
    END IF;
  END IF;

  IF now() > mo.date_time - interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_late_reschedule');
  END IF;

  IF p_new_date_time < now() + interval '2 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new_time_too_soon');
  END IF;

  v_same_venue_text :=
    lower(trim(coalesce(mo.venue, ''))) = lower(v_new_venue)
 AND lower(trim(coalesce(mo.location, ''))) = lower(v_new_location);

  IF mo.date_time = p_new_date_time AND v_same_venue_text THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_changes');
  END IF;

  v_is_sensitive_change :=
    mo.date_time IS DISTINCT FROM p_new_date_time
    OR mo.venue IS DISTINCT FROM v_new_venue;

  INSERT INTO public.match_opportunity_reschedules (
    opportunity_id,
    changed_by,
    old_venue,
    old_location,
    old_date_time,
    new_venue,
    new_location,
    new_date_time,
    reason
  )
  VALUES (
    mo.id,
    auth.uid(),
    mo.venue,
    mo.location,
    mo.date_time,
    v_new_venue,
    v_new_location,
    p_new_date_time,
    v_reason
  );

  UPDATE public.match_opportunities
  SET
    venue = v_new_venue,
    location = v_new_location,
    date_time = p_new_date_time,
    sports_venue_id = CASE
      WHEN v_same_venue_text THEN mo.sports_venue_id
      ELSE NULL
    END,
    venue_reservation_id = NULL,
    updated_at = now()
  WHERE id = mo.id;

  IF v_is_sensitive_change THEN
    UPDATE public.match_opportunity_participants
    SET status = 'pending'
    WHERE opportunity_id = mo.id
      AND user_id <> mo.creator_id
      AND status = 'confirmed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sensitive_change', v_is_sensitive_change
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_match_opportunity_with_reason(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_match_opportunity_with_reason(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [081/086] 20260431160000_backfill_match_opportunities_sports_venue_id.sql
-- ==============================================================================

-- Recuperar sports_venue_id cuando el texto del partido coincide con un centro
-- en la misma ciudad (p. ej. tras reprogramaciones que dejaron el enlace en null).

UPDATE public.match_opportunities mo
SET
  sports_venue_id = x.venue_id,
  updated_at = now()
FROM (
  SELECT
    mo2.id AS opp_id,
    (array_agg(sv.id ORDER BY sv.created_at))[1] AS venue_id
  FROM public.match_opportunities mo2
  INNER JOIN public.sports_venues sv
    ON sv.city_id = mo2.city_id
    AND lower(btrim(mo2.venue)) = lower(btrim(sv.name))
    AND NOT sv.is_paused
  WHERE mo2.sports_venue_id IS NULL
    AND mo2.city_id IS NOT NULL
    AND btrim(mo2.venue) <> ''
  GROUP BY mo2.id
) x
WHERE mo.id = x.opp_id;


-- ==============================================================================
-- [082/086] 20260431170000_rival_match_visibility_masked_and_rls.sql
-- ==============================================================================

-- Partidos rival en el feed: solo miembros de equipos ligados al desafío (y creador/admin).
-- La vista match_opportunities_masked usa security_invoker=false; el filtro rival va en la definición.

DROP POLICY IF EXISTS rival_challenges_select_related ON public.rival_challenges;

CREATE POLICY rival_challenges_select_related
  ON public.rival_challenges
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR challenger_captain_id = auth.uid()
    OR challenged_captain_id = auth.uid()
    OR accepted_captain_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.team_id = rival_challenges.challenger_team_id
    )
    OR (
      rival_challenges.challenged_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.team_id = rival_challenges.challenged_team_id
      )
    )
    OR (
      rival_challenges.accepted_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.team_id = rival_challenges.accepted_team_id
      )
    )
    OR (
      mode = 'open'
      AND status = 'pending'
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.team_id = rival_challenges.challenger_team_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.teams t
        WHERE t.id IS DISTINCT FROM rival_challenges.challenger_team_id
          AND (
            t.captain_id = auth.uid()
            OR t.vice_captain_id = auth.uid()
          )
      )
    )
  );

DROP VIEW IF EXISTS public.match_opportunities_masked;

CREATE VIEW public.match_opportunities_masked
WITH (security_invoker = false)
AS
SELECT
  mo.id,
  mo.type,
  mo.title,
  mo.description,
  mo.location,
  mo.venue,
  mo.city_id,
  mo.date_time,
  mo.level,
  mo.creator_id,
  mo.team_name,
  mo.players_needed,
  mo.players_joined,
  mo.players_seek_profile,
  mo.gender,
  mo.status,
  mo.created_at,
  mo.finalized_at,
  mo.rival_result,
  mo.casual_completed,
  mo.suspended_at,
  mo.suspended_reason,
  mo.revuelta_lineup,
  mo.revuelta_result,
  mo.rival_captain_vote_challenger,
  mo.rival_captain_vote_accepted,
  mo.rival_outcome_disputed,
  mo.match_stats_applied_at,
  mo.sports_venue_id,
  mo.venue_reservation_id,
  mo.private_revuelta_team_id,
  CASE
    WHEN mo.type IS DISTINCT FROM 'team_pick_private'::public.match_type THEN mo.join_code
    WHEN mo.creator_id IS NOT DISTINCT FROM auth.uid() THEN mo.join_code
    WHEN EXISTS (
      SELECT 1
      FROM public.match_opportunity_participants p
      WHERE p.opportunity_id = mo.id
        AND p.user_id IS NOT DISTINCT FROM auth.uid()
        AND p.status IN ('pending', 'confirmed')
    ) THEN mo.join_code
    WHEN public.is_admin() THEN mo.join_code
    ELSE NULL
  END AS join_code,
  mo.team_pick_color_a,
  mo.team_pick_color_b
FROM public.match_opportunities mo
WHERE
  mo.type IS DISTINCT FROM 'rival'::public.match_type
  OR (
    auth.uid() IS NOT NULL
    AND (
      mo.creator_id IS NOT DISTINCT FROM auth.uid()
      OR public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.rival_challenges rc
        WHERE rc.opportunity_id = mo.id
          AND (
            EXISTS (
              SELECT 1
              FROM public.team_members tm
              WHERE tm.team_id = rc.challenger_team_id
                AND tm.user_id IS NOT DISTINCT FROM auth.uid()
            )
            OR (
              rc.challenged_team_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = rc.challenged_team_id
                  AND tm.user_id IS NOT DISTINCT FROM auth.uid()
              )
            )
            OR (
              rc.accepted_team_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = rc.accepted_team_id
                  AND tm.user_id IS NOT DISTINCT FROM auth.uid()
              )
            )
          )
      )
    )
  );

COMMENT ON VIEW public.match_opportunities_masked IS
  'Lectura cliente PostgREST: join_code en team_pick_private solo si aplica; partidos rival solo visibles para miembros de equipos del desafío o creador/admin.';

GRANT SELECT ON public.match_opportunities_masked TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [083/086] 20260431180000_sync_reservation_price_when_court_price_updates.sql
-- ==============================================================================

-- Al cambiar el precio por hora de una cancha, propagar a reservas activas
-- (pendientes o confirmadas cuyo turno aún no terminó), para que el panel
-- del centro y los partidos vinculados muestren el valor vigente.

CREATE OR REPLACE FUNCTION public.sync_future_reservations_price_from_court()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.price_per_hour IS DISTINCT FROM OLD.price_per_hour) THEN
    UPDATE public.venue_reservations r
    SET price_per_hour = NEW.price_per_hour
    WHERE r.court_id = NEW.id
      AND r.status IN (
        'pending'::public.venue_reservation_status,
        'confirmed'::public.venue_reservation_status
      )
      AND r.ends_at > now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_future_reservations_price_from_court() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_venue_courts_price_sync_future_reservations ON public.venue_courts;

CREATE TRIGGER trg_venue_courts_price_sync_future_reservations
  AFTER UPDATE OF price_per_hour ON public.venue_courts
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_future_reservations_price_from_court();

COMMENT ON FUNCTION public.sync_future_reservations_price_from_court IS
  'Copia el nuevo price_per_hour de venue_courts a venue_reservations futuras al editar tarifa.';

-- Alinear datos ya existentes: reservas no finalizadas con el precio actual de la cancha.
UPDATE public.venue_reservations r
SET price_per_hour = c.price_per_hour
FROM public.venue_courts c
WHERE r.court_id = c.id
  AND r.status IN (
    'pending'::public.venue_reservation_status,
    'confirmed'::public.venue_reservation_status
  )
  AND r.ends_at > now()
  AND (r.price_per_hour IS DISTINCT FROM c.price_per_hour);

NOTIFY pgrst, 'reload schema';


-- ==============================================================================
-- [084/086] 20260431180200_ratings_remove_48h_window.sql
-- ==============================================================================

-- Calificaciones: sin límite de 48 h tras finalized_at.
-- Política INSERT alineada con el trigger (sin ventana temporal).
-- Función solo con SQL en subconsultas (sin DECLARE) para evitar errores de parseo en el SQL Editor.

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

  IF NOT EXISTS (
    SELECT 1
    FROM public.match_opportunities
    WHERE public.match_opportunities.id = NEW.opportunity_id
      AND public.match_opportunities.creator_id = NEW.rater_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.match_opportunity_participants
    WHERE match_opportunity_participants.opportunity_id = NEW.opportunity_id
      AND match_opportunity_participants.user_id = NEW.rater_id
      AND match_opportunity_participants.status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'Solo el organizador o participantes confirmados pueden calificar';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_opportunities
    WHERE public.match_opportunities.id = NEW.opportunity_id
      AND public.match_opportunities.creator_id = NEW.rater_id
  ) THEN
    IF NEW.organizer_rating IS NOT NULL THEN
      RAISE EXCEPTION 'El organizador no califica la gestión (solo el partido en conjunto)';
    END IF;
  ELSE
    IF NEW.organizer_rating IS NULL THEN
      RAISE EXCEPTION 'Debes calificar la gestión del organizador';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS mor_insert_self_eligible ON public.match_opportunity_ratings;

CREATE POLICY mor_insert_self_eligible
  ON public.match_opportunity_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = rater_id
    AND EXISTS (
      SELECT 1
      FROM public.match_opportunities
      WHERE public.match_opportunities.id = opportunity_id
        AND public.match_opportunities.status = 'completed'::public.match_status
        AND public.match_opportunities.finalized_at IS NOT NULL
        AND (
          public.match_opportunities.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.match_opportunity_participants
            WHERE match_opportunity_participants.opportunity_id =
              public.match_opportunities.id
              AND match_opportunity_participants.user_id = auth.uid()
              AND match_opportunity_participants.status = 'confirmed'
          )
        )
    )
  );


-- ==============================================================================
-- [085/086] 20260501100000_push_subscriptions.sql
-- ==============================================================================

-- Suscripciones Web Push (una fila por usuario + endpoint de navegador/dispositivo).

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_user_endpoint_uniq UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions (user_id);

COMMENT ON TABLE public.push_subscriptions IS
  'Claves de PushSubscription del navegador; el envío lo hace el backend con web-push + VAPID.';

CREATE TRIGGER trg_push_subscriptions_updated
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_select_own
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY push_subscriptions_insert_own
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_subscriptions_update_own
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_subscriptions_delete_own
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;


-- ==============================================================================
-- [086/086] 20260501113000_admin_organizer_no_slot.sql
-- ==============================================================================

-- Admin organizer mode:
-- - partidos creados por cuentas admin no agregan al creador como participante
-- - así "Sportmatch" organiza sin ocupar cupo en revueltas/team pick

CREATE OR REPLACE FUNCTION public.create_match_opportunity_with_optional_reservation(
  p_type public.match_type,
  p_title text,
  p_description text,
  p_location text,
  p_venue text,
  p_city_id uuid,
  p_date_time timestamptz,
  p_level public.skill_level,
  p_team_name text,
  p_players_needed int,
  p_players_joined int,
  p_players_seek_profile text,
  p_gender public.gender,
  p_status public.match_status,
  p_sports_venue_id uuid,
  p_book_court_slot boolean,
  p_court_slot_minutes int,
  p_private_revuelta_team_id uuid,
  p_creator_is_goalkeeper boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id uuid;
  v_match_id uuid;
  v_end timestamptz;
  v_is_admin boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT COALESCE(p.account_type = 'admin', false)
  INTO v_is_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF p_private_revuelta_team_id IS NOT NULL THEN
    IF p_type IS DISTINCT FROM 'open' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_only_open');
    END IF;
    IF NOT public.is_confirmed_team_member(p_private_revuelta_team_id, auth.uid()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'private_revuelta_not_member');
    END IF;
  END IF;

  v_reservation_id := NULL;
  IF p_book_court_slot = true AND p_sports_venue_id IS NOT NULL AND p_type IS DISTINCT FROM 'rival' THEN
    v_end := p_date_time + (GREATEST(15, LEAST(180, COALESCE(p_court_slot_minutes, 60)))::text || ' minutes')::interval;
    BEGIN
      v_reservation_id := public.book_venue_slot(p_sports_venue_id, p_date_time, v_end);
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM ILIKE '%no_court%' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'no_court');
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'reservation_failed', 'message', SQLERRM);
    END;
  END IF;

  INSERT INTO public.match_opportunities (
    type,
    title,
    description,
    location,
    venue,
    city_id,
    date_time,
    level,
    creator_id,
    team_name,
    players_needed,
    players_joined,
    players_seek_profile,
    gender,
    status,
    sports_venue_id,
    venue_reservation_id,
    private_revuelta_team_id
  )
  VALUES (
    p_type,
    p_title,
    p_description,
    p_location,
    p_venue,
    p_city_id,
    p_date_time,
    p_level,
    auth.uid(),
    p_team_name,
    p_players_needed,
    COALESCE(p_players_joined, 0),
    CASE
      WHEN p_type = 'players' THEN NULLIF(TRIM(p_players_seek_profile), '')
      ELSE NULL
    END,
    p_gender,
    p_status,
    p_sports_venue_id,
    v_reservation_id,
    p_private_revuelta_team_id
  )
  RETURNING id INTO v_match_id;

  IF v_reservation_id IS NOT NULL THEN
    UPDATE public.venue_reservations
    SET match_opportunity_id = v_match_id
    WHERE id = v_reservation_id;
  END IF;

  IF p_type = 'open' AND NOT v_is_admin THEN
    INSERT INTO public.match_opportunity_participants (opportunity_id, user_id, status, is_goalkeeper)
    VALUES (v_match_id, auth.uid(), 'confirmed', COALESCE(p_creator_is_goalkeeper, false));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'matchId', v_match_id,
    'reservationId', v_reservation_id
  );
EXCEPTION
  WHEN OTHERS THEN
    IF v_match_id IS NOT NULL THEN
      DELETE FROM public.match_opportunities WHERE id = v_match_id;
    END IF;
    IF v_reservation_id IS NOT NULL THEN
      DELETE FROM public.venue_reservations WHERE id = v_reservation_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_team_pick_match_opportunity(
  p_type public.match_type,
  p_title text,
  p_description text,
  p_location text,
  p_venue text,
  p_city_id uuid,
  p_date_time timestamptz,
  p_level public.skill_level,
  p_gender public.gender,
  p_status public.match_status,
  p_sports_venue_id uuid,
  p_book_court_slot boolean,
  p_court_slot_minutes int,
  p_creator_encounter_role text,
  p_team_pick_color_a text,
  p_team_pick_color_b text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id uuid;
  v_match_id uuid;
  v_end timestamptz;
  v_code text;
  v_i int;
  v_found boolean;
  v_role text := lower(trim(coalesce(p_creator_encounter_role, '')));
  v_ca text := trim(coalesce(p_team_pick_color_a, ''));
  v_cb text := trim(coalesce(p_team_pick_color_b, ''));
  v_is_admin boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT COALESCE(p.account_type = 'admin', false)
  INTO v_is_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF p_type NOT IN (
    'team_pick_public'::public.match_type,
    'team_pick_private'::public.match_type
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_team_pick_type');
  END IF;

  IF v_role NOT IN ('gk', 'defensa', 'mediocampista', 'delantero') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_creator_role');
  END IF;

  IF v_ca !~ '^#[0-9A-Fa-f]{6}$' OR v_cb !~ '^#[0-9A-Fa-f]{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_team_colors');
  END IF;

  v_code := NULL;
  IF p_type = 'team_pick_private'::public.match_type THEN
    v_found := false;
    FOR v_i IN 1..100 LOOP
      v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
      IF NOT EXISTS (
        SELECT 1
        FROM public.match_opportunities mo
        WHERE mo.join_code = v_code
          AND mo.type = 'team_pick_private'::public.match_type
          AND mo.status IN ('pending', 'confirmed')
      ) THEN
        v_found := true;
        EXIT;
      END IF;
    END LOOP;
    IF NOT v_found THEN
      RETURN jsonb_build_object('ok', false, 'error', 'join_code_generation_failed');
    END IF;
  END IF;

  v_reservation_id := NULL;
  IF p_book_court_slot = true AND p_sports_venue_id IS NOT NULL THEN
    v_end := p_date_time
      + (GREATEST(15, LEAST(180, COALESCE(p_court_slot_minutes, 60)))::text || ' minutes')::interval;
    BEGIN
      v_reservation_id := public.book_venue_slot(p_sports_venue_id, p_date_time, v_end);
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM ILIKE '%no_court%' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'no_court');
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'reservation_failed', 'message', SQLERRM);
    END;
  END IF;

  INSERT INTO public.match_opportunities (
    type,
    title,
    description,
    location,
    venue,
    city_id,
    date_time,
    level,
    creator_id,
    team_name,
    players_needed,
    players_joined,
    players_seek_profile,
    gender,
    status,
    sports_venue_id,
    venue_reservation_id,
    private_revuelta_team_id,
    join_code,
    team_pick_color_a,
    team_pick_color_b
  )
  VALUES (
    p_type,
    p_title,
    p_description,
    p_location,
    p_venue,
    p_city_id,
    p_date_time,
    p_level,
    auth.uid(),
    NULL,
    12,
    0,
    NULL,
    p_gender,
    p_status,
    p_sports_venue_id,
    v_reservation_id,
    NULL,
    v_code,
    lower(v_ca),
    lower(v_cb)
  )
  RETURNING id INTO v_match_id;

  IF v_reservation_id IS NOT NULL THEN
    UPDATE public.venue_reservations
    SET match_opportunity_id = v_match_id
    WHERE id = v_reservation_id;
  END IF;

  IF NOT v_is_admin THEN
    INSERT INTO public.match_opportunity_participants (
      opportunity_id,
      user_id,
      status,
      is_goalkeeper,
      pick_team,
      encounter_lineup_role
    )
    VALUES (
      v_match_id,
      auth.uid(),
      'confirmed',
      v_role = 'gk',
      'A',
      v_role
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'matchId', v_match_id,
    'reservationId', v_reservation_id,
    'joinCode', v_code
  );
EXCEPTION
  WHEN OTHERS THEN
    IF v_match_id IS NOT NULL THEN
      DELETE FROM public.match_opportunities WHERE id = v_match_id;
    END IF;
    IF v_reservation_id IS NOT NULL THEN
      DELETE FROM public.venue_reservations WHERE id = v_reservation_id;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'server', 'message', SQLERRM);
END;
$$;

