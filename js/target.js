// ===== Target Keuangan -> tabel goals di Supabase =====

const $ = (id) => document.getElementById(id);
let goals = [];
let currentUser = null;
const historyCache = {};          // goal_id -> daftar riwayat
const openHistory = new Set();    // goal_id yang riwayatnya sedang dibuka

const toast = notify;

// Hitung sisa waktu dan setoran per bulan yang dibutuhkan
function analyze(g) {
  const remaining = Math.max(g.target - g.saved, 0);
  const done = g.saved >= g.target;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((parseISODate(g.deadline) - today) / 86400000);
  const late = !done && days < 0;
  const months = Math.max(Math.ceil(days / 30), 1);
  return { remaining, done, days, late, perMonth: Math.ceil(remaining / months) };
}

async function loadGoals() {
  const { data, error } = await sb.from("duitie_goals")
    .select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false });
  if (error) throw error;
  goals = data.map((g) => ({ ...g, target: Number(g.target), saved: Number(g.saved) }));
  render();
}

function render() {
  const list = $("goalList");
  list.innerHTML = "";

  const filter = $("filter").value;
  const shown = goals.filter((g) => {
    const done = g.saved >= g.target;
    return filter === "all" || (filter === "done" ? done : !done);
  });

  $("empty").hidden = shown.length > 0;

  shown.forEach((g) => list.appendChild(card(g)));
  renderSummary();
}

function renderSummary() {
  const saved = goals.reduce((s, g) => s + Math.min(g.saved, g.target), 0);
  const target = goals.reduce((s, g) => s + g.target, 0);
  const done = goals.filter((g) => g.saved >= g.target).length;
  const pct = target ? Math.round((saved / target) * 100) : 0;

  $("sumSaved").textContent = rupiah(saved);
  $("sumTarget").textContent = rupiah(target);
  $("sumDone").textContent = `${done} dari ${goals.length}`;
  $("overallFill").style.width = pct + "%";
  $("overallBar").setAttribute("aria-valuenow", pct);
}

// Membuat kartu target dengan DOM (aman dari injeksi HTML)
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function card(g) {
  const a = analyze(g);
  const pct = Math.min(Math.round((g.saved / g.target) * 100), 100);

  const box = el("article", "goal" + (a.done ? " done" : a.late ? " late" : ""));

  const top = el("div", "goal-top");
  const title = el("div");
  title.append(el("h3", "", g.name), el("span", "tag", g.category));
  const status = el("span", "status" + (a.done ? " done" : a.late ? " late" : ""),
    a.done ? "Tercapai" : a.late ? "Melewati tenggat" : `${a.days} hari lagi`);
  top.append(title, status);

  const amounts = el("div", "amounts");
  amounts.append(el("strong", "", rupiah(g.saved)), el("span", "", `dari ${rupiah(g.target)}`));

  const bar = el("div", "bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuenow", pct);
  bar.setAttribute("aria-valuemin", 0);
  bar.setAttribute("aria-valuemax", 100);
  const fill = el("div", "bar-fill");
  fill.style.width = pct + "%";
  bar.appendChild(fill);

  const meta = el("div", "meta");
  meta.append(
    el("span", "", `${pct}% • sisa ${rupiah(a.remaining)}`),
    el("span", "", a.done ? "Selamat, target selesai!" : `Perlu ${rupiah(a.perMonth)} per bulan`)
  );

  box.append(top, amounts, bar, meta);

  // Setor / ambil tabungan
  const dep = el("div", "deposit");
  const input = el("input");
  input.type = "number";
  input.min = "1000";
  input.step = "1000";
  input.placeholder = "Nominal (Rp)";
  input.setAttribute("aria-label", `Nominal untuk ${g.name}`);
  dep.appendChild(input);
  if (!a.done) {
    const add = el("button", "btn", "Tambah");
    add.type = "button";
    add.addEventListener("click", () => deposit(g.id, Number(input.value)));
    input.addEventListener("keydown", (e) => e.key === "Enter" && add.click());
    dep.appendChild(add);
  }
  const take = el("button", "btn out", "Ambil");
  take.type = "button";
  take.title = "Ambil uang dari tabungan target ini";
  take.disabled = g.saved <= 0;
  take.addEventListener("click", () => withdraw(g.id, Number(input.value)));
  dep.appendChild(take);
  box.appendChild(dep);

  // Riwayat + hapus
  const acts = el("div", "goal-actions");
  const hist = el("button", "icon-btn soft", openHistory.has(g.id) ? "Sembunyikan riwayat" : "Riwayat");
  hist.type = "button";
  hist.addEventListener("click", () => toggleHistory(g.id));
  const del = el("button", "icon-btn", "Hapus");
  del.type = "button";
  del.setAttribute("aria-label", `Hapus target ${g.name}`);
  del.addEventListener("click", () => remove(g.id));
  acts.append(hist, del);
  box.appendChild(acts);

  if (openHistory.has(g.id)) box.appendChild(historyPanel(g.id));

  return box;
}

// Catat saldo awal ke riwayat (hanya jika > 0). Gagal mencatat tidak membatalkan target.
async function logInitial(list) {
  const rows = list.filter((g) => Number(g.saved) > 0).map((g) => ({
    user_id: currentUser.id, goal_id: g.id, tipe: "setor",
    nominal: Number(g.saved), saldo_setelah: Number(g.saved), catatan: "Saldo awal",
  }));
  if (rows.length) await sb.from("duitie_goal_history").insert(rows);
}

async function adjust(id, tipe, nominal, catatan) {
  const { data, error } = await sb.rpc("duitie_goal_adjust", {
    p_goal_id: id, p_tipe: tipe, p_nominal: nominal, p_catatan: catatan || "",
  });
  if (error) throw error;
  const g = goals.find((x) => x.id === id);
  if (g) g.saved = Number(data);
  delete historyCache[id];
  if (openHistory.has(id)) await loadHistory(id);
  render();
  return g;
}

async function deposit(id, amount) {
  if (!amount || amount <= 0) return toast("Masukkan nominal setoran lebih dari 0.");
  try {
    const g = await adjust(id, "setor", amount, "");
    toast(g && g.saved >= g.target ? `Target "${g.name}" tercapai!` : `Tabungan ditambahkan: ${rupiah(amount)}`);
  } catch (err) {
    toast(friendlyError(err));
  }
}

async function withdraw(id, prefill) {
  const g = goals.find((x) => x.id === id);
  if (!g) return;
  const res = await Dialog.form({
    title: "Ambil tabungan",
    icon: "↓",
    message: `Target "${g.name}" • tersedia ${rupiah(g.saved)}`,
    okText: "Ambil uang",
    fields: [
      { name: "nominal", label: "Nominal diambil (Rp)", type: "number", min: 1, step: 1000, value: prefill > 0 ? prefill : "", placeholder: "Contoh: 500000", required: true },
      { name: "catatan", label: "Untuk apa? (opsional)", maxLength: 120, placeholder: "Contoh: biaya servis motor" },
    ],
    validate: (v) => {
      const n = Number(v.nominal);
      if (!(n > 0)) return "Nominal harus lebih dari 0.";
      if (n > g.saved) return `Maksimal yang bisa diambil ${rupiah(g.saved)}.`;
      return null;
    },
  });
  if (!res) return;
  try {
    await adjust(id, "tarik", Number(res.nominal), res.catatan);
    toast(`Tabungan diambil: ${rupiah(Number(res.nominal))}`);
  } catch (err) {
    toast(friendlyError(err));
  }
}

async function loadHistory(id) {
  const { data, error } = await sb.from("duitie_goal_history")
    .select("*").eq("goal_id", id).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  historyCache[id] = data;
}

async function toggleHistory(id) {
  if (openHistory.has(id)) {
    openHistory.delete(id);
  } else {
    openHistory.add(id);
    if (!historyCache[id]) {
      try { await loadHistory(id); } catch (err) { openHistory.delete(id); return toast(friendlyError(err)); }
    }
  }
  render();
}

function fmtWaktu(iso) {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function historyPanel(id) {
  const wrap = el("div", "history");
  wrap.appendChild(el("h4", "", "Riwayat tabungan"));
  const rows = historyCache[id] || [];
  if (!rows.length) {
    wrap.appendChild(el("p", "hist-empty", "Belum ada riwayat. Setoran dan pengambilan berikutnya akan tercatat di sini."));
    return wrap;
  }
  const ul = el("ul", "hist-list");
  rows.forEach((h) => {
    const setor = h.tipe === "setor";
    const li = el("li", "hist-item " + h.tipe);
    const ico = el("div", "hist-ico", setor ? "+" : "−");
    const main = el("div", "hist-main");
    main.append(el("strong", "", setor ? (h.catatan === "Saldo awal" ? "Saldo awal" : "Menabung") : "Ambil tabungan"), el("small", "", fmtWaktu(h.created_at)));
    if (h.catatan && h.catatan !== "Saldo awal") main.appendChild(el("small", "", h.catatan));
    const amt = el("div", "hist-amt");
    amt.append(el("span", "", (setor ? "+" : "−") + rupiah(Number(h.nominal))), el("small", "", "Saldo " + rupiah(Number(h.saldo_setelah))));
    li.append(ico, main, amt);
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
  return wrap;
}

async function remove(id) {
  const g = goals.find((x) => x.id === id);
  if (!g) return;
  const ok = await Dialog.confirm(`Target "${g.name}" beserta riwayatnya akan dihapus permanen.`, { title: "Hapus target", okText: "Hapus", danger: true });
  if (!ok) return;
  try {
    const { error } = await sb.from("duitie_goals").delete().eq("id", id);
    if (error) throw error;
    goals = goals.filter((x) => x.id !== id);
    openHistory.delete(id);
    delete historyCache[id];
    render();
    toast("Target dihapus.");
  } catch (err) {
    toast(friendlyError(err));
  }
}

// Form tambah target
$("goalForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const target = Number($("target").value);
  const saved = Number($("saved").value) || 0;
  if (saved < 0 || target <= 0) return toast("Nominal tidak valid.");

  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const { data: baru, error } = await sb.from("duitie_goals").insert({
      user_id: currentUser.id,
      name: $("name").value.trim(),
      category: $("category").value,
      target,
      saved,
      deadline: $("deadline").value,
    }).select("id").single();
    if (error) throw error;
    await logInitial([{ id: baru.id, saved }]);
    form.reset();
    $("saved").value = 0;
    await loadGoals();
    toast("Target disimpan.");
  } catch (err) {
    toast(friendlyError(err));
  } finally {
    button.disabled = false;
  }
});

$("filter").addEventListener("change", render);

// Contoh data agar tampilan langsung terlihat (disimpan ke database)
$("sampleBtn").addEventListener("click", async () => {
  if (!await Dialog.confirm("Tambahkan 4 contoh target ke akunmu?", { title: "Contoh target", okText: "Tambahkan" })) return;
  const inMonths = (m) => {
    const d = new Date();
    d.setMonth(d.getMonth() + m);
    return toISODate(d);
  };
  const contoh = [
    { name: "Dana darurat 6 bulan", category: "Dana darurat", target: 30000000, saved: 12500000, deadline: inMonths(10) },
    { name: "Laptop untuk kuliah", category: "Gadget", target: 9000000, saved: 9000000, deadline: inMonths(2) },
    { name: "Liburan akhir tahun", category: "Liburan", target: 7500000, saved: 2000000, deadline: inMonths(5) },
    { name: "DP motor", category: "Kendaraan", target: 5000000, saved: 1000000, deadline: inMonths(-1) },
  ].map((g) => ({ ...g, user_id: currentUser.id }));
  try {
    const { data: baru, error } = await sb.from("duitie_goals").insert(contoh).select("id, saved");
    if (error) throw error;
    await logInitial(baru);
    await loadGoals();
    toast("Contoh target dimuat.");
  } catch (err) {
    toast(friendlyError(err));
  }
});

// Tanggal minimal = hari ini
$("deadline").min = todayISO();

(async () => {
  currentUser = await requireAuth();
  if (!currentUser) return;
  try {
    await loadGoals();
  } catch (err) {
    toast(friendlyError(err));
    render();
  }
})();
