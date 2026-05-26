
-- Status enum
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.transaction_type AS ENUM ('buy', 'sell');

-- =========================================================
-- share_purchases
-- =========================================================
CREATE TABLE public.share_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number_of_shares INTEGER NOT NULL CHECK (number_of_shares > 0),
  price_per_share NUMERIC(12,2) NOT NULL DEFAULT 1000 CHECK (price_per_share = 1000),
  total_amount NUMERIC(14,2) NOT NULL,
  payment_method TEXT NOT NULL,
  payment_screenshot_url TEXT,
  status public.request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.share_purchases ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- share_sales
-- =========================================================
CREATE TABLE public.share_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number_of_shares INTEGER NOT NULL CHECK (number_of_shares > 0),
  status public.request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.share_sales ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- transactions
-- =========================================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  status public.request_status NOT NULL DEFAULT 'pending',
  related_purchase_id UUID REFERENCES public.share_purchases(id) ON DELETE SET NULL,
  related_sale_id UUID REFERENCES public.share_sales(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- notifications
-- =========================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read_status BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- wallet_balances (one row per user, auto-maintained)
-- =========================================================
CREATE TABLE public.wallet_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_shares INTEGER NOT NULL DEFAULT 0,
  total_invested NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- Indexes
-- =========================================================
CREATE INDEX idx_share_purchases_user ON public.share_purchases(user_id);
CREATE INDEX idx_share_sales_user ON public.share_sales(user_id);
CREATE INDEX idx_transactions_user ON public.transactions(user_id);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);

-- =========================================================
-- Triggers: auto-calc total_amount, updated_at
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_purchase_total()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.total_amount := NEW.number_of_shares * NEW.price_per_share;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_purchase_total() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_set_purchase_total
  BEFORE INSERT OR UPDATE ON public.share_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_purchase_total();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_share_sales_updated
  BEFORE UPDATE ON public.share_sales
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- Trigger: maintain wallet_balances + transactions when status changes
-- =========================================================
CREATE OR REPLACE FUNCTION public.ensure_wallet(_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.wallet_balances (user_id) VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ensure_wallet(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recalc_wallet(_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  bought_shares INTEGER;
  bought_amount NUMERIC(14,2);
  sold_shares INTEGER;
  sold_amount NUMERIC(14,2);
  net_shares INTEGER;
  net_invested NUMERIC(14,2);
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

  UPDATE public.wallet_balances
  SET total_shares = net_shares,
      total_invested = net_invested,
      current_value = net_shares * 1000,
      updated_at = now()
  WHERE user_id = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recalc_wallet(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_purchase_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
    -- Upsert linked transaction
    INSERT INTO public.transactions (user_id, type, amount, status, related_purchase_id)
    VALUES (NEW.user_id, 'buy', NEW.total_amount, NEW.status, NEW.id)
    ON CONFLICT DO NOTHING;

    UPDATE public.transactions
    SET status = NEW.status, amount = NEW.total_amount
    WHERE related_purchase_id = NEW.id;

    PERFORM public.recalc_wallet(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_purchase_status() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_purchase_status
  AFTER INSERT OR UPDATE ON public.share_purchases
  FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_status();

CREATE OR REPLACE FUNCTION public.handle_sale_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sale_amount NUMERIC(14,2);
BEGIN
  sale_amount := NEW.number_of_shares * 1000;

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
$$;
REVOKE EXECUTE ON FUNCTION public.handle_sale_status() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_sale_status
  AFTER INSERT OR UPDATE ON public.share_sales
  FOR EACH ROW EXECUTE FUNCTION public.handle_sale_status();

-- =========================================================
-- RLS policies
-- =========================================================

-- share_purchases
CREATE POLICY "Users view own purchases"
  ON public.share_purchases FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create own purchases (pending)"
  ON public.share_purchases FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins update purchases"
  ON public.share_purchases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete purchases"
  ON public.share_purchases FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- share_sales
CREATE POLICY "Users view own sales"
  ON public.share_sales FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create own sales (pending)"
  ON public.share_sales FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins update sales"
  ON public.share_sales FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete sales"
  ON public.share_sales FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- transactions (read-only to users; maintained by triggers)
CREATE POLICY "Users view own transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage transactions insert"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage transactions update"
  ON public.transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage transactions delete"
  ON public.transactions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- notifications
CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins create notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- wallet_balances (read-only to users; maintained by triggers)
CREATE POLICY "Users view own wallet"
  ON public.wallet_balances FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update wallets"
  ON public.wallet_balances FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- Storage: private bucket for payment screenshots
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-screenshots', 'payment-screenshots', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own payment screenshot"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users view own payment screenshot"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-screenshots'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Users delete own payment screenshot"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'payment-screenshots'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );
