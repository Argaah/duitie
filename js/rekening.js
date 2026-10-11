/* Rekening bank & e-wallet: saldo, mutasi, impor CSV, transfer, sinkron otomatis */

let user = null, namaUser = "";
let accounts = [], trx = [], kategori = [];

async function muat() {
    const [a, t, k] = await Promise.all([loadAccounts(user), loadTransactions(user), loadCategories(user)]);
    accounts = a; trx = t; kategori = k.map((x) => x.nama);
    render();
}

function fmtWaktu(iso) {
    return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function render() {
    const bulan = todayISO().slice(0, 7);
    const bal = Bank.computeBalances(accounts, trx, monthRange(bulan));
    const total = Bank.sumBalances(bal);
    const masuk = Object.values(bal).reduce((s, b) => s + b.masuk, 0);
    const keluar = Object.values(bal).reduce((s, b) => s + b.keluar, 0);

    $("#totalSaldo").textContent = signedRp(total);
    $("#totalSub").textContent = accounts.length
        ? `${accounts.length} rekening • ${formatBulan(bulan)}: masuk ${rupiah(masuk)}, keluar ${rupiah(keluar)}`
        : "Belum ada rekening";

    if (!accounts.length) {
        $("#accountList").innerHTML = `<section class="card"><div class="empty">Belum ada rekening. Tambahkan bank, e-wallet, atau dompet tunai pertamamu.</div>
            <button class="btn-add" id="btnAddEmpty"><i class="fa-solid fa-plus"></i> TAMBAH REKENING</button></section>`;
        return;
    }

    $("#accountList").innerHTML = accounts.map((a) => {
        const info = Bank.bankInfo(a.bank), b = bal[a.id];
        const meta = [Bank.maskNomor(a.nomor), a.pemilik].filter(Boolean).join(" • ");
        return `<section class="card" data-acc="${a.id}">
            <div class="acct-row" style="padding-top:0">
                <div class="badge-bank" style="background:${info.color}">${esc(a.bank.slice(0, 3).toUpperCase())}</div>
                <div class="info">
                    <div class="name">${esc(a.bank)} <small style="font-weight:400;color:#a99bc4">${info.jenis === "ewallet" ? "E-Wallet" : info.jenis === "tunai" ? "Tunai" : "Bank"}</small></div>
                    <div class="meta">${esc(meta)}</div>
                </div>
                <div class="bal" style="font-size:16px">${signedRp(b.saldo)}</div>
            </div>
            <div class="mini-stats">
                <span>Masuk bulan ini <b class="text-green">${rupiah(b.masuk)}</b></span>
                <span>Keluar bulan ini <b class="text-red">${rupiah(b.keluar)}</b></span>
            </div>
            <div class="meta" style="font-size:11px;color:#a99bc4;margin:8px 0 10px">
                ${b.jumlah} transaksi tertaut
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="chip" data-act="mutasi"><i class="fa-solid fa-list"></i> Mutasi</button>
                <button class="chip" data-act="impor"><i class="fa-solid fa-file-import"></i> Impor CSV</button>
                <button class="chip" data-act="saldo"><i class="fa-solid fa-scale-balanced"></i> Sesuaikan saldo</button>
                <button class="chip danger" data-act="hapus"><i class="fa-solid fa-trash"></i></button>
            </div>
        </section>`;
    }).join("");
}

/* ---------- Tambah rekening ---------- */
function addAccount() {
    const opt = (jenis) => Bank.BANKS.filter((b) => b.jenis === jenis).map((b) => `<option>${b.name}</option>`).join("");
    openModal("Tambah Rekening", `
        <label>Bank / e-wallet</label>
        <select name="bank">
            <optgroup label="Bank">${opt("bank")}</optgroup>
            <optgroup label="E-Wallet">${opt("ewallet")}</optgroup>
            <optgroup label="Lainnya">${opt("tunai")}</optgroup>
        </select>
        <label>Nomor rekening / nomor HP e-wallet</label>
        <input name="nomor" type="text" inputmode="numeric" maxlength="30" placeholder="1234567890">
        <label>Nama pemilik</label>
        <input name="pemilik" type="text" maxlength="60" value="${esc(namaUser)}">
        <label>Saldo saat ini (Rp)</label>
        <input name="saldo" type="number" min="0" step="any" inputmode="decimal" value="0">
        <p class="hint">Saldo ini jadi titik awal. Setelahnya saldo bergerak otomatis mengikuti transaksi yang kamu catat, impor, atau sinkronkan.</p>
    `, async (f) => {
        const tunai = f.bank === "Tunai";
        const nomor = tunai && !f.nomor.trim() ? "-" : f.nomor.trim();
        if (!tunai && !/^[0-9\s-]{5,30}$/.test(nomor)) { notify("Nomor hanya boleh berisi angka (5-30 digit)."); return false; }
        if (!f.pemilik.trim()) { notify("Nama pemilik wajib diisi."); return false; }
        const saldo = Number(f.saldo);
        if (!(saldo >= 0)) { notify("Saldo tidak valid."); return false; }
        const { error } = await sb.from("duitie_bank_accounts").insert({
            user_id: user.id, bank: f.bank, nomor, pemilik: f.pemilik.trim(), saldo_awal: saldo
        });
        if (error) throw error;
        notify("Rekening ditambahkan.");
        await muat();
    });
}

/* ---------- Penyesuaian saldo ---------- */
// Samakan saldo di Duitie dengan saldo sebenarnya lewat satu transaksi penyesuaian
async function adjustBalance(acc, target, keterangan) {
    const cur = Bank.computeBalances(accounts, trx)[acc.id].saldo;
    const diff = Math.round((target - cur) * 100) / 100;
    if (Math.abs(diff) < 0.01) return false;
    const { error } = await sb.from("duitie_transactions").insert({
        user_id: user.id, account_id: acc.id, tanggal: todayISO(),
        tipe: diff > 0 ? "masuk" : "keluar", nominal: Math.abs(diff),
        kategori: "Penyesuaian saldo", keterangan, is_transfer: true, sumber: "manual"
    });
    if (error) throw error;
    return true;
}

function adjustModal(acc) {
    const cur = Bank.computeBalances(accounts, trx)[acc.id].saldo;
    openModal(`Sesuaikan saldo ${esc(acc.bank)}`, `
        <p class="hint">Saldo di Duitie saat ini <b>${signedRp(cur)}</b>. Masukkan saldo sebenarnya sesuai aplikasi bank / e-wallet. Selisihnya dicatat sebagai "Penyesuaian saldo" dan tidak dihitung sebagai pemasukan atau pengeluaran.</p>
        <label>Saldo sebenarnya (Rp)</label>
        <input name="saldo" type="number" step="any" inputmode="decimal" value="${Math.round(cur)}">
    `, async (f) => {
        if (f.saldo === "" || !Number.isFinite(Number(f.saldo))) { notify("Isi saldo dengan angka."); return false; }
        const changed = await adjustBalance(acc, Number(f.saldo), "Penyesuaian saldo manual");
        notify(changed ? "Saldo disesuaikan." : "Saldo sudah sama.");
        await muat();
    });
}

/* ---------- Mutasi ---------- */
function mutasiModal(acc) {
    const accMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
    const list = trx.filter((t) => t.account_id === acc.id).slice(0, 60);
    openModal(`Mutasi ${esc(acc.bank)}`,
        `<div style="max-height:55vh;overflow:auto">${renderJournal(list, accMap, { del: false, empty: "Belum ada transaksi di rekening ini." })}</div>
         <p class="hint">${list.length === 60 ? "Menampilkan 60 transaksi terbaru. Lihat semuanya di Buku Kas." : "Hapus atau cari transaksi lewat Buku Kas."}</p>`,
        null, { cancelText: "Tutup", wide: true });
}

/* ---------- Impor CSV ---------- */
function importModal(acc) {
    let parsed = null;
    const sudah = new Set(trx.filter((t) => t.account_id === acc.id && t.external_id).map((t) => t.external_id));

    const overlay = openModal(`Impor mutasi ${esc(acc.bank)}`, `
        <p class="hint">Unduh mutasi / rekening koran dari internet banking atau aplikasi e-wallet dalam format <b>CSV</b>. Kolom yang dibutuhkan: <b>Tanggal</b>, <b>Keterangan</b>, dan <b>Jumlah</b> (atau Debit &amp; Kredit). Impor ulang file yang sama aman, data tidak akan dobel.</p>
        <label>File CSV</label>
        <input name="file" id="impFile" type="file" accept=".csv,.txt,text/csv">
        <div id="impPreview"></div>
        <label class="check-row" id="impBalRow" hidden>
            <input type="checkbox" name="pakaiSaldo" checked>
            <span>Samakan saldo dengan saldo akhir di file (<b id="impBal"></b>)</span>
        </label>
    `, async (f) => {
        if (!parsed) { notify("Pilih file CSV terlebih dahulu."); return false; }
        const baru = parsed.rows.filter((r) => !sudah.has(r.external_id));
        if (!baru.length) { notify("Semua transaksi di file ini sudah pernah diimpor."); return false; }

        for (let i = 0; i < baru.length; i += 200) {
            const chunk = baru.slice(i, i + 200).map((r) => ({
                user_id: user.id, account_id: acc.id, tanggal: r.tanggal, tipe: r.tipe, nominal: r.nominal,
                kategori: r.kategori, keterangan: r.keterangan, external_id: r.external_id, sumber: "csv"
            }));
            const { error } = await sb.from("duitie_transactions")
                .upsert(chunk, { onConflict: "account_id,external_id", ignoreDuplicates: true });
            if (error) throw error;
        }
        await muat();
        let pesan = `${baru.length} transaksi diimpor.`;
        const saldoFile = Bank.latestBalance(parsed.rows);
        if (f.pakaiSaldo && saldoFile !== null && await adjustBalance(acc, saldoFile, "Penyesuaian saldo (impor mutasi)")) {
            await muat();
            pesan += " Saldo disesuaikan.";
        }
        notify(pesan);
    }, { submitText: "Impor", wide: true, noFocus: true });

    $("#impFile", overlay).addEventListener("change", async (e) => {
        const file = e.target.files[0];
        const box = $("#impPreview", overlay);
        parsed = null;
        $("#impBalRow", overlay).hidden = true;
        if (!file) { box.innerHTML = ""; return; }
        if (/\.xlsx?$/i.test(file.name)) {
            box.innerHTML = '<p class="hint text-red">File Excel belum didukung. Buka di Excel lalu pilih Simpan Sebagai &gt; CSV.</p>';
            return;
        }
        const text = await file.text();
        const res = Bank.parseStatement(text, { defaultYear: new Date().getFullYear() });
        if (res.error) { box.innerHTML = `<p class="hint text-red">${esc(res.error)}</p>`; return; }
        parsed = res;
        const dup = res.rows.filter((r) => sudah.has(r.external_id)).length;
        const masuk = res.rows.filter((r) => r.tipe === "masuk").length;
        box.innerHTML = `<p class="hint"><b>${res.rows.length}</b> transaksi terbaca (${masuk} masuk, ${res.rows.length - masuk} keluar)` +
            `${dup ? `, <b>${dup}</b> sudah ada dan dilewati` : ""}${res.skipped ? `, ${res.skipped} baris diabaikan` : ""}.</p>` +
            `<div class="preview-list">${res.rows.slice(0, 8).map((r) =>
                `<div><span>${esc(formatTanggal(r.tanggal))} ${esc(r.keterangan || r.kategori)}</span>` +
                `<span class="${r.tipe === "masuk" ? "text-green" : "text-red"}">${r.tipe === "masuk" ? "+" : "-"}${rupiah(r.nominal)}</span></div>`).join("")}</div>`;
        const sf = Bank.latestBalance(res.rows);
        if (sf !== null) { $("#impBal", overlay).textContent = rupiah(sf); $("#impBalRow", overlay).hidden = false; }
    });
}

/* ---------- Hapus ---------- */
function deleteAccount(acc) {
    askConfirm(`Hapus rekening <b>${esc(acc.bank)}</b>? Transaksinya tetap ada di Buku Kas, hanya tidak lagi tertaut ke rekening ini.`, async () => {
        const { error } = await sb.from("duitie_bank_accounts").delete().eq("id", acc.id);
        if (error) throw error;
        notify("Rekening dihapus.");
        await muat();
    });
}

/* ---------- Event ---------- */
function startTransfer() {
    if (accounts.length < 2) return notify("Tambahkan minimal 2 rekening untuk memakai transfer.");
    openTransactionModal({ user, categories: kategori, accounts, tipe: "transfer", onSaved: muat });
}

/* ---------- Brick: hubungkan & sinkron bank ---------- */
// Ambil pesan error dari Edge Function (isi respons non-2xx ada di error.context)
async function fnError(error, data) {
    if (data && data.error) return data.error;
    try { const b = await error.context.json(); if (b && b.error) return b.error; } catch (e) { /* abaikan */ }
    return /not found|404/i.test(String(error && error.message))
        ? "Fungsi Brick belum di-deploy di Supabase (lihat README)."
        : friendlyError(error);
}

async function connectBank() {
    const tab = window.open("", "_blank");            // dibuka sinkron agar tidak diblokir popup blocker
    const btn = $("#btnBrick"); btn.disabled = true;
    try {
        const { data, error } = await sb.functions.invoke("brick-connect", { body: {} });
        if (error || !data || !data.url) throw new Error(await fnError(error, data));
        if (tab) tab.location.href = data.url; else window.location.href = data.url;
        notify("Selesaikan koneksi bank di tab Brick. Rekening muncul otomatis setelah selesai.");
    } catch (err) {
        if (tab) tab.close();
        notify(err.message || friendlyError(err));
    } finally { btn.disabled = false; }
}

async function syncBank() {
    const btn = $("#btnBrickSync"); btn.disabled = true;
    notify("Menarik mutasi terbaru...");
    try {
        const { data, error } = await sb.functions.invoke("brick-sync", { body: {} });
        if (error) throw new Error(await fnError(error, data));
        await muat();
        notify(data.note || (data.errors ? "Sebagian rekening gagal disinkron." : `Selesai. ${data.imported} transaksi baru.`));
    } catch (err) {
        notify(err.message || friendlyError(err));
    } finally { btn.disabled = false; }
}

$("#btnBrick").addEventListener("click", connectBank);
$("#btnBrickSync").addEventListener("click", syncBank);
$("#btnAddAcc").addEventListener("click", addAccount);
$("#btnTransfer").addEventListener("click", startTransfer);
document.addEventListener("click", (e) => {
    if (e.target.closest("#btnAddEmpty")) return addAccount();
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const card = btn.closest("[data-acc]");
    const acc = card && accounts.find((a) => String(a.id) === card.dataset.acc);
    if (!acc) return;
    ({ mutasi: mutasiModal, impor: importModal, saldo: adjustModal, hapus: deleteAccount })[btn.dataset.act](acc);
});

(async () => {
    user = await requireAuth();
    if (!user) return;
    namaUser = (user.email || "").split("@")[0];
    try {
        const p = await getProfile(user.id);
        if (p && p.nama) namaUser = p.nama;
        await muat();
        watchRealtime(user, muat);
    } catch (err) {
        $("#accountList").innerHTML = `<section class="card"><div class="empty">${esc(friendlyError(err))}</div></section>`;
        $("#totalSub").textContent = "Gagal memuat data";
    }
})();
