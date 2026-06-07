
-- 1. Add suspended column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;

-- 2. Helper: is_suspended
CREATE OR REPLACE FUNCTION public.is_suspended(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT suspended FROM public.profiles WHERE id = _user_id), false);
$$;

GRANT EXECUTE ON FUNCTION public.is_suspended(uuid) TO authenticated, anon, service_role;

-- 3. Admin: suspend/unsuspend
CREATE OR REPLACE FUNCTION public.admin_set_user_suspended(_user_id uuid, _suspended boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change suspension status';
  END IF;

  UPDATE public.profiles SET suspended = _suspended WHERE id = _user_id;

  INSERT INTO public.admin_activity_logs (actor_id, action, target_table, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN _suspended THEN 'suspend_user' ELSE 'unsuspend_user' END,
    'profiles',
    _user_id,
    jsonb_build_object('suspended', _suspended)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_suspended(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspended(uuid, boolean) TO authenticated, service_role;

-- 4. Admin: delete user fully
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Admins cannot delete their own account';
  END IF;

  DELETE FROM public.transactions      WHERE user_id = _user_id;
  DELETE FROM public.share_purchases   WHERE user_id = _user_id;
  DELETE FROM public.share_sales       WHERE user_id = _user_id;
  DELETE FROM public.notifications     WHERE user_id = _user_id;
  DELETE FROM public.wallet_balances   WHERE user_id = _user_id;
  DELETE FROM public.user_roles        WHERE user_id = _user_id;
  DELETE FROM public.profiles          WHERE id      = _user_id;
  DELETE FROM auth.users               WHERE id      = _user_id;

  INSERT INTO public.admin_activity_logs (actor_id, action, target_table, target_id, details)
  VALUES (auth.uid(), 'delete_user', 'auth.users', _user_id, jsonb_build_object('deleted_user_id', _user_id));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated, service_role;
