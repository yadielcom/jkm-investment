
-- 1. Add share_price column
ALTER TABLE public.company_growth
  ADD COLUMN IF NOT EXISTS share_price NUMERIC(20,6);

-- 2. Backfill compounding share_price in chronological order
DO $$
DECLARE
  r RECORD;
  prev NUMERIC := 1000;
  next_price NUMERIC;
BEGIN
  FOR r IN SELECT id, growth_percentage FROM public.company_growth ORDER BY created_at ASC LOOP
    next_price := prev * (1 + (r.growth_percentage / 100.0));
    IF next_price < 0 THEN next_price := 0; END IF;
    UPDATE public.company_growth SET share_price = next_price WHERE id = r.id;
    prev := next_price;
  END LOOP;
END$$;

-- 3. Trigger: set share_price on insert by compounding from previous latest row
CREATE OR REPLACE FUNCTION public.set_growth_share_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prev_price NUMERIC;
  new_price NUMERIC;
BEGIN
  SELECT share_price INTO prev_price
    FROM public.company_growth
    WHERE created_at < COALESCE(NEW.created_at, now())
    ORDER BY created_at DESC
    LIMIT 1;

  IF prev_price IS NULL THEN
    prev_price := 1000;
  END IF;

  new_price := prev_price * (1 + (NEW.growth_percentage / 100.0));
  IF new_price < 0 THEN new_price := 0; END IF;
  NEW.share_price := new_price;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_growth_share_price ON public.company_growth;
CREATE TRIGGER trg_set_growth_share_price
  BEFORE INSERT ON public.company_growth
  FOR EACH ROW EXECUTE FUNCTION public.set_growth_share_price();

-- 4. Helper: current compounded share price (fallback to 1000 base)
CREATE OR REPLACE FUNCTION public.current_share_price()
RETURNS NUMERIC
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT share_price FROM public.company_growth ORDER BY created_at DESC LIMIT 1),
    1000
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_share_price() TO authenticated, service_role, anon;

-- 5. Update purchase trigger to use compounded price
CREATE OR REPLACE FUNCTION public.set_purchase_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.price_per_share := public.current_share_price();
  END IF;
  NEW.total_amount := NEW.number_of_shares * NEW.price_per_share;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 6. Update sale trigger to use compounded price
CREATE OR REPLACE FUNCTION public.set_sale_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.price_at_sale := public.current_share_price();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 7. Update wallet recalculation to use compounded share price
CREATE OR REPLACE FUNCTION public.recalc_wallet(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bought_shares NUMERIC(20,4);
  bought_amount NUMERIC(20,4);
  sold_shares   NUMERIC(20,4);
  sold_amount   NUMERIC(20,4);
  net_shares    NUMERIC(20,4);
  net_invested  NUMERIC(20,4);
  cur_price     NUMERIC(20,6);
  cur_value     NUMERIC(20,4);
  pl            NUMERIC(20,4);
  roi_val       NUMERIC(10,4);
BEGIN
  PERFORM public.ensure_wallet(_user_id);

  SELECT COALESCE(SUM(number_of_shares),0), COALESCE(SUM(total_amount),0)
    INTO bought_shares, bought_amount
  FROM public.share_purchases
  WHERE user_id = _user_id AND status = 'approved';

  SELECT COALESCE(SUM(number_of_shares),0),
         COALESCE(SUM(number_of_shares * price_at_sale),0)
    INTO sold_shares, sold_amount
  FROM public.share_sales
  WHERE user_id = _user_id AND status = 'approved';

  net_shares   := bought_shares - sold_shares;
  net_invested := bought_amount - sold_amount;

  cur_price := public.current_share_price();
  cur_value := net_shares * cur_price;
  pl        := cur_value - net_invested;

  IF net_invested > 0 THEN
    roi_val := (pl / net_invested) * 100;
  ELSE
    roi_val := 0;
  END IF;

  UPDATE public.wallet_balances
  SET total_shares   = net_shares,
      total_invested = net_invested,
      current_value  = cur_value,
      profit_loss    = pl,
      roi            = roi_val,
      updated_at     = now()
  WHERE user_id = _user_id;
END;
$$;

-- 8. Recalculate every wallet so balances reflect new compounded current price
DO $$
DECLARE u RECORD;
BEGIN
  FOR u IN SELECT user_id FROM public.wallet_balances LOOP
    PERFORM public.recalc_wallet(u.user_id);
  END LOOP;
END$$;
