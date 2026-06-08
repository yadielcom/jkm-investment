
-- 1. Lock down SECURITY DEFINER function execution
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Grant EXECUTE back only to functions the client legitimately calls.
-- All of these enforce admin/role checks internally or are required by RLS.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_suspended(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_share_price(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspended(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- service_role retains full access for server-side admin paths
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_suspended(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_share_price(numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_user_suspended(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalc_wallet(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_growth_to_all() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_share_price() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_growth_pct() TO service_role;

-- 2. Tighten user_roles UPDATE policy with explicit WITH CHECK
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. Add explicit UPDATE policy on payment-screenshots bucket
DROP POLICY IF EXISTS "Users update own payment screenshot" ON storage.objects;
CREATE POLICY "Users update own payment screenshot"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payment-screenshots'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'payment-screenshots'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);
