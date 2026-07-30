import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://aipaoavvcmpnhbwuignc.supabase.co",
  "sb_publishable_MY4BjWqmHqfONcfKuM1_5w_sPx5ZHT_",
  { auth: { persistSession: true, autoRefreshToken: true } },
);
