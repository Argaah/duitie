// Dipanggil dari aplikasi (pengguna sudah login). Mengembalikan alamat widget Brick.
// Deploy: supabase functions deploy brick-connect
import { CORS, json, publicToken, signState, userFromRequest, WIDGET, SUPABASE_URL } from "../_shared/brick.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Silakan login dulu." }, 401);
  try {
    const token = await publicToken();
    const state = await signState(user.id);
    const redirect = `${SUPABASE_URL}/functions/v1/brick-callback?state=${encodeURIComponent(state)}`;
    const url = `${WIDGET}?accessToken=${encodeURIComponent(token)}&redirect_url=${encodeURIComponent(redirect)}&user_id=${encodeURIComponent(user.id)}&country_code=id`;
    return json({ url });
  } catch (e) {
    console.error("brick-connect", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
