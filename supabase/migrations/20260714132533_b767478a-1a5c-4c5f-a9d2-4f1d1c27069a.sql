-- Remove only redundant legacy investment triggers. Keep the canonical trigger chain.
DROP TRIGGER IF EXISTS trg_purchase_status ON public.share_purchases;
DROP TRIGGER IF EXISTS trg_sale_status ON public.share_sales;
DROP TRIGGER IF EXISTS trg_share_sales_updated ON public.share_sales;
DROP TRIGGER IF EXISTS trg_company_growth_apply ON public.company_growth;

-- This legacy constraint conflicts with the existing compounded/current-price trigger.
ALTER TABLE public.share_purchases
  DROP CONSTRAINT IF EXISTS share_purchases_price_per_share_check;

-- Remove historical duplicates before enforcing one transaction per source request.
DELETE FROM public.transactions
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY related_purchase_id
             ORDER BY created_at ASC, id ASC
           ) AS row_number
    FROM public.transactions
    WHERE related_purchase_id IS NOT NULL
  ) ranked
  WHERE row_number > 1
);

DELETE FROM public.transactions
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY related_sale_id
             ORDER BY created_at ASC, id ASC
           ) AS row_number
    FROM public.transactions
    WHERE related_sale_id IS NOT NULL
  ) ranked
  WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_one_per_purchase
  ON public.transactions (related_purchase_id)
  WHERE related_purchase_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_one_per_sale
  ON public.transactions (related_sale_id)
  WHERE related_sale_id IS NOT NULL;

-- Keep one idempotent purchase transaction, recalculate the wallet with the
-- existing formula, and notify only when an admin decision changes status.
CREATE OR REPLACE FUNCTION public.handle_purchase_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.transactions (
      user_id, type, amount, status, related_purchase_id
    )
    VALUES (
      NEW.user_id, 'buy', NEW.total_amount, NEW.status, NEW.id
    )
    ON CONFLICT (related_purchase_id)
      WHERE related_purchase_id IS NOT NULL
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      type = EXCLUDED.type,
      amount = EXCLUDED.amount,
      status = EXCLUDED.status;

    IF TG_OP = 'UPDATE'
       AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('approved', 'rejected') THEN
      INSERT INTO public.notifications (user_id, message)
      VALUES (
        NEW.user_id,
        CASE NEW.status
          WHEN 'approved' THEN 'Your purchase request for ' || NEW.number_of_shares || ' shares was approved.'
          ELSE 'Your purchase request for ' || NEW.number_of_shares || ' shares was rejected.'
        END
      );
    END IF;

    PERFORM public.recalc_wallet(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Keep one idempotent sale transaction, recalculate the wallet with the
-- existing formula, and notify only when an admin decision changes status.
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
    INSERT INTO public.transactions (
      user_id, type, amount, status, related_sale_id
    )
    VALUES (
      NEW.user_id, 'sell', sale_amount, NEW.status, NEW.id
    )
    ON CONFLICT (related_sale_id)
      WHERE related_sale_id IS NOT NULL
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      type = EXCLUDED.type,
      amount = EXCLUDED.amount,
      status = EXCLUDED.status;

    IF TG_OP = 'UPDATE'
       AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('approved', 'rejected') THEN
      INSERT INTO public.notifications (user_id, message)
      VALUES (
        NEW.user_id,
        CASE NEW.status
          WHEN 'approved' THEN 'Your sale request for ' || NEW.number_of_shares || ' shares was approved.'
          ELSE 'Your sale request for ' || NEW.number_of_shares || ' shares was rejected.'
        END
      );
    END IF;

    PERFORM public.recalc_wallet(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_purchase_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_sale_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_purchase_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_sale_status() TO service_role;

-- Repair the existing admin-only atomic reset. WHERE clauses are required by
-- the database safe-update guard. Empty growth history makes the existing
-- current_share_price() fallback return 1000 ETB and growth display return 0%.
CREATE OR REPLACE FUNCTION public.admin_full_reset()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can perform a full system reset';
  END IF;

  DELETE FROM public.transactions WHERE id IS NOT NULL;
  DELETE FROM public.notifications WHERE id IS NOT NULL;
  DELETE FROM public.share_purchases WHERE id IS NOT NULL;
  DELETE FROM public.share_sales WHERE id IS NOT NULL;
  DELETE FROM public.company_growth WHERE id IS NOT NULL;

  UPDATE public.wallet_balances
  SET total_shares = 0,
      total_invested = 0,
      current_value = 0,
      profit_loss = 0,
      roi = 0,
      updated_at = now()
  WHERE user_id IS NOT NULL;

  INSERT INTO public.admin_activity_logs (
    actor_id, action, target_table, target_id, details
  )
  VALUES (
    auth.uid(),
    'full_system_reset',
    'system',
    NULL,
    jsonb_build_object(
      'reset_at', now(),
      'share_price', 1000,
      'growth_percentage', 0
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_full_reset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_full_reset() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_full_reset() TO service_role;

-- Publish the existing RLS-protected tables used by the existing realtime hooks.
ALTER PUBLICATION supabase_realtime ADD TABLE public.share_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.share_sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_balances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.company_growth;