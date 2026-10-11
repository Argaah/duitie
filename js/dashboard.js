/* Beranda: ringkasan bulan, saldo rekening, jurnal terbaru, target */

let user = null;
let trx = [], accounts = [], goals = [], kategori = [];
let month = todayISO().slice(0, 7);
const GOAL_COLORS = ["#3498db", "#f1c40f", "#10b981", "#ec4899", "#8b5cf6", "#f97316"];

async function muat() {
    const [t, a, g, k] = await Promise.all([
        loadTransactions(user), loadAccounts(user), loadGoals(user), loadCategories(user)
    ]);
    trx = t; accounts = a; goals = g; kategori = k.map((x) => x.nama);
    render();
}

function render() {
    $("#monthLabel").textContent = formatBulan(month);
    const accMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
    const r = monthRange(month);

    // --- Recap bulan terpilih (transfer & penyesuaian tidak dihitung) ---
    const bulanTx = trx.filter((t) => t.tanggal.slice(0, 7) === month);
    const nyata = bulanTx.filter((t) => !t.is_transfer);
    const masuk = nyata.filter((t) => t.tipe === "masuk").reduce((s, t) => s + t.nominal, 0);
    const keluar = nyata.filter((t) => t.tipe === "keluar").reduce((s, t) => s + t.nominal, 0);
    $("#incomeTotal").textContent = "+" + rupiah(masuk);
    $("#expenseTotal").textContent = "-" + rupiah(keluar);
    $("#balanceTotal").textContent = signedRp(masuk - keluar);

    // --- Saldo rekening ---
    const bal = Bank.computeBalances(accounts, trx, r);
    if (accounts.length) {
        $("#totalSaldo").textContent = signedRp(Bank.sumBalances(bal));
        $("#totalSub").textContent = `Dari ${accounts.length} rekening / dompet`;
        $("#accountList").innerHTML = accounts.slice(0, 4).map((a) => {
            const info = Bank.bankInfo(a.bank);
            const b = bal[a.id];
            return `<div class="acct-row">
                <div class="badge-bank" style="background:${info.color}">${esc(a.bank.slice(0, 3).toUpperCase())}</div>
                <div class="info">
                    <div class="name">${esc(a.bank)}</div>
                    <div class="meta">Masuk ${rupiah(b.masuk)} • Keluar ${rupiah(b.keluar)}</div>
                </div>
                <div class="bal">${signedRp(b.saldo)}</div>
            </div>`;
        }).join("") + (accounts.length > 4
            ? `<a class="more-link" href="rekening.html">+${accounts.length - 4} rekening lainnya</a>` : "");
    } else {
        $("#totalSaldo").textContent = "Rp 0";
        $("#totalSub").textContent = "Belum ada rekening yang dilacak";
        $("#accountList").innerHTML = `<div class="empty">Tambahkan rekening bank, e-wallet, atau dompet tunai untuk melacak saldo &amp; pengeluarannya.</div>
            <a class="btn-add" href="rekening.html" style="display:block;text-align:center;text-decoration:none"><i class="fa-solid fa-plus"></i> TAMBAH REKENING</a>`;
    }

    // --- Jurnal (maks 6 terbaru di bulan terpilih) ---
    const urut = bulanTx.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id - a.id);
    $("#journalList").innerHTML = renderJournal(urut.slice(0, 6), accMap, { empty: "Belum ada catatan di bulan ini." });
    $("#moreLink").hidden = urut.length <= 6;

    // --- Target ---
    $("#savingList").innerHTML = goals.length
        ? goals.slice(0, 3).map((s, i) => {
            const pct = s.target > 0 ? Math.min(100, Math.round((s.saved / s.target) * 100)) : 0;
            const color = GOAL_COLORS[i % GOAL_COLORS.length];
            return `<div class="saving-item">
                <div class="saving-top"><span><i class="fa-solid fa-piggy-bank" style="color:${color}"></i> ${esc(s.name)}</span><span>${pct}%</span></div>
                <div class="progress-container"><div class="progress-bar" style="width:${pct}%;background-color:${color}"></div></div>
                <small>Terkumpul ${rupiah(s.saved)} / ${rupiah(s.target)}</small>
            </div>`;
        }).join("")
        : '<div class="empty">Belum ada target tabungan.</div>';
}

$("#monthSelect").addEventListener("click", () => pickMonth(month, (m) => { month = m; render(); }));

$("#btnAdd").addEventListener("click", () => openTransactionModal({
    user, categories: kategori, accounts,
    date: todayISO().startsWith(month) ? todayISO() : month + "-01",
    onSaved: async (ym) => { month = ym; await muat(); }
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
    $("#salam").textContent = greeting();
    $("#nama-pengguna").textContent = (user.email || "").split("@")[0];
    try {
        const profile = await getProfile(user.id);
        if (profile && profile.nama) $("#nama-pengguna").textContent = profile.nama;
        await muat();
        watchRealtime(user, muat);
    } catch (err) {
        const msg = `<div class="empty">${esc(friendlyError(err))}</div>`;
        $("#journalList").innerHTML = msg;
        $("#accountList").innerHTML = msg;
        $("#savingList").innerHTML = msg;
        $("#totalSub").textContent = "Gagal memuat data";
    }
})();
