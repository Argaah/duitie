// Dipanggil dari aplikasi (tombol "Sinkron Brick"): tarik mutasi & saldo terbaru semua rekening Brick milik pengguna.
// Deploy: supabase functions deploy brick-sync
import { admin, CORS, json, listAccounts, syncOne, userFromRequest } from "../_shared/brick.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Silakan login dulu." }, 401);
  try {
    const { data: conns } = await admin.from("duitie_brick_connections").select("access_token").eq("user_id", user.id);
    if (!conns?.length) return json({ ok: true, imported: 0, note: "Belum ada bank yang terhubung lewat Brick." });

    const { data: links } = await admin.from("duitie_provider_links")
      .select("account_id, provider_account_id").eq("user_id", user.id).eq("provider", "brick");
    const wanted = new Map((links ?? []).map((l) => [l.provider_account_id as string, l]));

    let imported = 0, errors = 0;
    for (const c of conns) {
      try {
        for (const a of await listAccounts(c.access_token)) {
          const link = wanted.get(a.id);
          if (link) imported += await syncOne(user.id, c.access_token, link as any, 14, a.balance);
        }
      } catch (e) { errors++; console.error("brick-sync", e); }
    }
    return json({ ok: errors === 0, imported, errors });
  } catch (e) {
    console.error("brick-sync", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
