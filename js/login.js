/* Halaman login */

const loginForm = document.getElementById("login-form");
const formMessage = document.getElementById("form-message");
const passwordInput = document.getElementById("password");
const passwordToggle = document.getElementById("password-toggle");

// Sudah login? langsung ke dashboard.
getUser().then((user) => {
    if (user) window.location.replace("dashboard.html");
});

// Tampilkan / sembunyikan password
passwordToggle.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    passwordToggle.textContent = isPassword ? "Sembunyi" : "Lihat";
    passwordToggle.setAttribute("aria-pressed", String(isPassword));
    passwordToggle.setAttribute("aria-label", isPassword ? "Sembunyikan password" : "Tampilkan password");
});

// Login email + password
loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;

    const email = document.getElementById("email").value.trim();
    const password = passwordInput.value;
    const remember = document.getElementById("ingat-saya").checked;
    const button = loginForm.querySelector('[type="submit"]');

    // Tentukan penyimpanan sesi SEBELUM login
    try { localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0"); } catch (e) { /* abaikan */ }

    button.disabled = true;
    showFormMessage(formMessage, "Sedang masuk...", "info");

    try {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showFormMessage(formMessage, "Login berhasil. Selamat datang!", "success");
        window.location.href = "dashboard.html";
    } catch (error) {
        showFormMessage(formMessage, friendlyError(error), "error");
        button.disabled = false;
    }
});

/* ---------- Pemeriksaan penyedia login ---------- */
// Tanya Supabase penyedia apa saja yang aktif, supaya pesan error jelas
// (tanpa ini pengguna hanya melihat halaman JSON mentah dari Supabase).
async function providerEnabled(name) {
    try {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
        if (!r.ok) return null;
        const s = await r.json();
        return !!(s.external && s.external[name]);
    } catch (e) {
        return null;   // tidak bisa memeriksa: biarkan percobaan login berjalan
    }
}

// Tampilkan error yang dikembalikan penyedia login lewat URL (mis. setelah Google menolak)
(function showReturnedError() {
    const raw = (location.hash || "").replace(/^#/, "") + "&" + (location.search || "").replace(/^\?/, "");
    const q = new URLSearchParams(raw);
    const desc = q.get("error_description") || q.get("error");
    if (!desc) return;
    let msg = desc.replace(/\+/g, " ");
    if (/redirect_uri_mismatch/i.test(msg)) msg = "Google menolak alamat callback. Periksa Authorized redirect URI di Google Cloud Console.";
    else if (/access_denied/i.test(msg)) msg = "Login dibatalkan.";
    showFormMessage(formMessage, msg, "error");
    history.replaceState(null, "", location.pathname);
})();

/* ---------- Login Google ---------- */
async function googleLogin() {
    const on = await providerEnabled("google");
    if (on === false) {
        return showFormMessage(formMessage, "Login Google belum diaktifkan. Di Supabase: Authentication > Sign In / Providers > Google > aktifkan, isi Client ID & Secret dari Google Cloud.", "error");
    }
    try { localStorage.setItem(REMEMBER_KEY, "1"); } catch (e) { /* abaikan */ }
    try {
        const { error } = await sb.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: new URL("dashboard.html", window.location.href).href,
                queryParams: { prompt: "select_account" }
            }
        });
        if (error) throw error;
    } catch (error) {
        showFormMessage(formMessage, friendlyError(error), "error");
    }
}

/* ---------- Login nomor HP (kode SMS) ---------- */
// 0812xxxx / 62812xxxx / +62812xxxx -> +62812xxxx
function normalizePhone(raw) {
    let d = String(raw || "").replace(/[^\d+]/g, "");
    if (d.startsWith("+")) d = d.slice(1);
    if (d.startsWith("0")) d = "62" + d.slice(1);
    else if (d.startsWith("8")) d = "62" + d;
    return /^62\d{9,12}$/.test(d) ? "+" + d : null;
}

async function phoneLogin() {
    const on = await providerEnabled("phone");
    if (on === false) {
        return showFormMessage(formMessage, "Login nomor HP belum diaktifkan. Di Supabase: Authentication > Sign In / Providers > Phone > aktifkan dan pilih penyedia SMS (mis. Twilio).", "error");
    }
    const f = await Dialog.form({
        title: "Masuk dengan nomor HP", icon: "☎", okText: "Kirim kode",
        message: "Kami kirim kode 6 digit lewat SMS ke nomormu.",
        fields: [{ name: "phone", label: "Nomor HP", type: "tel", inputMode: "tel", autocomplete: "tel", placeholder: "0812 3456 7890", required: true }],
        validate: (v) => (normalizePhone(v.phone) ? null : "Nomor tidak valid. Contoh: 081234567890")
    });
    if (!f) return;
    const phone = normalizePhone(f.phone);
    try { localStorage.setItem(REMEMBER_KEY, "1"); } catch (e) { /* abaikan */ }

    showFormMessage(formMessage, "Mengirim kode...", "info");
    const { error } = await sb.auth.signInWithOtp({ phone });
    if (error) return showFormMessage(formMessage, friendlyError(error), "error");
    showFormMessage(formMessage, "Kode dikirim ke " + phone + ".", "success");

    let msg = "Kode dikirim ke " + phone + ".";
    for (;;) {
        const c = await Dialog.form({
            title: "Masukkan kode", icon: "✓", okText: "Masuk", message: msg,
            fields: [{ name: "code", label: "Kode 6 digit", inputMode: "numeric", autocomplete: "one-time-code", maxLength: 6, placeholder: "123456", required: true }],
            validate: (v) => (/^\d{6}$/.test(v.code) ? null : "Kode terdiri dari 6 angka.")
        });
        if (!c) return;
        const { error: err2 } = await sb.auth.verifyOtp({ phone, token: c.code, type: "sms" });
        if (!err2) { window.location.href = "dashboard.html"; return; }
        msg = friendlyError(err2);
    }
}

document.getElementById("google-login").addEventListener("click", googleLogin);
document.getElementById("phone-login").addEventListener("click", phoneLogin);
