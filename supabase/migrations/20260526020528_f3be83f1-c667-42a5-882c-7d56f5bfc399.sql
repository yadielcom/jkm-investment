
-- =========================================================
-- company_growth
-- =========================================================
CREATE TABLE public.company_growth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  growth_percentage NUMERIC(8,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.company_growth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view growth"
  ON public.company_growth FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins insert growth"
  ON public.company_growth FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update growth"
  ON public.company_growth FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete growth"
  ON public.company_growth FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- Extend wallet_balances with profit_loss + roi
-- =========================================================
ALTER TABLE public.wallet_balances
  ADD COLUMN IF NOT EXISTS profit_loss NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roi NUMERIC(10,4) NOT NULL DEFAULT 0;

-- Helper: latest growth percentage (0 if none)
CREATE OR REPLACE FUNCTION public.current_growth_pct()
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT growth_percentage FROM public.company_growth ORDER BY created_at DESC LIMIT 1),
    0
  );
$$;
REVOKE EXECUTE ON FUNCTION public.current_growth_pct() FROM PUBLIC, anon, authenticated;

-- Replace recalc_wallet to apply growth + profit/loss + ROI
CREATE OR REPLACE FUNCTION public.recalc_wallet(_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bought_shares INTEGER;
  bought_amount NUMERIC(14,2);
  sold_shares INTEGER;
  sold_amount NUMERIC(14,2);
  net_shares INTEGER;
  net_invested NUMERIC(14,2);
  growth_pct NUMERIC;
  cur_value NUMERIC(14,2);
  pl NUMERIC(14,2);
  roi_val NUMERIC(10,4);
BEGIN
  PERFORM public.ensure_wallet(_user_id);

  SELECT COALESCE(SUM(number_of_shares),0), COALESCE(SUM(total_amount),0)
    INTO bought_shares, bought_amount
  FROM public.share_purchases
  WHERE user_id = _user_id AND status = 'approved';

  SELECT COALESCE(SUM(number_of_shares),0), COALESCE(SUM(number_of_shares * 1000),0)
    INTO sold_shares, sold_amount
  FROM public.share_sales
  WHERE user_id = _user_id AND status = 'approved';

  net_shares := bought_shares - sold_shares;
  net_invested := bought_amount - sold_amount;

  growth_pct := public.current_growth_pct();
  cur_value := (net_shares * 1000) * (1 + (growth_pct / 100.0));
  pl := cur_value - net_invested;

  IF net_invested > 0 THEN
    roi_val := (pl / net_invested) * 100;
  ELSE
    roi_val := 0;
  END IF;

  UPDATE public.wallet_balances
  SET total_shares = net_shares,
      total_invested = net_invested,
      current_value = cur_value,
      profit_loss = pl,
      roi = roi_val,
      updated_at = now()
  WHERE user_id = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recalc_wallet(uuid) FROM PUBLIC, anon, authenticated;

-- Trigger: when growth changes, recalc every wallet
CREATE OR REPLACE FUNCTION public.apply_growth_to_all()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT user_id FROM public.wallet_balances LOOP
    PERFORM public.recalc_wallet(u.user_id);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_growth_to_all() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_company_growth_apply
  AFTER INSERT OR UPDATE OR DELETE ON public.company_growth
  FOR EACH ROW EXECUTE FUNCTION public.apply_growth_to_all();
