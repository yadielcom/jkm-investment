
CREATE OR REPLACE FUNCTION public.admin_set_share_price(new_price NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
  u RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can override the share price';
  END IF;

  IF new_price IS NULL OR new_price <= 0 THEN
    RAISE EXCEPTION 'New share price must be greater than 0';
  END IF;

  -- Insert a 0% growth row; BEFORE INSERT trigger will compute share_price from previous,
  -- then we overwrite via UPDATE (trigger only fires on INSERT) to set the override.
  INSERT INTO public.company_growth (growth_percentage)
  VALUES (0)
  RETURNING id INTO new_id;

  UPDATE public.company_growth
  SET share_price = new_price
  WHERE id = new_id;

  -- Recalculate every wallet against the new current price.
  FOR u IN SELECT user_id FROM public.wallet_balances LOOP
    PERFORM public.recalc_wallet(u.user_id);
  END LOOP;

  RETURN new_price;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_share_price(NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_share_price(NUMERIC) TO authenticated, service_role;
