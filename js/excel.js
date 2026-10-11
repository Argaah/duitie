/* Ekspor data keuangan (Excel & PDF) dari tabel transactions */

async function ambilData() {
    const user = await requireAuth();
    if (!user) return null;
    try {
        const rows = (await loadTransactions(user)).filter((t) => !t.is_transfer); // transfer & penyesuaian saldo bukan pemasukan/pengeluaran
        // urut dari yang paling lama agar mudah dibaca sebagai buku kas
        return rows.reverse().map((t) => ({
            tanggal: formatTanggal(t.tanggal),
            keterangan: t.keterangan || "-",
            kategori: t.kategori,
            pemasukan: t.tipe === "masuk" ? t.nominal : 0,
            pengeluaran: t.tipe === "keluar" ? t.nominal : 0
        }));
    } catch (err) {
        alert(friendlyError(err));
        return null;
    }
}

function totalDari(data) {
    const masuk = data.reduce((s, d) => s + d.pemasukan, 0);
    const keluar = data.reduce((s, d) => s + d.pengeluaran, 0);
    return { masuk, keluar, saldo: masuk - keluar };
}

// =========================
// EKSPOR EXCEL
// =========================
async function eksporExcel() {
    const dataKeuangan = await ambilData();
    if (!dataKeuangan) return;
    if (!dataKeuangan.length) return alert("Belum ada data transaksi untuk diekspor.");

    const dataExcel = dataKeuangan.map((d) => ({
        "Tanggal": d.tanggal,
        "Keterangan": d.keterangan,
        "Kategori": d.kategori,
        "Pemasukan": d.pemasukan,
        "Pengeluaran": d.pengeluaran
    }));

    const t = totalDari(dataKeuangan);
    dataExcel.push({
        "Tanggal": "", "Keterangan": "TOTAL", "Kategori": "",
        "Pemasukan": t.masuk, "Pengeluaran": t.keluar
    });

    const worksheet = XLSX.utils.json_to_sheet(dataExcel);
    worksheet["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data Keuangan");
    XLSX.writeFile(workbook, "Data_Keuangan.xlsx");
}

// =========================
// EKSPOR PDF
// =========================
async function eksporPDF() {
    const dataKeuangan = await ambilData();
    if (!dataKeuangan) return;
    if (!dataKeuangan.length) return alert("Belum ada data transaksi untuk diekspor.");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const rp = (n) => "Rp " + Number(n).toLocaleString("id-ID");

    doc.setFontSize(18);
    doc.text("LAPORAN DATA KEUANGAN", 20, 20);

    doc.setFontSize(10);
    let y = 35;

    dataKeuangan.forEach((data, index) => {
        if (y > 245) {
            doc.addPage();
            y = 20;
        }
        doc.text(`${index + 1}. ${data.tanggal}`, 20, y);
        doc.text(`Keterangan: ${data.keterangan}`, 30, y + 7);
        doc.text(`Kategori: ${data.kategori}`, 30, y + 14);
        doc.text(`Pemasukan: ${rp(data.pemasukan)}`, 30, y + 21);
        doc.text(`Pengeluaran: ${rp(data.pengeluaran)}`, 30, y + 28);
        y += 40;
    });

    const t = totalDari(dataKeuangan);
    if (y > 245) {
        doc.addPage();
        y = 20;
    }
    doc.setFontSize(12);
    doc.text(`Total Pemasukan : ${rp(t.masuk)}`, 20, y);
    doc.text(`Total Pengeluaran : ${rp(t.keluar)}`, 20, y + 8);
    doc.text(`Saldo : ${rp(t.saldo)}`, 20, y + 16);

    doc.save("Data_Keuangan.pdf");
}

requireAuth();
