
-- Re-grant EXECUTE on SECURITY DEFINER helpers that are called transitively
-- by triggers fired on user INSERTs into share_purchases / share_sales.
-- Without these, the trigger chain fails with "permission denied for function ..."
-- and the buy/sell submit silently rolls back.

GRANT EXECUTE ON FUNCTION public.current_share_price()        TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_growth_pct()         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ensure_wallet(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_wallet(uuid)          TO authenticated;

-- Admin-only full reset RPC: gated internally by has_role(...,'admin').
GRANT EXECUTE ON FUNCTION public.admin_full_reset()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_full_reset()           TO service_role;
