// Dipanggil oleh BRICK (bukan oleh aplikasi) setelah pengguna selesai menghubungkan bank di widget.
// Deploy: supabase functions deploy brick-callback --no-verify-jwt
// Keamanan: parameter `state` bertanda tangan HMAC dan berlaku 30 menit; tanpa itu permintaan ditolak.
import { admin, CORS, json, listAccounts, syncOne, verifyState } from "../_shared/brick.ts";

const KNOWN = ["BCA", "BNI", "BRI", "Mandiri", "BTN", "CIMB Niaga", "Permata", "BSI", "Jago", "SeaBank", "Blu", "Dana", "GoPay", "OVO", "ShopeePay", "LinkAja"];
const bankName = (raw: string) => KNOWN.find((k) => raw.toLowerCase().includes(k.toLowerCase())) ?? "Lainnya";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const userId = await verifyState(url.searchParams.get("state") ?? "");
  if (!userId) return json({ error: "state tidak valid atau kedaluwarsa" }, 401);

  try {
    const raw = await req.text();
    let body: any = {};
    try { body = JSON.parse(raw); } catch { body = Object.fromEntries(new URLSearchParams(raw)); }
    const userToken: string = body.accessToken ?? body.access_token ?? body.data?.accessToken;
    if (!userToken) return json({ error: "accessToken tidak ada di permintaan Brick" }, 400);

    await admin.from("duitie_brick_connections").insert({ user_id: userId, access_token: userToken });

    let linked = 0, imported = 0;
    for (const a of await listAccounts(userToken)) {
      const { data: ex } = await admin.from("duitie_provider_links").select("account_id")
        .eq("provider", "brick").eq("provider_account_id", a.id).maybeSingle();
      let accountId = ex?.account_id as number | undefined;
      if (!accountId) {
        const { data: acc, error } = await admin.from("duitie_bank_accounts").insert({
          user_id: userId, bank: bankName(a.bank), nomor: a.nomor, pemilik: a.pemilik || "Pemilik", saldo_awal: 0,
        }).select("id").single();
        if (error) throw error;
        accountId = acc.id;
        await admin.from("duitie_provider_links").insert({ user_id: userId, account_id: accountId, provider: "brick", provider_account_id: a.id });
        linked++;
      }
      imported += await syncOne(userId, userToken, { account_id: accountId!, provider_account_id: a.id }, 90, a.balance);
    }
    return json({ ok: true, linked, imported });
  } catch (e) {
    console.error("brick-callback", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
