/* Pengaturan notifikasi -> profiles.notifikasi (jsonb) */

const kunci = ["transaksi", "pembayaran", "promo", "email"];
const kotak = Object.fromEntries(kunci.map((k) => [k, document.getElementById(k)]));
let currentUser = null;

(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    try {
        const p = await getProfile(currentUser.id);
        const pengaturan = (p && p.notifikasi) || {};
        kunci.forEach((k) => { kotak[k].checked = !!pengaturan[k]; });
    } catch (err) {
        alert(friendlyError(err));
    }
})();

document.getElementById("formNotifikasi").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) return;

    const dataNotifikasi = Object.fromEntries(kunci.map((k) => [k, kotak[k].checked]));
    const button = event.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
        const { error } = await sb.from("duitie_profiles").upsert({ id: currentUser.id, notifikasi: dataNotifikasi });
        if (error) throw error;
        alert("Pengaturan notifikasi berhasil disimpan!");
    } catch (err) {
        alert(friendlyError(err));
    } finally {
        button.disabled = false;
    }
});
