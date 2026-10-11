/* Halaman lupa password */

const forgotForm = document.getElementById("forgot-form");
const formMessage = document.getElementById("form-message");

forgotForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!forgotForm.reportValidity()) return;

    const email = document.getElementById("email").value.trim();
    const button = forgotForm.querySelector('[type="submit"]');
    button.disabled = true;
    showFormMessage(formMessage, "Mengirim tautan...", "info");

    try {
        // Tautan di email membawa user kembali dengan sesi pemulihan, lalu ia membuat password baru di password.html
        const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: new URL("password.html", window.location.href).href
        });
        if (error) throw error;
        showFormMessage(formMessage,
            "Jika email terdaftar, tautan reset password sudah dikirim. Cek kotak masuk emailmu.", "success");
    } catch (error) {
        showFormMessage(formMessage, friendlyError(error), "error");
    } finally {
        button.disabled = false;
    }
});
