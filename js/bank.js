/* =====================================================
   DUITIE - logika rekening & e-wallet (murni, tanpa DOM)
   - hitung saldo per rekening dari transaksi
   - baca mutasi CSV dari bank / e-wallet
   - kategori otomatis
===================================================== */
(function (root) {
    "use strict";

    /* ---------- Daftar bank & e-wallet ---------- */
    const BANKS = [
        { name: "BCA", jenis: "bank", color: "#0060af" },
        { name: "BNI", jenis: "bank", color: "#f26b21" },
        { name: "BRI", jenis: "bank", color: "#00529c" },
        { name: "Mandiri", jenis: "bank", color: "#003d79" },
        { name: "BTN", jenis: "bank", color: "#e8a200" },
        { name: "CIMB Niaga", jenis: "bank", color: "#8f0f24" },
        { name: "Permata", jenis: "bank", color: "#1c9b5b" },
        { name: "BSI", jenis: "bank", color: "#00a39d" },
        { name: "Jago", jenis: "bank", color: "#f5a300" },
        { name: "SeaBank", jenis: "bank", color: "#ff6a39" },
        { name: "Blu", jenis: "bank", color: "#0a6ed1" },
        { name: "Dana", jenis: "ewallet", color: "#118eea" },
        { name: "GoPay", jenis: "ewallet", color: "#00aed6" },
        { name: "OVO", jenis: "ewallet", color: "#4c3494" },
        { name: "ShopeePay", jenis: "ewallet", color: "#ee4d2d" },
        { name: "LinkAja", jenis: "ewallet", color: "#e82127" },
        { name: "Tunai", jenis: "tunai", color: "#10b981" },
        { name: "Lainnya", jenis: "bank", color: "#8b5cf6" }
    ];

    function bankInfo(name) {
        const n = String(name || "").trim().toLowerCase();
        return BANKS.find((b) => b.name.toLowerCase() === n)
            || { name: name || "Lainnya", jenis: "bank", color: "#8b5cf6" };
    }

    function maskNomor(nomor) {
        const s = String(nomor || "").replace(/\s+/g, "");
        if (!s || s === "-") return "";
        return s.length <= 4 ? s : "•••• " + s.slice(-4);
    }

    /* ---------- Saldo ---------- */
    // Saldo = saldo_awal + semua pemasukan - semua pengeluaran yang tertaut ke rekening
    // (termasuk transfer & penyesuaian). "masuk/keluar" = pemasukan/pengeluaran asli
    // (tanpa transfer & penyesuaian) pada rentang [awal, akhir] yang diberikan.
    function computeBalances(accounts, trx, range) {
        const out = {};
        accounts.forEach((a) => {
            out[a.id] = { saldo: Number(a.saldo_awal) || 0, masuk: 0, keluar: 0, jumlah: 0, terakhir: null };
        });
        trx.forEach((t) => {
            const b = out[t.account_id];
            if (!b) return;
            const n = Number(t.nominal) || 0;
            b.saldo += t.tipe === "masuk" ? n : -n;
            b.jumlah += 1;
            if (!b.terakhir || t.tanggal > b.terakhir) b.terakhir = t.tanggal;
            if (t.is_transfer) return;
            if (range && (t.tanggal < range.awal || t.tanggal > range.akhir)) return;
            if (t.tipe === "masuk") b.masuk += n; else b.keluar += n;
        });
        return out;
    }

    function sumBalances(balances) {
        return Object.values(balances).reduce((s, b) => s + b.saldo, 0);
    }

    /* ---------- Kategori otomatis ---------- */
    const RULES_KELUAR = [
        ["Makanan", /makan|resto|restaurant|kfc|mcd|mcdonald|starbucks|kopi|cafe|warung|gofood|grabfood|shopeefood|bakso|nasi|ayam|bakery|pizza|burger|janji jiwa|chatime|kopken/i],
        ["Transportasi", /gojek|gocar|goride|grab(?!food)|bensin|pertamina|spbu|\btol\b|parkir|krl|\bmrt\b|lrt|transjakarta|commuter|kereta|bluebird|maxim|indrive/i],
        ["Belanja", /tokopedia|shopee(?!food|pay)|lazada|bukalapak|blibli|tiktok|indomaret|alfamart|alfamidi|supermarket|hypermart|transmart|ikea|uniqlo/i],
        ["Tagihan", /\bpln\b|listrik|pdam|telkom|indihome|pulsa|telkomsel|indosat|\bxl\b|axis|smartfren|\btri\b|bpjs|token|wifi|asuransi|cicilan|angsuran|biaya adm|admin fee|biaya admin|pajak|\bbi-?fast\b.*biaya/i],
        ["Hiburan", /netflix|spotify|youtube|steam|bioskop|\bcgv\b|\bxxi\b|disney|vidio|hbo|playstation|nintendo|game/i]
    ];
    const RULES_MASUK = [
        ["Gaji", /gaji|salary|payroll/i],
        ["Bonus", /bonus|\bthr\b|insentif|komisi/i]
    ];

    function categorize(keterangan, tipe) {
        const text = String(keterangan || "");
        const rules = tipe === "masuk" ? RULES_MASUK : RULES_KELUAR;
        for (const [nama, re] of rules) if (re.test(text)) return nama;
        return "Lainnya";
    }

    /* ---------- Parser angka & tanggal ---------- */
    // Mengembalikan angka bertanda (negatif untuk DB/debit/kurung/minus) atau null.
    function parseAmount(raw) {
        if (raw === null || raw === undefined) return null;
        let s = String(raw).trim();
        if (!s) return null;
        let sign = 1;
        if (/\b(db|dr|debit|debet)\b\.?$/i.test(s) || /^(db|dr)\b/i.test(s)) sign = -1;
        s = s.replace(/\b(cr|kr|kredit|credit|db|dr|debit|debet)\b\.?/gi, "");
        if (/^\(.*\)$/.test(s.trim())) { sign = -1; s = s.trim().slice(1, -1); }
        s = s.replace(/rp\.?|idr|\s/gi, "");
        if (s.startsWith("-")) { sign = -sign; s = s.slice(1); }
        else if (s.startsWith("+")) s = s.slice(1);
        if (s.endsWith("-")) { sign = -sign; s = s.slice(0, -1); }
        if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

        const lastDot = s.lastIndexOf("."), lastCom = s.lastIndexOf(",");
        let dec = "";
        if (lastDot >= 0 && lastCom >= 0) {
            dec = lastDot > lastCom ? "." : ",";
        } else if (lastDot >= 0 || lastCom >= 0) {
            const sep = lastDot >= 0 ? "." : ",";
            const count = s.split(sep).length - 1;
            const after = s.length - s.lastIndexOf(sep) - 1;
            // satu pemisah + 3 digit di belakang = ribuan; 1-2 digit = desimal
            if (count === 1 && after !== 3) dec = sep;
        }
        let intPart = s, frac = "";
        if (dec) {
            const i = s.lastIndexOf(dec);
            intPart = s.slice(0, i); frac = s.slice(i + 1);
        }
        intPart = intPart.replace(/[.,]/g, "");
        const n = Number(intPart + (frac ? "." + frac : ""));
        return Number.isFinite(n) ? sign * n : null;
    }

    const MONTHS = {
        jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3,
        apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7,
        agu: 8, agt: 8, agustus: 8, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
        okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12
    };

    function iso(y, m, d) {
        const dt = new Date(y, m - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }

    function parseDate(raw, defaultYear) {
        if (!raw) return null;
        let s = String(raw).trim().replace(/^'/, "");
        s = s.replace(/[T\s]\d{1,2}:\d{2}(:\d{2})?.*$/, "").trim();
        let m;
        if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return iso(+m[1], +m[2], +m[3]);
        if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
            let y = +m[3]; if (y < 100) y += 2000;
            return iso(y, +m[2], +m[1]);
        }
        if ((m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]+)[-/ ,]*(\d{2,4})$/))) {
            const mo = MONTHS[m[2].toLowerCase()];
            let y = +m[3]; if (y < 100) y += 2000;
            return mo ? iso(y, mo, +m[1]) : null;
        }
        if ((m = s.match(/^(\d{1,2})\/(\d{1,2})$/)) && defaultYear) return iso(defaultYear, +m[2], +m[1]);
        return null;
    }

    /* ---------- Parser CSV ---------- */
    function detectDelimiter(text) {
        const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
        const counts = { ",": 0, ";": 0, "\t": 0 };
        let q = false;
        for (const ch of sample) {
            if (ch === '"') q = !q;
            else if (!q && ch in counts) counts[ch]++;
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    }

    function parseCSV(text) {
        text = String(text || "").replace(/^\uFEFF/, "");
        const delim = detectDelimiter(text);
        const rows = [];
        let row = [], cell = "", q = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (q) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
                } else cell += ch;
            } else if (ch === '"') q = true;
            else if (ch === delim) { row.push(cell); cell = ""; }
            else if (ch === "\n" || ch === "\r") {
                if (ch === "\r" && text[i + 1] === "\n") i++;
                row.push(cell); cell = "";
                if (row.some((c) => c.trim() !== "")) rows.push(row);
                row = [];
            } else cell += ch;
        }
        row.push(cell);
        if (row.some((c) => c.trim() !== "")) rows.push(row);
        return rows;
    }

    const COLS = [
        ["date", /tanggal|\bdate\b|\btgl\b|waktu/i],
        ["debit", /debit|debet|dana keluar|uang keluar|pengeluaran|\bkeluar\b|\bdb\b/i],
        ["credit", /kredit|credit|dana masuk|uang masuk|pemasukan|\bmasuk\b|\bcr\b/i],
        ["balance", /saldo|balance/i],
        ["type", /^(dk|d\/k|cr\/db|db\/cr|tipe|type|jenis)$/i],
        ["amount", /jumlah|nominal|amount|nilai|mutasi/i],
        ["desc", /keterangan|deskripsi|description|uraian|remark|berita|transaksi|rincian|detail/i]
    ];

    function mapHeader(cells) {
        const map = {};
        cells.forEach((c, i) => {
            const label = String(c || "").trim();
            if (!label) return;
            for (const [role, re] of COLS) {
                if (map[role] === undefined && re.test(label)) { map[role] = i; break; }
            }
        });
        return map;
    }

    function fnv1a(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(36);
    }

    // Baca teks CSV mutasi -> { rows, skipped, error }
    // rows: [{tanggal, tipe, nominal, keterangan, kategori, saldo, external_id}]
    function parseStatement(text, opts) {
        const defaultYear = (opts && opts.defaultYear) || new Date().getFullYear();
        const all = parseCSV(text);
        let headerIdx = -1, map = null;
        for (let i = 0; i < Math.min(all.length, 25); i++) {
            const m = mapHeader(all[i]);
            if (m.date !== undefined && (m.debit !== undefined || m.credit !== undefined || m.amount !== undefined)) {
                headerIdx = i; map = m; break;
            }
        }
        if (!map) {
            return { rows: [], skipped: 0, error: "Kolom tidak dikenali. Pastikan file punya baris judul dengan kolom Tanggal, Keterangan, dan Jumlah (atau Debit/Kredit)." };
        }

        const rows = [], seen = {};
        let skipped = 0;
        for (let i = headerIdx + 1; i < all.length; i++) {
            const r = all[i];
            const tanggal = parseDate(r[map.date], defaultYear);
            if (!tanggal) { skipped++; continue; }

            let signed = null;
            const deb = map.debit !== undefined ? parseAmount(r[map.debit]) : null;
            const kre = map.credit !== undefined ? parseAmount(r[map.credit]) : null;
            if (deb && Math.abs(deb) > 0) signed = -Math.abs(deb);
            else if (kre && Math.abs(kre) > 0) signed = Math.abs(kre);
            else if (map.amount !== undefined) {
                signed = parseAmount(r[map.amount]);
                const raw = String(r[map.amount] || "");
                const tipeRaw = map.type !== undefined ? String(r[map.type] || "").trim() : "";
                const hasMarker = /\b(db|dr|cr|kr|debit|kredit)\b/i.test(raw) || /^\(.*\)$/.test(raw.trim()) || /^\s*[-+]/.test(raw);
                if (signed !== null && !hasMarker && tipeRaw) {
                    signed = /^(d|db|dr|debit|debet|keluar|out)/i.test(tipeRaw) ? -Math.abs(signed) : Math.abs(signed);
                }
            }
            if (signed === null || signed === 0) { skipped++; continue; }

            const tipe = signed < 0 ? "keluar" : "masuk";
            const nominal = Math.abs(signed);
            const keterangan = String(map.desc !== undefined ? r[map.desc] : "").replace(/\s+/g, " ").trim().slice(0, 200);
            const saldo = map.balance !== undefined ? parseAmount(r[map.balance]) : null;
            const base = `${tanggal}|${tipe}|${nominal}|${keterangan.toLowerCase()}|${saldo ?? ""}`;
            seen[base] = (seen[base] || 0) + 1;
            rows.push({
                tanggal, tipe, nominal, keterangan, saldo,
                kategori: categorize(keterangan, tipe),
                external_id: "csv-" + fnv1a(base) + "-" + seen[base]
            });
        }
        if (!rows.length) return { rows, skipped, error: "Tidak ada transaksi valid yang bisa dibaca dari file ini." };
        return { rows, skipped, error: null };
    }

    // Saldo akhir menurut file (baris paling baru), atau null
    function latestBalance(rows) {
        const withSaldo = rows.filter((r) => r.saldo !== null && r.saldo !== undefined);
        if (!withSaldo.length) return null;
        const desc = rows[0].tanggal > rows[rows.length - 1].tanggal;
        const maxDate = withSaldo.reduce((m, r) => (r.tanggal > m ? r.tanggal : m), "");
        const sameDay = withSaldo.filter((r) => r.tanggal === maxDate);
        return (desc ? sameDay[0] : sameDay[sameDay.length - 1]).saldo;
    }

    function randomToken() {
        const a = new Uint8Array(32);
        (root.crypto || {}).getRandomValues
            ? root.crypto.getRandomValues(a)
            : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
        return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    }

    const api = { BANKS, bankInfo, maskNomor, computeBalances, sumBalances, categorize,
        parseAmount, parseDate, parseCSV, parseStatement, latestBalance, randomToken };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.DuitieBank = api;
})(typeof window !== "undefined" ? window : globalThis);
