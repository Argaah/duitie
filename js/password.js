/* Keamanan & password -> Supabase Auth */

const form = document.getElementById("form-password");
const pesan = document.getElementById("pesan");

function tampilPesan(teks, warna) {
    pesan.textContent = teks;
    pesan.style.color = warna;
}

// Halaman ini juga dipakai setelah klik tautan "lupa password" (sesi pemulihan)
requireAuth();

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const passwordBaru = document.getElementById("password-baru").value;
    const konfirmasi = document.getElementById("konfirmasi").value;
    const button = form.querySelector('[type="submit"]');

    if (passwordBaru.length < 12) {
        return tampilPesan("Password harus minimal 12 karakter.", "red");
    }
    if (passwordBaru !== konfirmasi) {
        return tampilPesan("Konfirmasi password tidak cocok.", "red");
    }

    button.disabled = true;
    try {
        const { error } = await sb.auth.updateUser({ password: passwordBaru });
        if (error) throw error;
        tampilPesan("Password berhasil diperbarui!", "green");
        form.reset();
    } catch (err) {
        tampilPesan(friendlyError(err), "red");
    } finally {
        button.disabled = false;
    }
});
