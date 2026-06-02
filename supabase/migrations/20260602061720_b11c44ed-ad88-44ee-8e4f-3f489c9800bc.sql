
-- 1. Widen share quantity & price columns to support decimals
ALTER TABLE public.share_purchases
  ALTER COLUMN number_of_shares TYPE NUMERIC(20,4) USING number_of_shares::numeric,
  ALTER COLUMN price_per_share  TYPE NUMERIC(14,4) USING price_per_share::numeric,
  ALTER COLUMN total_amount     TYPE NUMERIC(20,4) USING total_amount::numeric;

ALTER TABLE public.share_sales
  ALTER COLUMN number_of_shares TYPE NUMERIC(20,4) USING number_of_shares::numeric;

-- Add price_at_sale to capture sell-time price (dynamic, growth-adjusted)
ALTER TABLE public.share_sales
  ADD COLUMN IF NOT EXISTS price_at_sale NUMERIC(14,4) NOT NULL DEFAULT 1000;

ALTER TABLE public.wallet_balances
  ALTER COLUMN total_shares   TYPE NUMERIC(20,4) USING total_shares::numeric,
  ALTER COLUMN total_invested TYPE NUMERIC(20,4) USING total_invested::numeric,
  ALTER COLUMN current_value  TYPE NUMERIC(20,4) USING current_value::numeric,
  ALTER COLUMN profit_loss    TYPE NUMERIC(20,4) USING profit_loss::numeric;

ALTER TABLE public.transactions
  ALTER COLUMN amount TYPE NUMERIC(20,4) USING amount::numeric;

-- 2. Update set_purchase_total: stamp current dynamic price on insert, recompute total
CREATE OR REPLACE FUNCTION public.set_purchase_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  base NUMERIC := 1000;
  growth NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    growth := public.current_growth_pct();
    -- Always use current dynamic price at purchase time
    NEW.price_per_share := base * (1 + (growth / 100.0));
  END IF;
  NEW.total_amount := NEW.number_of_shares * NEW.price_per_share;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- 3. New trigger fn: stamp price_at_sale at insert using current dynamic price
CREATE OR REPLACE FUNCTION public.set_sale_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  base NUMERIC := 1000;
  growth NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    growth := public.current_growth_pct();
    NEW.price_at_sale := base * (1 + (growth / 100.0));
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_sale_price ON public.share_sales;
CREATE TRIGGER trg_set_sale_price
BEFORE INSERT OR UPDATE ON public.share_sales
FOR EACH ROW EXECUTE FUNCTION public.set_sale_price();

-- 4. Sell handler: use captured price_at_sale, not hardcoded 1000
CREATE OR REPLACE FUNCTION public.handle_sale_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sale_amount NUMERIC(20,4);
BEGIN
  sale_amount := NEW.number_of_shares * NEW.price_at_sale;

  IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.transactions (user_id, type, amount, status, related_sale_id)
    VALUES (NEW.user_id, 'sell', sale_amount, NEW.status, NEW.id)
    ON CONFLICT DO NOTHING;

    UPDATE public.transactions
    SET status = NEW.status, amount = sale_amount
    WHERE related_sale_id = NEW.id;

    PERFORM public.recalc_wallet(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- 5. recalc_wallet: use price_at_sale for sold proceeds; current price for valuation
CREATE OR REPLACE FUNCTION public.recalc_wallet(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  bought_shares NUMERIC(20,4);
  bought_amount NUMERIC(20,4);
  sold_shares   NUMERIC(20,4);
  sold_amount   NUMERIC(20,4);
  net_shares    NUMERIC(20,4);
  net_invested  NUMERIC(20,4);
  growth_pct    NUMERIC;
  cur_price     NUMERIC(14,4);
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

  growth_pct := public.current_growth_pct();
  cur_price  := 1000 * (1 + (growth_pct / 100.0));
  cur_value  := net_shares * cur_price;
  pl         := cur_value - net_invested;

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
$function$;

-- Backfill price_at_sale for existing rows using the current growth price
UPDATE public.share_sales
SET price_at_sale = 1000 * (1 + (public.current_growth_pct() / 100.0))
WHERE price_at_sale = 1000;

-- Recalculate all wallets so values reflect the new logic
DO $$
DECLARE u RECORD;
BEGIN
  FOR u IN SELECT user_id FROM public.wallet_balances LOOP
    PERFORM public.recalc_wallet(u.user_id);
  END LOOP;
END $$;
