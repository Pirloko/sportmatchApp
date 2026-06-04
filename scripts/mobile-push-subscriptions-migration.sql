-- Tokens Expo Push para app móvil (Android/iOS).
-- Ejecutar una vez en Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS public.mobile_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  token text NOT NULL,
  provider text NOT NULL DEFAULT 'expo',
  platform text,
  device_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_push_subscriptions_user_token_uniq UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_mobile_push_subscriptions_user_id
  ON public.mobile_push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_mobile_push_subscriptions_active
  ON public.mobile_push_subscriptions (user_id)
  WHERE is_active = true;

COMMENT ON TABLE public.mobile_push_subscriptions IS
  'Tokens Expo Push (ExponentPushToken[...]) por usuario/dispositivo. Envío vía exp.host API.';

DROP TRIGGER IF EXISTS trg_mobile_push_subscriptions_updated ON public.mobile_push_subscriptions;
CREATE TRIGGER trg_mobile_push_subscriptions_updated
  BEFORE UPDATE ON public.mobile_push_subscriptions
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.mobile_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mobile_push_subscriptions_select_own ON public.mobile_push_subscriptions;
CREATE POLICY mobile_push_subscriptions_select_own
  ON public.mobile_push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS mobile_push_subscriptions_insert_own ON public.mobile_push_subscriptions;
CREATE POLICY mobile_push_subscriptions_insert_own
  ON public.mobile_push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS mobile_push_subscriptions_update_own ON public.mobile_push_subscriptions;
CREATE POLICY mobile_push_subscriptions_update_own
  ON public.mobile_push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS mobile_push_subscriptions_delete_own ON public.mobile_push_subscriptions;
CREATE POLICY mobile_push_subscriptions_delete_own
  ON public.mobile_push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobile_push_subscriptions TO authenticated;
