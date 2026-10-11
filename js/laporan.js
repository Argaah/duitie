/* Laporan & rekap: dihitung dari duitie_transactions (transfer & penyesuaian tidak dihitung) */

let semua = [], accounts = [];
let bulan = todayISO().slice(0, 7);
let mode = "bulanan";

// Rentang tanggal [awal, akhir] sesuai mode
function rentang() {
    const [y, m] = bulan.split("-").map(Number);
    if (mode === "tahunan") return { awal: `${y}-01-01`, akhir: `${y}-12-31`, label: `Tahun ${y}` };
    const akhirBulan = new Date(y, m, 0);
    if (mode === "mingguan") {
        const hariIni = new Date();
        const bulanIni = hariIni.getFullYear() === y && hariIni.getMonth() === m - 1;
        const akhir = bulanIni ? hariIni : akhirBulan;
        const awal = new Date(akhir.getFullYear(), akhir.getMonth(), akhir.getDate() - 6);
        return { awal: toISODate(awal), akhir: toISODate(akhir), label: "7 Hari Terakhir" };
    }
    return {
        awal: `${bulan}-01`, akhir: toISODate(akhirBulan),
        label: todayISO().slice(0, 7) === bulan ? "Bulan Ini" : `${BULAN[m - 1]} ${y}`
    };
}

function barRow(label, nilai, pct, color, extra) {
    return `<div class="report-row">
        <div class="report-top">
            <span>${label}</span>
            <span class="val text-red">${nilai}${extra ? ` (${extra})` : ""}</span>
        </div>
        <div class="progress-container"><div class="progress-bar" style="width:${pct}%;background-color:${color}"></div></div>
    </div>`;
}

function render() {
    $("#monthLabel").textContent = formatBulan(bulan);
    $$("#modeTabs button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));

    const r = rentang();
    const dalamRentang = semua.filter((t) => t.tanggal >= r.awal && t.tanggal <= r.akhir);
    const data = dalamRentang.filter((t) => !t.is_transfer);

    // --- Rekap ---
    const masuk = data.filter((t) => t.tipe === "masuk").reduce((s, t) => s + t.nominal, 0);
    const keluarList = data.filter((t) => t.tipe === "keluar");
    const keluar = keluarList.reduce((s, t) => s + t.nominal, 0);
    $("#judul-rekap").textContent = `Rekap Kalkulasi Catatan (${r.label})`;
    $("#total-masuk").textContent = "+" + rupiah(masuk);
    $("#total-keluar").textContent = "-" + rupiah(keluar);
    $("#total-selisih").textContent = signedRp(masuk - keluar);

    // --- Persentase per kategori ---
    const perKategori = {};
    keluarList.forEach((t) => { perKategori[t.kategori] = (perKategori[t.kategori] || 0) + t.nominal; });
    const baris = Object.entries(perKategori).sort((a, b) => b[1] - a[1]);
    $("#tabel-kategori").innerHTML = baris.length
        ? baris.map(([nama, nilai]) => {
            const c = catStyle(nama, "keluar");
            const pct = keluar ? Math.round((nilai / keluar) * 100) : 0;
            return barRow(`<i class="fa-solid ${c.icon}" style="color:${c.color}"></i> ${esc(nama)}`, rupiah(nilai), pct, c.color, pct + "%");
        }).join("")
        : '<div class="empty">Belum ada pengeluaran pada periode ini.</div>';

    // --- Tren ---
    let judul, grup;
    if (mode === "tahunan") {
        judul = "Tren Pengeluaran Bulanan";
        grup = BULAN.map((n, i) => ({ nama: n, nilai: 0, cocok: (t) => Number(t.tanggal.slice(5, 7)) === i + 1 }));
    } else if (mode === "mingguan") {
        judul = "Tren Pengeluaran Harian";
        grup = [];
        const mulai = parseISODate(r.awal);
        for (let i = 0; i < 7; i++) {
            const d = new Date(mulai.getFullYear(), mulai.getMonth(), mulai.getDate() + i);
            const iso = toISODate(d);
            grup.push({ nama: `${pad(d.getDate())}-${pad(d.getMonth() + 1)}`, nilai: 0, cocok: (t) => t.tanggal === iso });
        }
    } else {
        judul = "Tren Pengeluaran Mingguan";
        const hariTerakhir = Number(r.akhir.slice(8, 10));
        grup = [];
        for (let a = 1, n = 1; a <= hariTerakhir; a += 7, n++) {
            const b = Math.min(a + 6, hariTerakhir);
            grup.push({ nama: `Minggu ${n}`, nilai: 0, cocok: (t) => { const h = Number(t.tanggal.slice(8, 10)); return h >= a && h <= b; } });
        }
    }
    keluarList.forEach((t) => { const g = grup.find((x) => x.cocok(t)); if (g) g.nilai += t.nominal; });
    const maks = Math.max(1, ...grup.map((g) => g.nilai));
    $("#judul-tren").textContent = judul;
    $("#tabel-tren").innerHTML = grup.map((g) =>
        barRow(esc(g.nama), rupiah(g.nilai), Math.round((g.nilai / maks) * 100), "#8b5cf6")).join("");

    // --- Per rekening ---
    const bal = Bank.computeBalances(accounts, semua, r);
    $("#tabel-rekening").innerHTML = accounts.length
        ? accounts.map((a) => {
            const info = Bank.bankInfo(a.bank), b = bal[a.id];
            return `<div class="acct-row" style="align-items:flex-start">
                <div class="badge-bank" style="background:${info.color}">${esc(a.bank.slice(0, 3).toUpperCase())}</div>
                <div class="info">
                    <div class="name">${esc(a.bank)} <span class="meta">${esc(Bank.maskNomor(a.nomor))}</span></div>
                    <div class="mini-stats">
                        <span>Masuk <b class="text-green">${rupiah(b.masuk)}</b></span>
                        <span>Keluar <b class="text-red">${rupiah(b.keluar)}</b></span>
                    </div>
                </div>
                <div class="bal">${signedRp(b.saldo)}</div>
            </div>`;
        }).join("")
        : '<div class="empty">Belum ada rekening. Tambahkan di halaman Rekening untuk melihat arus kas per rekening.</div>';
}

$("#monthSelect").addEventListener("click", () => pickMonth(bulan, (m) => { bulan = m; render(); }));
$("#modeTabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (b) { mode = b.dataset.mode; render(); }
});
$("#btn-unduh").addEventListener("click", () => { window.location.href = "excel.html"; });

(async () => {
    const user = await requireAuth();
    if (!user) return;
    try {
        [semua, accounts] = await Promise.all([loadTransactions(user), loadAccounts(user)]);
    } catch (err) {
        notify(friendlyError(err));
    }
    render();
})();
