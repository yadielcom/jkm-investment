import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserRole } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    // Block suspended users
    const { data: suspended } = await supabase.rpc("is_suspended" as never, {
      _user_id: data.user.id,
    } as never);
    if (suspended === true) {
      await supabase.auth.signOut();
      throw redirect({ to: "/login", search: { suspended: true } });
    }
    const role = await getCurrentUserRole(data.user.id);
    return { user: data.user, role };
  },
  component: () => <Outlet />,
});
