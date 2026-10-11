# Duitie - aplikasi manajemen keuangan

## Setup (sekali saja)
1. Supabase Dashboard > SQL Editor > tempel isi `supabase/schema.sql` > Run.
   **Jalankan ulang file ini walau sebelumnya sudah pernah** - aman diulang, dan wajib untuk fitur rekening/saldo yang baru.
2. (Opsional, agar tidak perlu konfirmasi email saat uji coba) Authentication > Providers > Email > matikan "Confirm email".
3. Authentication > URL Configuration: isi Site URL dan Redirect URLs dengan alamat tempat web ini dihosting.
4. Login Google/Apple: aktifkan di Authentication > Providers.
5. Jalankan lewat web server (bukan klik-ganda file), mis. `npx serve .` atau VS Code Live Server. Mulai dari `index.html`.

## Yang baru di versi ini
- **Beranda baru** (`dashboard.html`): tampilan dari desain beranda baru, terhubung ke data Supabase (saldo semua rekening, recap bulan, rekening, jurnal, target).
- **Tema baru** dipakai juga di Buku Kas, Laporan, dan Rekening (`css/theme.css`).
- **Bottom nav baru** di semua halaman utama: Beranda, Buku Kas, Laporan, Target, Profil (`js/nav.js`, satu sumber untuk semua halaman).
- **Rekening & E-Wallet** (`rekening.html`): pelacakan saldo, pemasukan/pengeluaran per rekening, transfer antar rekening, penyesuaian saldo, dan impor mutasi CSV.

## Soal "API perbankan gratis"
Per Oktober 2026 tidak ada API resmi gratis yang bisa dipakai perorangan untuk membaca saldo/mutasi rekening di Indonesia:
API bank (BCA, Mandiri, BTN, dll.) mensyaratkan badan usaha dan perjanjian kerja sama; Plaid tidak melayani Indonesia;
layanan "cek mutasi" pihak ketiga bekerja dengan login ke internet banking pengguna (berisiko dan umumnya melanggar ketentuan bank),
sehingga **sengaja tidak dipakai**. Sebagai gantinya Duitie menyediakan dua jalur yang aman dan gratis:

1. **Catat manual** - pilih rekening saat mencatat di Buku Kas.
2. **Impor mutasi CSV** - dari internet banking / aplikasi e-wallet. Mendukung pemisah `,` `;` Tab, format angka Indonesia & internasional,
   kolom Debit/Kredit, Jumlah dengan DB/CR, atau tanda minus. Impor ulang file yang sama tidak membuat data dobel.


## Login Google & nomor HP
- **Google:** Supabase > Authentication > Sign In / Providers > Google > aktifkan, isi Client ID & Secret dari Google Cloud Console
  (OAuth client tipe Web). Di Google Cloud, Authorized redirect URI = `https://<project>.supabase.co/auth/v1/callback`.
  Di Supabase > URL Configuration, Site URL & Redirect URLs harus berisi alamat situsmu (mis. `https://namamu.vercel.app/**`).
- **Nomor HP:** Supabase > Authentication > Sign In / Providers > Phone > aktifkan, lalu pilih penyedia SMS (Twilio, MessageBird, Vonage, dll.).
  Penyedia SMS umumnya berbayar. Tanpa ini kode SMS tidak terkirim.
- Halaman login memeriksa penyedia mana yang aktif dan menampilkan pesan yang jelas bila belum diaktifkan.

## Brick (open banking)
1. Jalankan ulang `supabase/schema.sql`.
2. Simpan kunci sebagai secret (JANGAN di kode / GitHub):
   `supabase secrets set BRICK_CLIENT_ID=... BRICK_CLIENT_SECRET=... BRICK_ENV=sandbox`
3. Deploy:
   `supabase functions deploy brick-connect`
   `supabase functions deploy brick-sync`
   `supabase functions deploy brick-callback --no-verify-jwt`
4. Halaman Rekening > **Hubungkan bank** > login lewat halaman Brick > rekening muncul otomatis. Tombol **Sinkron bank** menarik mutasi terbaru.
5. Kode belum diuji ke akun Brick. Bila ada yang meleset, lihat `supabase functions logs brick-callback` dan sesuaikan nama field di `supabase/functions/_shared/brick.ts`.
6. Untuk produksi: ganti `BRICK_ENV=production` dan pakai kunci produksi.

## Cara kerja saldo
`Saldo rekening = saldo awal + semua pemasukan - semua pengeluaran yang tertaut ke rekening itu` (termasuk transfer & penyesuaian).
Transfer antar rekening dan "Penyesuaian saldo" **tidak dihitung** sebagai pemasukan/pengeluaran di Beranda, Buku Kas, Laporan, maupun ekspor.
Menghapus rekening tidak menghapus transaksinya (hanya melepas tautan).

## Struktur
- `css/theme.css`, `css/nav.css` - tema & navigasi bawah
- `js/ui.js` - modal, toast, form catat/transfer; `js/bank.js` - logika saldo, parser CSV, kategori otomatis (tanpa DOM, bisa diuji di Node)
- `supabase/schema.sql` - skema lengkap + fungsi `duitie_ingest`
