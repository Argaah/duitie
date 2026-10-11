/* Ubah data diri -> tabel profiles */

const form = document.getElementById("formData");
const $ = (id) => document.getElementById(id);
let currentUser = null;

async function init() {
    currentUser = await requireAuth();
    if (!currentUser) return;

    try {
        const p = (await getProfile(currentUser.id)) || {};
        $("nama").value = p.nama || "";
        $("username").value = p.username || "";
        $("email").value = currentUser.email || "";
        $("telepon").value = p.telepon || "";
        $("tanggal").value = p.tanggal_lahir || "";
        $("alamat").value = p.alamat || "";
        if (p.gender === "Laki-laki") $("laki").checked = true;
        if (p.gender === "Perempuan") $("perempuan").checked = true;
    } catch (err) {
        alert(friendlyError(err));
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return;

    const button = form.querySelector('[type="submit"]');
    const emailBaru = $("email").value.trim();
    const gender = document.querySelector('input[name="gender"]:checked');

    const dataDiri = {
        id: currentUser.id,
        nama: $("nama").value.trim() || null,
        username: $("username").value.trim() || null,
        email: currentUser.email,
        telepon: $("telepon").value.trim() || null,
        tanggal_lahir: $("tanggal").value || null,
        gender: gender ? gender.value : null,
        alamat: $("alamat").value.trim() || null
    };

    button.disabled = true;
    try {
        const { error } = await sb.from("duitie_profiles").upsert(dataDiri);
        if (error) throw error;

        let pesan = "Data diri berhasil disimpan!";
        if (emailBaru && emailBaru !== currentUser.email) {
            const res = await sb.auth.updateUser({ email: emailBaru });
            if (res.error) throw res.error;
            pesan += "\nUntuk mengganti email, klik tautan konfirmasi yang dikirim ke emailmu.";
        }
        await Dialog.alert(pesan, { title: "Berhasil" });
        window.location.href = "profile.html";
    } catch (err) {
        alert(friendlyError(err));
        button.disabled = false;
    }
});

init();
