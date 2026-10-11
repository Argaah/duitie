/* =====================================================
   DUITIE - modul bersama (koneksi Supabase + helper)
   Dimuat di semua halaman setelah supabase-js.
===================================================== */

const SUPABASE_URL = "https://qcdcghdzareqllatxzjo.supabase.co";
// Kunci "publishable" memang aman dipakai di browser;
// keamanan data dijaga oleh Row Level Security (lihat supabase/schema.sql).
const SUPABASE_KEY = "sb_publishable_pw3xug80NmURxtK8j9C5GA_831GmTea";

const REMEMBER_KEY = "duitie_remember";

// "Ingat saya": jika tidak dicentang, sesi hanya hidup selama tab dibuka.
const authStorage = {
    _store() {
        try {
            return localStorage.getItem(REMEMBER_KEY) === "0" ? sessionStorage : localStorage;
        } catch (e) {
            return window.sessionStorage;
        }
    },
    getItem(key) { return this._store().getItem(key); },
    setItem(key, value) { this._store().setItem(key, value); },
    removeItem(key) {
        try { localStorage.removeItem(key); } catch (e) { /* abaikan */ }
        try { sessionStorage.removeItem(key); } catch (e) { /* abaikan */ }
    }
};

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

const DEFAULT_CATEGORIES = ["Makanan", "Transportasi", "Belanja", "Hiburan", "Tagihan", "Lainnya"];
const INCOME_CATEGORIES = ["Gaji", "Uang Saku", "Bonus", "Lainnya"];
const DEFAULT_AVATAR = "assets/default-avatar.svg";

/* ---------- Autentikasi ---------- */

async function getUser() {
    const { data } = await sb.auth.getSession();
    return data.session ? data.session.user : null;
}

// Panggil di halaman yang butuh login. Mengembalikan user, atau null (dan mengalihkan ke login).
async function requireAuth() {
    const user = await getUser();
    if (!user) {
        window.location.replace("index.html");
        return null;
    }
    return user;
}

async function logout() {
    await sb.auth.signOut();
    window.location.href = "index.html";
}

/* ---------- Format & utilitas ---------- */

function rupiah(n) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(Number(n) || 0);
}

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function pad(n) { return String(n).padStart(2, "0"); }

// Tanggal lokal (bukan UTC) dalam format YYYY-MM-DD
function toISODate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayISO() { return toISODate(new Date()); }

// Parse "YYYY-MM-DD" sebagai tanggal lokal
function parseISODate(s) {
    const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
}

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
    "Agustus", "September", "Oktober", "November", "Desember"];

function formatTanggal(iso) {
    const d = parseISODate(iso);
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function greeting() {
    const h = new Date().getHours();
    if (h < 11) return "Selamat pagi";
    if (h < 15) return "Selamat siang";
    if (h < 18) return "Selamat sore";
    return "Selamat malam";
}

// Pesan notifikasi: pakai #toast jika halaman punya, selain itu alert.
function notify(message) {
    const t = document.getElementById("toast");
    if (t) {
        t.textContent = message;
        t.classList.add("show");
        clearTimeout(notify.timer);
        notify.timer = setTimeout(() => t.classList.remove("show"), 2600);
    } else {
        alert(message);
    }
}

// Terjemahkan pesan error Supabase agar mudah dipahami.
function friendlyError(err) {
    const msg = String((err && err.message) || err || "");
    const rules = [
        [/invalid login credentials/i, "Email atau password salah."],
        [/email not confirmed/i, "Email belum dikonfirmasi. Cek kotak masuk emailmu."],
        [/user already registered|already been registered/i, "Email ini sudah terdaftar. Silakan masuk."],
        [/password should be at least/i, "Password terlalu pendek."],
        [/same password|different from the old/i, "Password baru harus berbeda dari password lama."],
        [/rate limit|too many requests|security purposes/i, "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi."],
        [/unsupported provider|provider is not enabled/i, "Login dengan penyedia ini belum diaktifkan di Supabase."],
        [/failed to fetch|networkerror|load failed/i, "Tidak bisa terhubung ke server. Periksa koneksi internetmu."],
        [/column .* does not exist|could not find the .* column|schema cache/i, "Database belum diperbarui. Jalankan ulang supabase/schema.sql di Supabase SQL Editor."],
        [/token tidak valid/i, "Token sinkronisasi tidak valid."],
        [/token has expired|otp.*(expired|invalid)|invalid.*otp/i, "Kode salah atau sudah kedaluwarsa. Minta kode baru bila perlu."],
        [/sms provider|unable to get sms|error sending (confirmation|sms)|twilio/i, "Layanan SMS belum diatur di Supabase (Authentication > Providers > Phone)."],
        [/phone.*(disabled|not enabled)|signups? not allowed/i, "Login dengan nomor HP belum diaktifkan di Supabase."],
        [/invalid.*phone|phone.*invalid/i, "Nomor HP tidak valid."],
        [/relation .* does not exist|could not find the table/i, "Tabel database belum dibuat. Jalankan supabase/schema.sql di Supabase SQL Editor."],
        [/duplicate key.*username|username/i, "Username sudah dipakai orang lain."],
        [/row-level security/i, "Akses ditolak oleh database. Pastikan kamu sudah login."]
    ];
    for (const [re, text] of rules) if (re.test(msg)) return text;
    return msg || "Terjadi kesalahan. Silakan coba lagi.";
}

// Tampilkan pesan di elemen .form-message (halaman autentikasi)
function showFormMessage(el, message, type = "info") {
    el.textContent = message;
    el.className = `form-message visible ${type}`;
}

/* ---------- Data bersama ---------- */

async function getProfile(userId) {
    const { data, error } = await sb.from("duitie_profiles").select("*").eq("id", userId).maybeSingle();
    if (error) throw error;
    return data;
}

// Ambil kategori pengeluaran milik user; isi default jika masih kosong.
async function loadCategories(user) {
    let { data, error } = await sb.from("duitie_categories")
        .select("*").eq("user_id", user.id).order("created_at", { ascending: true });
    if (error) throw error;
    if (!data.length) {
        const rows = DEFAULT_CATEGORIES.map((nama) => ({ user_id: user.id, nama }));
        const res = await sb.from("duitie_categories").insert(rows).select();
        if (res.error) throw res.error;
        data = res.data;
    }
    return data;
}

// Ambil seluruh transaksi user (urut terbaru)
async function loadTransactions(user) {
    const { data, error } = await sb.from("duitie_transactions")
        .select("*").eq("user_id", user.id)
        .order("tanggal", { ascending: false })
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data.map((t) => ({ ...t, nominal: Number(t.nominal) }));
}

// Ambil rekening bank / e-wallet milik user
async function loadAccounts(user) {
    const { data, error } = await sb.from("duitie_bank_accounts")
        .select("*").eq("user_id", user.id).order("created_at", { ascending: true });
    if (error) throw error;
    return data.map((a) => ({ ...a, saldo_awal: Number(a.saldo_awal) || 0 }));
}

// Ambil target keuangan milik user
async function loadGoals(user) {
    const { data, error } = await sb.from("duitie_goals")
        .select("*").eq("user_id", user.id).order("deadline", { ascending: true });
    if (error) throw error;
    return data.map((g) => ({ ...g, target: Number(g.target), saved: Number(g.saved) }));
}

// Pasang tombol logout jika ada elemen dengan data-logout
document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-logout]");
    if (el) {
        e.preventDefault();
        logout();
    }
});
