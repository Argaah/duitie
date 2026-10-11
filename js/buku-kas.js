/* Buku Kas: catat, cari & filter transaksi (tabel duitie_transactions) */

let user = null;
let trx = [], accounts = [], kategori = [];

function isiFilter() {
    // Periode
    const bulan = new Set(trx.map((t) => t.tanggal.slice(0, 7)));
    bulan.add(todayISO().slice(0, 7));
    const pilihBulan = $("#fBulan").value || todayISO().slice(0, 7);
    $("#fBulan").innerHTML = '<option value="all">Semua periode</option>' +
        [...bulan].sort().reverse().map((b) => `<option value="${b}">${formatBulan(b)}</option>`).join("");
    $("#fBulan").value = [...$("#fBulan").options].some((o) => o.value === pilihBulan) ? pilihBulan : todayISO().slice(0, 7);

    // Rekening
    const pilihAkun = $("#fAkun").value || "all";
    $("#fAkun").innerHTML = '<option value="all">Semua rekening</option><option value="none">Tanpa rekening</option>' +
        accounts.map((a) => `<option value="${a.id}">${esc(accountLabel(a))}</option>`).join("");
    $("#fAkun").value = [...$("#fAkun").options].some((o) => o.value === pilihAkun) ? pilihAkun : "all";
}

function tampilkan() {
    const accMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
    const bulan = $("#fBulan").value, akun = $("#fAkun").value, jenis = $("#fJenis").value;
    const cari = $("#fCari").value.trim().toLowerCase();

    const tampil = trx.filter((t) => {
        if (bulan !== "all" && t.tanggal.slice(0, 7) !== bulan) return false;
        if (akun === "none" ? t.account_id : akun !== "all" && String(t.account_id) !== akun) return false;
        if (jenis === "transfer" ? !t.is_transfer : jenis !== "all" && (t.is_transfer || t.tipe !== jenis)) return false;
        if (cari && !`${t.keterangan} ${t.kategori}`.toLowerCase().includes(cari)) return false;
        return true;
    });

    const nyata = tampil.filter((t) => !t.is_transfer);
    const masuk = nyata.filter((t) => t.tipe === "masuk").reduce((s, t) => s + t.nominal, 0);
    const keluar = nyata.filter((t) => t.tipe === "keluar").reduce((s, t) => s + t.nominal, 0);
    $("#incomeTotal").textContent = "+" + rupiah(masuk);
    $("#expenseTotal").textContent = "-" + rupiah(keluar);
    $("#balanceTotal").textContent = signedRp(masuk - keluar);
    $("#recapLabel").textContent = bulan === "all" ? "(Semua periode)" : `(${formatBulan(bulan)})`;

    $("#journalList").innerHTML = renderJournal(tampil, accMap, { empty: "Belum ada catatan pada filter ini." });
}

async function muat() {
    const [t, a, k] = await Promise.all([loadTransactions(user), loadAccounts(user), loadCategories(user)]);
    trx = t; accounts = a; kategori = k.map((x) => x.nama);
    isiFilter();
    tampilkan();
}

["#fBulan", "#fAkun", "#fJenis"].forEach((s) => $(s).addEventListener("change", tampilkan));
$("#fCari").addEventListener("input", tampilkan);

$("#btnAdd").addEventListener("click", () => openTransactionModal({
    user, categories: kategori, accounts,
    onSaved: async (ym) => {
        await muat();
        if ($("#fBulan").value !== "all") { $("#fBulan").value = ym; tampilkan(); }
    }
}));

document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="del-tx"]');
    if (!btn) return;
    const t = trx.find((x) => String(x.id) === btn.dataset.id);
    if (t) confirmDeleteTransaction(t, muat);
});

(async () => {
    user = await requireAuth();
    if (!user) return;
    try {
        await muat();
        watchRealtime(user, muat);
    } catch (err) {
        $("#journalList").innerHTML = `<div class="empty">${esc(friendlyError(err))}</div>`;
    }
})();
