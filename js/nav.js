/* Navigasi bawah - satu sumber untuk semua halaman.
   Halaman menandai dirinya dengan <body data-page="home|kas|laporan|target|profil"> */
(function () {
    const items = [
        ["dashboard.html", "Beranda", "fa-house", "home"],
        ["buku-kas.html", "Buku Kas", "fa-wallet", "kas"],
        ["laporan.html", "Laporan", "fa-chart-column", "laporan"],
        ["target.html", "Target", "fa-bullseye", "target"],
        ["profile.html", "Profil", "fa-user", "profil"]
    ];
    const page = document.body.dataset.page;
    let nav = document.getElementById("bottomNav");
    if (!nav) {
        nav = document.createElement("nav");
        nav.id = "bottomNav";
        nav.className = "bottom-nav";
        document.body.appendChild(nav);
    }
    nav.setAttribute("aria-label", "Navigasi utama");
    nav.innerHTML = items.map(([href, label, icon, key]) =>
        `<a href="${href}" class="${key === page ? "active" : ""}"${key === page ? ' aria-current="page"' : ""}>` +
        `<i class="fa-solid ${icon}"></i><span>${label}</span></a>`).join("");
    document.body.classList.add("has-bottom-nav");
})();
