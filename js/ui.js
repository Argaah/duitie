/* =====================================================
   DUITIE - komponen UI bersama (tema beranda baru)
   Dimuat setelah app.js dan bank.js
===================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const Bank = window.DuitieBank;

/* ---------- Toast ---------- */
(function ensureToast() {
    if (!document.getElementById("toast")) {
        const t = document.createElement("div");
        t.id = "toast"; t.setAttribute("role", "status");
        document.body.appendChild(t);
    }
})();

/* ---------- Format ---------- */
const HARI_BULAN = (iso) => parseISODate(iso)
    .toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });
const formatBulan = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return `${BULAN[m - 1]} ${y}`;
};
const signedRp = (n) => (n < 0 ? "-" : "") + rupiah(Math.abs(n));

function monthRange(ym) {
    const [y, m] = ym.split("-").map(Number);
    return { awal: `${ym}-01`, akhir: toISODate(new Date(y, m, 0)) };
}

/* ---------- Gaya kategori (ikon & warna) ---------- */
const CAT_STYLES = [
    [/makan|food|resto|kuliner|minum|kopi/i, "fa-utensils", "#ef4444"],
    [/transport|bensin|ojek|parkir|tol/i, "fa-car", "#8b5cf6"],
    [/belanja|shop/i, "fa-cart-shopping", "#f59e0b"],
    [/tagihan|listrik|pulsa|internet|cicilan|admin/i, "fa-file-invoice", "#0ea5e9"],
    [/hibur|game|film|nonton/i, "fa-gamepad", "#ec4899"],
    [/gaji|salary|uang saku/i, "fa-money-bill-wave", "#3b82f6"],
    [/bonus|thr|hadiah/i, "fa-gift", "#10b981"],
    [/transfer/i, "fa-right-left", "#6366f1"],
    [/penyesuaian/i, "fa-scale-balanced", "#94a3b8"],
    [/kesehatan|obat|dokter/i, "fa-heart-pulse", "#14b8a6"],
    [/pendidikan|sekolah|kuliah/i, "fa-graduation-cap", "#6366f1"]
];
const CAT_PALETTE = ["#ef4444", "#8b5cf6", "#f59e0b", "#0ea5e9", "#ec4899", "#14b8a6", "#6366f1", "#10b981"];

function catStyle(nama, tipe) {
    const n = String(nama || "");
    for (const [re, icon, color] of CAT_STYLES) if (re.test(n)) return { icon, color };
    if (/^lain/i.test(n)) return tipe === "masuk"
        ? { icon: "fa-coins", color: "#14b8a6" } : { icon: "fa-ellipsis", color: "#64748b" };
    let h = 0;
    for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { icon: "fa-tag", color: CAT_PALETTE[h % CAT_PALETTE.length] };
}

/* ---------- Modal ---------- */
// onSubmit(data, overlay) boleh async; kembalikan false untuk menahan modal tetap terbuka.
function openModal(title, bodyHTML, onSubmit, opts = {}) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <form class="modal${opts.wide ? " wide" : ""}" novalidate>
            <h3>${title}</h3>
            ${bodyHTML}
            <div class="modal-actions">
                <button type="button" class="btn-cancel">${opts.cancelText || "Batal"}</button>
                ${onSubmit ? `<button type="submit" class="btn-save">${opts.submitText || "Simpan"}</button>` : ""}
            </div>
        </form>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("form");
    const close = () => overlay.remove();
    overlay.close = close;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector(".btn-cancel").addEventListener("click", close);
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!onSubmit) return close();
        const btn = form.querySelector(".btn-save");
        btn.disabled = true;
        try {
            const ok = await onSubmit(Object.fromEntries(new FormData(form)), overlay);
            if (ok !== false) close();
        } catch (err) {
            notify(friendlyError(err));
        } finally {
            btn.disabled = false;
        }
    });
    const first = form.querySelector("input:not([type=file]),select");
    if (first && !opts.noFocus) first.focus();
    return overlay;
}

function askConfirm(message, onYes, yesText = "Hapus") {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="modal">
            <h3>Konfirmasi</h3>
            <p style="font-size:14px;line-height:1.5">${message}</p>
            <div class="modal-actions">
                <button type="button" class="btn-cancel">Batal</button>
                <button type="button" class="btn-save" style="background:linear-gradient(90deg,#f87171,#fca5a5)">${yesText}</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector(".btn-cancel").addEventListener("click", close);
    overlay.querySelector(".btn-save").addEventListener("click", async () => {
        close();
        try { await onYes(); } catch (err) { notify(friendlyError(err)); }
    });
}

/* ---------- Daftar transaksi (gaya jurnal) ---------- */
function accountLabel(a) {
    const m = Bank.maskNomor(a.nomor);
    return a.bank + (m ? " " + m : "");
}

function renderJournal(list, accMap, opts = {}) {
    if (!list.length) return `<div class="empty">${opts.empty || "Belum ada catatan."}</div>`;
    return list.map((t) => {
        const c = catStyle(t.kategori, t.tipe);
        const isIn = t.tipe === "masuk";
        const acc = t.account_id && accMap[t.account_id];
        const sub = [t.kategori, acc ? acc.bank : null].filter(Boolean).join(" • ");
        const cls = t.is_transfer ? "text-purple" : isIn ? "text-green" : "text-red";
        return `
        <div class="journal-item">
            <div class="icon-box" style="background:${c.color}"><i class="fa-solid ${c.icon}"></i></div>
            <div class="journal-info">
                <span class="date">${HARI_BULAN(t.tanggal)}</span>
                <span class="title">${esc(t.keterangan || t.kategori)}</span>
                <span class="sub">${esc(sub)}</span>
            </div>
            <div class="amount ${cls}">${isIn ? "+" : "-"}${rupiah(t.nominal)}</div>
            ${opts.del === false ? "" : `<button class="mini-btn" data-action="del-tx" data-id="${t.id}" title="Hapus"><i class="fa-solid fa-trash"></i></button>`}
        </div>`;
    }).join("");
}

// Hapus transaksi (kedua sisi jika transfer). Mengembalikan promise.
async function deleteTransaction(t) {
    const q = sb.from("duitie_transactions").delete();
    const { error } = t.transfer_id ? await q.eq("transfer_id", t.transfer_id) : await q.eq("id", t.id);
    if (error) throw error;
}

function confirmDeleteTransaction(t, after) {
    askConfirm(t.transfer_id ? "Hapus transfer ini? Kedua sisi transfer akan ikut terhapus." : "Hapus catatan ini?",
        async () => { await deleteTransaction(t); notify("Catatan dihapus."); await after(); });
}

/* ---------- Form "Catat Baru" (pengeluaran / pemasukan / transfer) ---------- */
// ctx: { user, categories:[nama], accounts:[...], date, onSaved }
function openTransactionModal(ctx) {
    const accOpts = (withNone) => (withNone ? '<option value="">Tanpa rekening (tunai)</option>' : "") +
        ctx.accounts.map((a) => `<option value="${a.id}">${esc(accountLabel(a))}</option>`).join("");
    const catOpts = (tipe) => (tipe === "masuk" ? INCOME_CATEGORIES : ctx.categories)
        .map((n) => `<option>${esc(n)}</option>`).join("");
    const canTransfer = ctx.accounts.length >= 2;

    const overlay = openModal("Catat Baru", `
        <label>Jenis</label>
        <select name="tipe" id="fTipe">
            <option value="keluar">Pengeluaran</option>
            <option value="masuk">Pemasukan</option>
            ${canTransfer ? '<option value="transfer">Transfer antar rekening</option>' : ""}
        </select>
        <label>Nominal (Rp)</label>
        <input name="nominal" type="number" min="1" step="any" inputmode="decimal" placeholder="35000">
        <div id="fgNormal">
            <label>Keterangan</label>
            <input name="keterangan" type="text" maxlength="80" placeholder="contoh: Makan siang">
            <label>Kategori</label>
            <select name="kategori" id="fKat">${catOpts("keluar")}</select>
            <label>Rekening / dompet</label>
            <select name="account_id" id="fAcc">${accOpts(true)}</select>
        </div>
        <div id="fgTransfer" hidden>
            <label>Dari rekening</label>
            <select name="from_id" id="fFrom">${accOpts(false)}</select>
            <label>Ke rekening</label>
            <select name="to_id" id="fTo">${accOpts(false)}</select>
            <label>Catatan (opsional)</label>
            <input name="catatan" type="text" maxlength="60" placeholder="contoh: Top up Dana">
        </div>
        <label>Tanggal</label>
        <input name="tanggal" type="date" value="${ctx.date || todayISO()}">
    `, async (f) => {
        const nominal = Number(f.nominal);
        if (!(nominal > 0)) { notify("Nominal harus lebih dari 0."); return false; }
        if (!f.tanggal) { notify("Tanggal wajib diisi."); return false; }

        if (f.tipe === "transfer") {
            if (!f.from_id || !f.to_id || f.from_id === f.to_id) {
                notify("Pilih dua rekening yang berbeda."); return false;
            }
            const from = ctx.accounts.find((a) => String(a.id) === f.from_id);
            const to = ctx.accounts.find((a) => String(a.id) === f.to_id);
            const id = crypto.randomUUID();
            const extra = f.catatan ? " - " + f.catatan.trim() : "";
            const base = { user_id: ctx.user.id, tanggal: f.tanggal, nominal, kategori: "Transfer",
                is_transfer: true, transfer_id: id, sumber: "manual" };
            const { error } = await sb.from("duitie_transactions").insert([
                { ...base, tipe: "keluar", account_id: from.id, keterangan: `Transfer ke ${to.bank}${extra}` },
                { ...base, tipe: "masuk", account_id: to.id, keterangan: `Transfer dari ${from.bank}${extra}` }
            ]);
            if (error) throw error;
        } else {
            const { error } = await sb.from("duitie_transactions").insert({
                user_id: ctx.user.id, tanggal: f.tanggal, tipe: f.tipe, nominal,
                kategori: f.kategori, keterangan: (f.keterangan || "").trim(),
                account_id: f.account_id ? Number(f.account_id) : null, sumber: "manual"
            });
            if (error) throw error;
        }
        notify("Catatan tersimpan.");
        if (ctx.onSaved) await ctx.onSaved(f.tanggal.slice(0, 7));
    });

    $("#fTipe", overlay).addEventListener("change", (e) => {
        const tr = e.target.value === "transfer";
        $("#fgNormal", overlay).hidden = tr;
        $("#fgTransfer", overlay).hidden = !tr;
        if (!tr) $("#fKat", overlay).innerHTML = catOpts(e.target.value);
    });
    if (canTransfer) $("#fTo", overlay).selectedIndex = 1;
    if (canTransfer && ctx.tipe === "transfer") {
        $("#fTipe", overlay).value = "transfer";
        $("#fTipe", overlay).dispatchEvent(new Event("change"));
    }
    return overlay;
}

/* Pilih bulan (modal) */
function pickMonth(current, onPick) {
    openModal("Pilih Bulan", `
        <label>Bulan</label>
        <input name="month" type="month" value="${current}">
    `, (f) => {
        if (!f.month) return false;
        onPick(f.month);
    });
}

/* Rapikan angka bank untuk input */
const num = (v) => Number(String(v ?? "").replace(/[^0-9.\-]/g, "")) || 0;
