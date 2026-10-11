-- =====================================================
-- DUITIE - skema database Supabase
-- Cara pakai: Supabase Dashboard > SQL Editor > New query
-- > tempel seluruh isi file ini > Run. Aman dijalankan ulang.
-- =====================================================

-- 1. PROFIL PENGGUNA ---------------------------------
create table if not exists public.duitie_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nama          text,
  username      text,
  email         text,
  telepon       text,
  tanggal_lahir date,
  gender        text check (gender in ('Laki-laki','Perempuan') or gender is null),
  alamat        text,
  foto          text,
  notifikasi    jsonb not null default
    '{"transaksi":true,"pembayaran":true,"promo":false,"email":false}'::jsonb,
  created_at    timestamptz not null default now()
);
create unique index if not exists duitie_profiles_username_key
  on public.duitie_profiles (lower(username)) where username is not null and username <> '';

-- 2. KATEGORI PENGELUARAN -----------------------------
create table if not exists public.duitie_categories (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nama       text not null check (char_length(trim(nama)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists duitie_categories_user_idx on public.duitie_categories (user_id);

-- 3. TRANSAKSI (BUKU KAS) -----------------------------
create table if not exists public.duitie_transactions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tanggal    date not null default current_date,
  tipe       text not null check (tipe in ('masuk','keluar')),
  kategori   text not null,
  keterangan text not null default '',
  nominal    numeric(15,2) not null check (nominal > 0),
  created_at timestamptz not null default now()
);
create index if not exists duitie_transactions_user_date_idx on public.duitie_transactions (user_id, tanggal desc);

-- 4. TARGET KEUANGAN ----------------------------------
create table if not exists public.duitie_goals (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  category   text not null default 'Lainnya',
  target     numeric(15,2) not null check (target > 0),
  saved      numeric(15,2) not null default 0 check (saved >= 0),
  deadline   date not null,
  created_at timestamptz not null default now()
);
create index if not exists duitie_goals_user_idx on public.duitie_goals (user_id);

-- 5. REKENING BANK ------------------------------------
create table if not exists public.duitie_bank_accounts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bank       text not null,
  nomor      text not null,
  pemilik    text not null,
  created_at timestamptz not null default now()
);
create index if not exists duitie_bank_accounts_user_idx on public.duitie_bank_accounts (user_id);

-- 6. ROW LEVEL SECURITY: setiap user hanya bisa akses datanya sendiri
alter table public.duitie_profiles      enable row level security;
alter table public.duitie_categories    enable row level security;
alter table public.duitie_transactions  enable row level security;
alter table public.duitie_goals         enable row level security;
alter table public.duitie_bank_accounts enable row level security;

drop policy if exists "duitie_profiles_own" on public.duitie_profiles;
create policy "duitie_profiles_own" on public.duitie_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "duitie_categories_own" on public.duitie_categories;
create policy "duitie_categories_own" on public.duitie_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "duitie_transactions_own" on public.duitie_transactions;
create policy "duitie_transactions_own" on public.duitie_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "duitie_goals_own" on public.duitie_goals;
create policy "duitie_goals_own" on public.duitie_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "duitie_bank_accounts_own" on public.duitie_bank_accounts;
create policy "duitie_bank_accounts_own" on public.duitie_bank_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 7. BUAT PROFIL OTOMATIS SAAT USER DAFTAR ------------
create or replace function public.duitie_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.duitie_profiles (id, nama, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nama', new.raw_user_meta_data->>'full_name', nullif(split_part(coalesce(new.email, ''), '@', 1), ''), new.phone),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists duitie_on_auth_user_created on auth.users;
create trigger duitie_on_auth_user_created
  after insert on auth.users
  for each row execute function public.duitie_handle_new_user();

-- Profil untuk akun yang sudah ada sebelum skema ini dijalankan
insert into public.duitie_profiles (id, nama, email)
select u.id, coalesce(u.raw_user_meta_data->>'nama', split_part(u.email, '@', 1)), u.email
from auth.users u
on conflict (id) do nothing;


-- =====================================================
-- TAMBAHAN: PELACAKAN SALDO REKENING & E-WALLET
-- (aman dijalankan ulang; jalankan seluruh file ini sekali lagi
--  jika kamu sebelumnya sudah memakai versi lama)
-- =====================================================

-- 8. Rekening: saldo awal, token sinkronisasi, waktu sinkron terakhir
alter table public.duitie_bank_accounts
  add column if not exists saldo_awal   numeric(15,2) not null default 0,
  add column if not exists last_sync_at timestamptz,
  add column if not exists sync_token   text not null
    default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
create unique index if not exists duitie_bank_accounts_token_key
  on public.duitie_bank_accounts (sync_token);

-- 9. Transaksi: tautan ke rekening, penanda transfer, id eksternal (anti-duplikat)
alter table public.duitie_transactions
  add column if not exists account_id  bigint references public.duitie_bank_accounts(id) on delete set null,
  add column if not exists is_transfer boolean not null default false,
  add column if not exists transfer_id uuid,
  add column if not exists external_id text,
  add column if not exists sumber      text not null default 'manual';
alter table public.duitie_transactions drop constraint if exists duitie_transactions_sumber_check;
alter table public.duitie_transactions add constraint duitie_transactions_sumber_check
  check (sumber in ('manual','csv','sync'));
create index if not exists duitie_transactions_account_idx on public.duitie_transactions (account_id);
create index if not exists duitie_transactions_transfer_idx on public.duitie_transactions (transfer_id) where transfer_id is not null;
-- baris tanpa external_id (input manual) tidak saling bentrok karena NULL dianggap berbeda
create unique index if not exists duitie_transactions_external_key
  on public.duitie_transactions (account_id, external_id);

-- Transaksi hanya boleh tertaut ke rekening milik sendiri
drop policy if exists "duitie_transactions_own" on public.duitie_transactions;
create policy "duitie_transactions_own" on public.duitie_transactions
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (duitie_transactions.account_id is null or exists (
      select 1 from public.duitie_bank_accounts a
      where a.id = duitie_transactions.account_id and a.user_id = auth.uid()))
  );

-- 10. Penerima mutasi otomatis (webhook)
-- Dipanggil lewat  POST {SUPABASE_URL}/rest/v1/rpc/duitie_ingest
-- Hanya bisa MENAMBAH transaksi ke satu rekening yang cocok dengan token-nya;
-- tidak bisa membaca data apa pun.
create or replace function public.duitie_ingest(
  p_token        text,
  p_transactions jsonb,
  p_balance      numeric default null
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  acc      public.duitie_bank_accounts%rowtype;
  item     jsonb;
  v_amount numeric;
  v_tipe   text;
  v_date   date;
  v_desc   text;
  v_cat    text;
  v_ext    text;
  n        int;
  ins      int := 0;
  skp      int := 0;
  cur      numeric;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'token tidak valid' using errcode = '28000';
  end if;
  select * into acc from public.duitie_bank_accounts where sync_token = p_token;
  if not found then
    raise exception 'token tidak valid' using errcode = '28000';
  end if;

  if p_transactions is null or jsonb_typeof(p_transactions) <> 'array' then
    p_transactions := '[]'::jsonb;
  end if;
  if jsonb_array_length(p_transactions) > 500 then
    raise exception 'maksimal 500 transaksi per permintaan';
  end if;

  for item in select * from jsonb_array_elements(p_transactions) loop
    begin
      v_amount := (item->>'amount')::numeric;
      v_tipe   := lower(coalesce(item->>'type', ''));
      if v_tipe in ('masuk','credit','cr','kredit','in') then
        v_tipe := 'masuk';
      elsif v_tipe in ('keluar','debit','db','debet','out') then
        v_tipe := 'keluar';
      elsif v_amount < 0 then
        v_tipe := 'keluar';
      else
        v_tipe := 'masuk';
      end if;
      v_amount := abs(v_amount);
      if v_amount is null or v_amount <= 0 then
        skp := skp + 1; continue;
      end if;

      v_date := coalesce(nullif(item->>'date', '')::date, current_date);
      v_desc := left(coalesce(item->>'description', ''), 200);
      v_ext  := coalesce(nullif(item->>'id', ''),
                         md5(v_date::text || '|' || v_tipe || '|' || v_amount::text || '|' || lower(v_desc)));
      v_cat  := nullif(trim(item->>'category'), '');
      if v_cat is null then
        if v_tipe = 'masuk' then
          v_cat := case
            when v_desc ~* 'gaji|salary|payroll' then 'Gaji'
            when v_desc ~* 'bonus|thr|insentif|komisi' then 'Bonus'
            else 'Lainnya' end;
        else
          v_cat := case
            when v_desc ~* 'makan|resto|kfc|mcd|starbucks|kopi|cafe|warung|gofood|grabfood|shopeefood' then 'Makanan'
            when v_desc ~* 'gojek|gocar|goride|grab|bensin|pertamina|spbu|parkir|krl|mrt|transjakarta' then 'Transportasi'
            when v_desc ~* 'tokopedia|shopee|lazada|bukalapak|blibli|indomaret|alfamart' then 'Belanja'
            when v_desc ~* 'pln|listrik|pdam|telkom|indihome|pulsa|bpjs|token|wifi|asuransi|cicilan|biaya adm' then 'Tagihan'
            when v_desc ~* 'netflix|spotify|youtube|steam|bioskop|cgv|xxi|disney' then 'Hiburan'
            else 'Lainnya' end;
        end if;
      end if;

      insert into public.duitie_transactions
        (user_id, account_id, tanggal, tipe, kategori, keterangan, nominal, external_id, sumber)
      values
        (acc.user_id, acc.id, v_date, v_tipe, v_cat, v_desc, v_amount, v_ext, 'sync')
      on conflict (account_id, external_id) do nothing;
      get diagnostics n = row_count;
      ins := ins + n;
      skp := skp + (1 - n);
    exception when others then
      skp := skp + 1;
    end;
  end loop;

  -- Jika penyedia mengirim saldo resmi bank, samakan saldo di Duitie dengan saldo itu
  if p_balance is not null then
    select acc.saldo_awal + coalesce(sum(case when tipe = 'masuk' then nominal else -nominal end), 0)
      into cur
      from public.duitie_transactions where account_id = acc.id;
    update public.duitie_bank_accounts
       set saldo_awal = saldo_awal + (p_balance - cur), last_sync_at = now()
     where id = acc.id;
  else
    update public.duitie_bank_accounts set last_sync_at = now() where id = acc.id;
  end if;

  return jsonb_build_object('inserted', ins, 'skipped', skp);
end;
$$;

revoke all on function public.duitie_ingest(text, jsonb, numeric) from public;
grant execute on function public.duitie_ingest(text, jsonb, numeric) to anon, authenticated;


-- =====================================================
-- TAMBAHAN: REALTIME
-- Agar transaksi yang masuk lewat webhook langsung muncul di layar.
-- =====================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='duitie_transactions') then
    alter publication supabase_realtime add table public.duitie_transactions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='duitie_bank_accounts') then
    alter publication supabase_realtime add table public.duitie_bank_accounts;
  end if;
end $$;


-- =====================================================
-- TAMBAHAN: RIWAYAT TARGET (setor & ambil tabungan)
-- =====================================================
create table if not exists public.duitie_goal_history (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id       bigint not null references public.duitie_goals(id) on delete cascade,
  tipe          text not null check (tipe in ('setor','tarik')),
  nominal       numeric(15,2) not null check (nominal > 0),
  saldo_setelah numeric(15,2) not null,
  catatan       text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists duitie_goal_history_goal_idx on public.duitie_goal_history (goal_id, created_at desc);
alter table public.duitie_goal_history enable row level security;

drop policy if exists "duitie_goal_history_select" on public.duitie_goal_history;
create policy "duitie_goal_history_select" on public.duitie_goal_history
  for select using (auth.uid() = user_id);
drop policy if exists "duitie_goal_history_insert" on public.duitie_goal_history;
create policy "duitie_goal_history_insert" on public.duitie_goal_history
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.duitie_goals g where g.id = goal_id and g.user_id = auth.uid()));

-- Tambah / ambil tabungan secara atomik + catat riwayatnya.
create or replace function public.duitie_goal_adjust(
  p_goal_id bigint, p_tipe text, p_nominal numeric, p_catatan text default ''
) returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  g    public.duitie_goals%rowtype;
  baru numeric;
begin
  if auth.uid() is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  if p_tipe not in ('setor','tarik') then raise exception 'Jenis transaksi tidak valid.'; end if;
  if p_nominal is null or p_nominal <= 0 then raise exception 'Nominal harus lebih dari 0.'; end if;
  select * into g from public.duitie_goals where id = p_goal_id and user_id = auth.uid() for update;
  if not found then raise exception 'Target tidak ditemukan.'; end if;
  if p_tipe = 'tarik' and p_nominal > g.saved then
    raise exception 'Tabungan di target ini tidak cukup untuk diambil sebesar itu.';
  end if;
  baru := case when p_tipe = 'setor' then g.saved + p_nominal else g.saved - p_nominal end;
  update public.duitie_goals set saved = baru where id = g.id;
  insert into public.duitie_goal_history (user_id, goal_id, tipe, nominal, saldo_setelah, catatan)
  values (auth.uid(), g.id, p_tipe, p_nominal, baru, left(coalesce(p_catatan, ''), 120));
  return baru;
end;
$$;
revoke all on function public.duitie_goal_adjust(bigint, text, numeric, text) from public, anon;
grant execute on function public.duitie_goal_adjust(bigint, text, numeric, text) to authenticated;

-- Isi riwayat awal untuk target lama yang sudah punya tabungan
insert into public.duitie_goal_history (user_id, goal_id, tipe, nominal, saldo_setelah, catatan, created_at)
select g.user_id, g.id, 'setor', g.saved, g.saved, 'Saldo awal', g.created_at
from public.duitie_goals g
where g.saved > 0 and not exists (select 1 from public.duitie_goal_history h where h.goal_id = g.id);


-- =====================================================
-- TAMBAHAN: PEMETAAN AKUN PENYEDIA OPEN BANKING -> REKENING DUITIE
-- Tanpa policy = hanya bisa diakses service role (Edge Function), tidak dari browser.
-- =====================================================
create table if not exists public.duitie_provider_links (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references auth.users(id) on delete cascade,
  account_id          bigint not null references public.duitie_bank_accounts(id) on delete cascade,
  provider            text not null,
  provider_account_id text not null,
  created_at          timestamptz not null default now(),
  unique (provider, provider_account_id)
);
alter table public.duitie_provider_links enable row level security;


-- =====================================================
-- TAMBAHAN: BRICK (open banking)
-- Token akses pengguna Brick disimpan di sini. Tanpa policy = hanya service role
-- (Edge Function) yang bisa membaca; browser tidak bisa.
-- =====================================================
create table if not exists public.duitie_brick_connections (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  access_token text not null,
  created_at   timestamptz not null default now()
);
create index if not exists duitie_brick_connections_user_idx on public.duitie_brick_connections (user_id);
alter table public.duitie_brick_connections enable row level security;

-- Samakan saldo rekening dengan saldo resmi dari bank (hanya service role)
create or replace function public.duitie_set_balance(p_account bigint, p_balance numeric)
returns void
language plpgsql
security definer set search_path = public
as $$
declare cur numeric; acc public.duitie_bank_accounts%rowtype;
begin
  select * into acc from public.duitie_bank_accounts where id = p_account;
  if not found then return; end if;
  select acc.saldo_awal + coalesce(sum(case when tipe = 'masuk' then nominal else -nominal end), 0)
    into cur from public.duitie_transactions where account_id = p_account;
  update public.duitie_bank_accounts
     set saldo_awal = saldo_awal + (p_balance - cur), last_sync_at = now()
   where id = p_account;
end;
$$;
revoke all on function public.duitie_set_balance(bigint, numeric) from public, anon, authenticated;
grant execute on function public.duitie_set_balance(bigint, numeric) to service_role;
