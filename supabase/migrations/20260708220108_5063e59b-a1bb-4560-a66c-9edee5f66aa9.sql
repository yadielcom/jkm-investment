
-- Restore missing triggers (functions already exist). Idempotent: drop-if-exists then create.

-- share_purchases
DROP TRIGGER IF EXISTS trg_set_purchase_total ON public.share_purchases;
CREATE TRIGGER trg_set_purchase_total
  BEFORE INSERT OR UPDATE ON public.share_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_purchase_total();

DROP TRIGGER IF EXISTS trg_handle_purchase_status ON public.share_purchases;
CREATE TRIGGER trg_handle_purchase_status
  AFTER INSERT OR UPDATE ON public.share_purchases
  FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_status();

DROP TRIGGER IF EXISTS trg_audit_purchase_status ON public.share_purchases;
CREATE TRIGGER trg_audit_purchase_status
  AFTER UPDATE ON public.share_purchases
  FOR EACH ROW EXECUTE FUNCTION public.audit_purchase_status();

-- share_sales
DROP TRIGGER IF EXISTS trg_set_sale_price ON public.share_sales;
CREATE TRIGGER trg_set_sale_price
  BEFORE INSERT OR UPDATE ON public.share_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_sale_price();

DROP TRIGGER IF EXISTS trg_handle_sale_status ON public.share_sales;
CREATE TRIGGER trg_handle_sale_status
  AFTER INSERT OR UPDATE ON public.share_sales
  FOR EACH ROW EXECUTE FUNCTION public.handle_sale_status();

DROP TRIGGER IF EXISTS trg_audit_sale_status ON public.share_sales;
CREATE TRIGGER trg_audit_sale_status
  AFTER UPDATE ON public.share_sales
  FOR EACH ROW EXECUTE FUNCTION public.audit_sale_status();

-- company_growth
DROP TRIGGER IF EXISTS trg_set_growth_share_price ON public.company_growth;
CREATE TRIGGER trg_set_growth_share_price
  BEFORE INSERT ON public.company_growth
  FOR EACH ROW EXECUTE FUNCTION public.set_growth_share_price();

DROP TRIGGER IF EXISTS trg_apply_growth_to_all ON public.company_growth;
CREATE TRIGGER trg_apply_growth_to_all
  AFTER INSERT OR UPDATE ON public.company_growth
  FOR EACH ROW EXECUTE FUNCTION public.apply_growth_to_all();

DROP TRIGGER IF EXISTS trg_audit_company_growth ON public.company_growth;
CREATE TRIGGER trg_audit_company_growth
  AFTER INSERT OR UPDATE OR DELETE ON public.company_growth
  FOR EACH ROW EXECUTE FUNCTION public.audit_company_growth();

-- auth.users -> profiles + role bootstrap
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_ensure_admin ON auth.users;
CREATE TRIGGER on_auth_user_ensure_admin
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ensure_admin_role();
