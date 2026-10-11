/* Halaman daftar akun */

const registerForm = document.getElementById("register-form");
const formMessage = document.getElementById("form-message");

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!registerForm.reportValidity()) return;

    const nama = document.getElementById("nama").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const konfirmasi = document.getElementById("konfirmasi").value;
    const button = registerForm.querySelector('[type="submit"]');

    if (password !== konfirmasi) {
        showFormMessage(formMessage, "Konfirmasi password tidak cocok.", "error");
        return;
    }

    button.disabled = true;
    showFormMessage(formMessage, "Membuat akun...", "info");

    try {
        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: {
                data: { nama },
                emailRedirectTo: new URL("dashboard.html", window.location.href).href
            }
        });
        if (error) throw error;

        // Email yang sudah terdaftar: Supabase mengembalikan user tanpa identities
        if (data.user && data.user.identities && data.user.identities.length === 0) {
            throw new Error("User already registered");
        }

        if (data.session) {
            showFormMessage(formMessage, "Akun berhasil dibuat. Mengalihkan...", "success");
            window.location.href = "dashboard.html";
        } else {
            showFormMessage(formMessage,
                "Akun dibuat! Kami mengirim email konfirmasi. Klik tautannya, lalu masuk.", "success");
            registerForm.reset();
            button.disabled = false;
        }
    } catch (error) {
        showFormMessage(formMessage, friendlyError(error), "error");
        button.disabled = false;
    }
});
