/* Halaman profil: nama, foto, logout */

const fileInput = document.getElementById("file-input");
const profileImg = document.getElementById("profile-img");
let currentUser = null;

// Perkecil foto agar ringan disimpan di database (maks 256px)
function resizeImage(file, maxSize = 256) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Gagal membaca file."));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error("File bukan gambar yang valid."));
            img.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

fileInput.addEventListener("change", async function () {
    const file = this.files[0];
    if (!file || !currentUser) return;
    if (!file.type.startsWith("image/")) return alert("Pilih file gambar.");
    try {
        const foto = await resizeImage(file);
        const { error } = await sb.from("duitie_profiles").upsert({ id: currentUser.id, foto });
        if (error) throw error;
        profileImg.src = foto;
    } catch (err) {
        alert(friendlyError(err));
    }
});

(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    try {
        const p = await getProfile(currentUser.id);
        const nama = (p && p.nama) || (currentUser.email || "").split("@")[0];
        document.getElementById("nama-pengguna").textContent = nama;
        if (p && p.foto) profileImg.src = p.foto;
    } catch (err) {
        document.getElementById("nama-pengguna").textContent = (currentUser.email || "").split("@")[0];
    }
    document.getElementById("salam").textContent = greeting();
})();
