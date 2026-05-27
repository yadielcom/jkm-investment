import { supabase } from "@/integrations/supabase/client";

export async function getCurrentUserRole(userId: string): Promise<"admin" | "user" | null> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !data) return null;
  if (data.some((r) => r.role === "admin")) return "admin";
  if (data.some((r) => r.role === "user")) return "user";
  return null;
}

export const RISK_WARNING = "Only invest what you can afford to lose.";
