
CREATE OR REPLACE FUNCTION public.admin_full_reset()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can perform a full system reset';
  END IF;

  -- Atomic wipe of all investment/business data. Schema, auth, profiles,
  -- roles and RLS policies are preserved.
  DELETE FROM public.transactions;
  DELETE FROM public.notifications;
  DELETE FROM public.share_purchases;
  DELETE FROM public.share_sales;
  DELETE FROM public.company_growth;

  -- Reset every wallet to zero (keep rows so users can resume investing).
  UPDATE public.wallet_balances
  SET total_shares = 0,
      total_invested = 0,
      current_value = 0,
      profit_loss = 0,
      roi = 0,
      updated_at = now();

  INSERT INTO public.admin_activity_logs (actor_id, action, target_table, target_id, details)
  VALUES (auth.uid(), 'full_system_reset', 'system', NULL,
          jsonb_build_object('reset_at', now()));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_full_reset() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_full_reset() TO authenticated;
