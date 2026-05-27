
-- =========================================================
-- 1. Extend admin allowlist with tradingyadiel@gmail.com
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'phone'
  );

  IF NEW.email IN ('jkmcompany10@gmail.com', 'yadger68@gmail.com', 'tradingyadiel@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IN ('jkmcompany10@gmail.com', 'yadger68@gmail.com', 'tradingyadiel@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ensure_admin_role() FROM PUBLIC, anon, authenticated;

-- Backfill admin role for any existing matching accounts
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email IN ('jkmcompany10@gmail.com', 'yadger68@gmail.com', 'tradingyadiel@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- =========================================================
-- 2. admin_activity_logs
-- =========================================================
CREATE TABLE public.admin_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_admin_logs_actor ON public.admin_activity_logs(actor_id);
CREATE INDEX idx_admin_logs_target ON public.admin_activity_logs(target_table, target_id);

-- RLS: admins read-only; nobody can modify/delete (immutable audit log)
CREATE POLICY "Admins view audit logs"
  ON public.admin_activity_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies => only SECURITY DEFINER triggers can write

-- =========================================================
-- 3. Audit trigger: share_purchases status changes
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_purchase_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.admin_activity_logs (actor_id, action, target_table, target_id, details)
    VALUES (
      auth.uid(),
      CASE NEW.status::text
        WHEN 'approved' THEN 'approve_purchase'
        WHEN 'rejected' THEN 'reject_purchase'
        ELSE 'update_purchase'
      END,
      'share_purchases',
      NEW.id,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'from_status', OLD.status,
        'to_status', NEW.status,
        'number_of_shares', NEW.number_of_shares,
        'total_amount', NEW.total_amount
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_purchase_status() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_purchase_status
  AFTER UPDATE ON public.share_purchases
  FOR EACH ROW EXECUTE FUNCTION public.audit_purchase_status();

-- =========================================================
-- 4. Audit trigger: share_sales status changes
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_sale_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.admin_activity_logs (actor_id, action, target_table, target_id, details)
    VALUES (
      auth.uid(),
      CASE NEW.status::text
        WHEN 'approved' THEN 'approve_sale'
        WHEN 'rejected' THEN 'reject_sale'
        ELSE 'update_sale'
      END,
      'share_sales',
      NEW.id,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'from_status', OLD.status,
        'to_status', NEW.status,
        'number_of_shares', NEW.number_of_shares
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_sale_status() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_sale_status
  AFTER UPDATE ON public.share_sales
  FOR EACH ROW EXECUTE FUNCTION public.audit_sale_status();

-- =========================================================
-- 5. Audit trigger: company_growth changes
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_company_growth()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_activity_logs (actor_id, action, target_table, target_id, details)
  VALUES (
    auth.uid(),
    CASE TG_OP
      WHEN 'INSERT' THEN 'create_growth'
      WHEN 'UPDATE' THEN 'update_growth'
      WHEN 'DELETE' THEN 'delete_growth'
    END,
    'company_growth',
    COALESCE(NEW.id, OLD.id),
    CASE TG_OP
      WHEN 'DELETE' THEN jsonb_build_object('growth_percentage', OLD.growth_percentage)
      ELSE jsonb_build_object('growth_percentage', NEW.growth_percentage)
    END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_company_growth() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_company_growth
  AFTER INSERT OR UPDATE OR DELETE ON public.company_growth
  FOR EACH ROW EXECUTE FUNCTION public.audit_company_growth();
