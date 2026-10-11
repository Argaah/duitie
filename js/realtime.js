/* =====================================================
   DUITIE - pembaruan realtime
   Saat ada transaksi/rekening berubah di database (mis. masuk lewat
   webhook sinkron otomatis), halaman memuat ulang datanya sendiri
   tanpa perlu di-refresh.
===================================================== */
function watchRealtime(user, onChange) {
    let timer = null;
    const refresh = () => {                 // gabungkan banyak event jadi satu muat ulang
        clearTimeout(timer);
        timer = setTimeout(() => { Promise.resolve(onChange()).catch(() => {}); }, 400);
    };
    const filter = `user_id=eq.${user.id}`;
    const channel = sb.channel("duitie-live-" + user.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "duitie_transactions", filter }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "duitie_bank_accounts", filter }, refresh)
        .subscribe();
    // cadangan: sinkron ulang saat tab kembali aktif (jika koneksi realtime sempat putus)
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
    return () => sb.removeChannel(channel);
}
