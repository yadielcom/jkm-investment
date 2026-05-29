import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type TableSub = {
  table: string;
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
};

/**
 * Subscribe to Postgres changes on one or more tables and run `onChange`
 * whenever anything matches. Unsubscribes on unmount.
 */
export function useRealtime(subs: TableSub[], onChange: () => void) {
  useEffect(() => {
    const channel = supabase.channel(
      `rt-${subs.map((s) => `${s.table}:${s.filter ?? "all"}`).join("|")}-${Math.random().toString(36).slice(2, 8)}`,
    );
    subs.forEach((s) => {
      channel.on(
        // @ts-expect-error supabase types are loose for postgres_changes
        "postgres_changes",
        {
          event: s.event ?? "*",
          schema: "public",
          table: s.table,
          ...(s.filter ? { filter: s.filter } : {}),
        },
        () => onChange(),
      );
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
