/* Kustomisasi kategori pengeluaran -> tabel categories */

const daftar = document.getElementById("daftarKategori");
const formKategori = document.getElementById("formKategori");
const inputNama = document.getElementById("namaKategori");
let currentUser = null;
let kategori = [];

function tampilkanKategori() {
    daftar.innerHTML = kategori.map((k) => `
        <div class="kategori">
            <span>${esc(k.nama)}</span>
            <div>
                <button type="button" data-edit="${k.id}">Edit</button>
                <button type="button" data-hapus="${k.id}">Hapus</button>
            </div>
        </div>
    `).join("");
}

async function muat() {
    kategori = await loadCategories(currentUser);
    tampilkanKategori();
}

function tambahKategori() {
    formKategori.style.display = "flex";
    inputNama.value = "";
    inputNama.focus();
}

async function simpanKategori() {
    const nama = inputNama.value.trim();
    if (nama === "") return alert("Nama kategori belum diisi");
    if (kategori.some((k) => k.nama.toLowerCase() === nama.toLowerCase())) {
        return alert("Kategori itu sudah ada.");
    }
    try {
        const { error } = await sb.from("duitie_categories").insert({ user_id: currentUser.id, nama });
        if (error) throw error;
        formKategori.style.display = "none";
        await muat();
    } catch (err) {
        alert(friendlyError(err));
    }
}

async function editKategori(id) {
    const lama = kategori.find((k) => String(k.id) === String(id));
    if (!lama) return;
    const namaBaru = await Dialog.prompt("Nama kategori", lama.nama, { title: "Ubah kategori", maxLength: 30 });
    if (namaBaru === null || namaBaru.trim() === "" || namaBaru.trim() === lama.nama) return;
    const nama = namaBaru.trim();
    try {
        const { error } = await sb.from("duitie_categories").update({ nama }).eq("id", lama.id);
        if (error) throw error;
        // Samakan nama kategori di transaksi lama agar laporan tetap konsisten
        await sb.from("duitie_transactions").update({ kategori: nama })
            .eq("user_id", currentUser.id).eq("tipe", "keluar").eq("kategori", lama.nama);
        await muat();
    } catch (err) {
        alert(friendlyError(err));
    }
}

async function hapusKategori(id) {
    if (!await Dialog.confirm("Hapus kategori ini? Transaksi lama tidak ikut terhapus.", { title: "Hapus kategori", okText: "Hapus", danger: true })) return;
    try {
        const { error } = await sb.from("duitie_categories").delete().eq("id", id);
        if (error) throw error;
        await muat();
    } catch (err) {
        alert(friendlyError(err));
    }
}

daftar.addEventListener("click", (e) => {
    const edit = e.target.closest("[data-edit]");
    const hapus = e.target.closest("[data-hapus]");
    if (edit) editKategori(edit.dataset.edit);
    if (hapus) hapusKategori(hapus.dataset.hapus);
});

inputNama.addEventListener("keydown", (e) => { if (e.key === "Enter") simpanKategori(); });

(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    try { await muat(); } catch (err) { daftar.textContent = friendlyError(err); }
})();
