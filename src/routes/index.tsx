import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserRole } from "@/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
    const role = await getCurrentUserRole(data.user.id);
    throw redirect({ to: role === "admin" ? "/admin" : "/dashboard" });
  },
  component: () => null,
});
