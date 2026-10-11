// Pembantu bersama untuk integrasi Brick.
// Rahasia TIDAK ditulis di kode. Set lewat:
//   supabase secrets set BRICK_CLIENT_ID=... BRICK_CLIENT_SECRET=... BRICK_ENV=sandbox
// (BRICK_ENV = sandbox | production)
//
// CATATAN: endpoint & nama field di bawah disusun dari dokumentasi Brick yang tersedia publik
// dan BELUM diuji ke akun Brick. Pembaca respons dibuat longgar (beberapa kemungkinan nama field).
// Jalankan sekali di sandbox dan cek log fungsi (`supabase functions logs`) bila ada yang meleset.
import { createClient } from "npm:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("BRICK_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("BRICK_CLIENT_SECRET") ?? "";
export const BRICK_ENV = Deno.env.get("BRICK_ENV") ?? "sandbox";
export const API = BRICK_ENV === "production" ? "https://api.onebrick.io" : "https://sandbox.onebrick.io";
export const WIDGET = BRICK_ENV === "production"
  ? "https://cdn.onebrick.io/widget/v1/"
  : "https://cdn.onebrick.io/sandbox-widget/v1/";

export const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/* ---------- Pengguna dari JWT ---------- */
export async function userFromRequest(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

/* ---------- State bertanda tangan (menghubungkan callback Brick ke pengguna Duitie) ---------- */
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}
export async function signState(userId: string, ttlSec = 1800) {
  const body = `${userId}.${Math.floor(Date.now() / 1000) + ttlSec}`;
  return `${body}.${await hmac(body)}`;
}
export async function verifyState(state: string): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  if (sig !== await hmac(`${uid}.${exp}`)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return uid;
}

/* ---------- Panggilan Brick ---------- */
export async function publicToken(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("BRICK_CLIENT_ID / BRICK_CLIENT_SECRET belum di-set");
  const r = await fetch(`${API}/v2/data/auth/token`, {
    headers: { Authorization: "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`) },
  });
  const b = await r.json().catch(() => ({}));
  const t = b?.data?.access_token ?? b?.access_token;
  if (!r.ok || !t) throw new Error("Brick menolak pembuatan token: " + JSON.stringify(b).slice(0, 300));
  return t;
}

async function brickGet(path: string, userToken: string) {
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${userToken}`, "user-access-token": userToken },
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Brick ${path} -> ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  return b;
}
const asList = (b: any): any[] => Array.isArray(b) ? b : Array.isArray(b?.data) ? b.data : Array.isArray(b?.data?.data) ? b.data.data : [];

export type BrickAccount = { id: string; bank: string; nomor: string; pemilik: string; balance: number | null };
export async function listAccounts(userToken: string): Promise<BrickAccount[]> {
  const b = await brickGet("/v2/data/account/list", userToken);
  return asList(b).map((a: any) => ({
    id: String(a.accountId ?? a.account_id ?? a.id),
    bank: String(a.institutionName ?? a.institution?.name ?? a.bankName ?? a.institutionId ?? "Lainnya"),
    nomor: String(a.accountNumber ?? a.account_number ?? "-"),
    pemilik: String(a.accountHolder ?? a.account_holder ?? a.holderName ?? ""),
    balance: num(a.balances?.current ?? a.balances?.available ?? a.balance ?? a.currentBalance),
  }));
}

export type BrickTx = { id: string; date: string; amount: number; type: "masuk" | "keluar"; description: string };
export async function listTransactions(userToken: string, accountId: string, from: string, to: string): Promise<BrickTx[]> {
  const b = await brickGet(`/v2/data/transaction/list?account_id=${encodeURIComponent(accountId)}&from=${from}&to=${to}`, userToken);
  const out: BrickTx[] = [];
  for (const t of asList(b)) {
    const acc = t.accountId ?? t.account_id;
    if (acc && String(acc) !== accountId) continue;
    const amt = num(t.amount);
    const dir = String(t.direction ?? t.type ?? t.transactionType ?? "").toLowerCase();
    const date = String(t.date ?? t.transactionDate ?? t.timestamp ?? "").slice(0, 10);
    const id = t.id ?? t.transactionId ?? t.transaction_id;
    if (!amt || !/^\d{4}-\d{2}-\d{2}$/.test(date) || id == null) continue;
    const keluar = /^(out|debit|db|keluar)/.test(dir) || (dir === "" && amt < 0);
    out.push({ id: String(id), date, amount: Math.abs(amt), type: keluar ? "keluar" : "masuk",
      description: String(t.description ?? t.merchant ?? t.remark ?? "").replace(/\s+/g, " ").slice(0, 200) });
  }
  return out;
}
function num(v: unknown): number | null { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; }

/* ---------- Kategori otomatis & simpan ---------- */
const RULES: [string, string, RegExp][] = [
  ["masuk", "Gaji", /gaji|salary|payroll/i], ["masuk", "Bonus", /bonus|thr|insentif|komisi/i],
  ["keluar", "Makanan", /makan|resto|kfc|mcd|starbucks|kopi|cafe|warung|gofood|grabfood|shopeefood/i],
  ["keluar", "Transportasi", /gojek|gocar|goride|grab|bensin|pertamina|spbu|parkir|krl|mrt|transjakarta|tol/i],
  ["keluar", "Belanja", /tokopedia|shopee|lazada|bukalapak|blibli|indomaret|alfamart/i],
  ["keluar", "Tagihan", /pln|listrik|pdam|telkom|indihome|pulsa|bpjs|token|wifi|asuransi|cicilan|biaya adm/i],
  ["keluar", "Hiburan", /netflix|spotify|youtube|steam|bioskop|cgv|xxi|disney/i],
];
const kategori = (tipe: string, d: string) => RULES.find(([t, , re]) => t === tipe && re.test(d))?.[1] ?? "Lainnya";

export async function saveTransactions(userId: string, accountId: number, txs: BrickTx[]) {
  if (!txs.length) return 0;
  const rows = txs.map((t) => ({
    user_id: userId, account_id: accountId, tanggal: t.date, tipe: t.type, nominal: t.amount,
    kategori: kategori(t.type, t.description), keterangan: t.description, external_id: "brick-" + t.id, sumber: "sync",
  }));
  let n = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await admin.from("duitie_transactions")
      .upsert(rows.slice(i, i + 200), { onConflict: "account_id,external_id", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    n += data?.length ?? 0;
  }
  return n;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86400000));

// Tarik mutasi satu akun Brick -> simpan -> samakan saldo
export async function syncOne(userId: string, userToken: string, link: { account_id: number; provider_account_id: string }, days: number, balance?: number | null) {
  const txs = await listTransactions(userToken, link.provider_account_id, daysAgo(days), isoDay(new Date()));
  const inserted = await saveTransactions(userId, link.account_id, txs);
  if (balance !== null && balance !== undefined) await admin.rpc("duitie_set_balance", { p_account: link.account_id, p_balance: balance });
  return inserted;
}
