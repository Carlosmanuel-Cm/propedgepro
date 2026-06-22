/* ============================================================
   PROPEDGE PRO v5 — supabase.js
   ============================================================
   SOLO DEBES EDITAR LAS 2 LÍNEAS DE ABAJO:
   SUPABASE_URL      → tu Project URL  (Settings → API)
   SUPABASE_ANON_KEY → tu anon key     (Settings → API)
   ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* ══════════════════════════════════════════════
   *** EDITA SOLO ESTAS 2 LÍNEAS ***
══════════════════════════════════════════════ */
const SUPABASE_URL      = 'https://svrvqmzflnpmjtuqcooz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Nc5yWZR_uhPQDilIYH16fQ_MxmU1NqE';
/* ══════════════════════════════════════════════ */

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   SQL — Ejecuta esto en Supabase → SQL Editor → New query → Run
   ============================================================

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  role text default 'trader' check (role in ('admin','trader','viewer')),
  init_balance numeric default 50000,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "p1" on public.profiles for select using (auth.uid() = id);
create policy "p2" on public.profiles for update using (auth.uid() = id);
create policy "p3" on public.profiles for insert with check (auth.uid() = id);

create table public.trades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  date date, time text, pair text, type text,
  lot numeric, entry numeric, sl numeric, tp numeric,
  pnl numeric, risk numeric, rr text,
  session text, setup text, emotion text, notes text,
  created_at timestamptz default now()
);
alter table public.trades enable row level security;
create policy "t1" on public.trades for all using (auth.uid() = user_id);

create table public.prop_firms (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  firm text, phase text, size numeric, target numeric,
  gain numeric default 0, dd numeric, dd_used numeric default 0,
  min_days int default 5, days_traded int default 0,
  start_date date, notes text,
  created_at timestamptz default now()
);
alter table public.prop_firms enable row level security;
create policy "pf1" on public.prop_firms for all using (auth.uid() = user_id);

create table public.payouts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  firm text, amount numeric, status text, date date, notes text,
  created_at timestamptz default now()
);
alter table public.payouts enable row level security;
create policy "py1" on public.payouts for all using (auth.uid() = user_id);

create table public.playbook (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text, content text, category text, priority text, date text,
  created_at timestamptz default now()
);
alter table public.playbook enable row level security;
create policy "pl1" on public.playbook for all using (auth.uid() = user_id);

create table public.psyc_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  date date, emocion text, confianza int, estres int,
  disciplina int, plan int, comentarios text,
  created_at timestamptz default now()
);
alter table public.psyc_entries enable row level security;
create policy "ps1" on public.psyc_entries for all using (auth.uid() = user_id);

create table public.risk_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  date text, pair text, balance numeric, risk numeric,
  stop numeric, lot text, risk_money text, rr numeric,
  created_at timestamptz default now()
);
alter table public.risk_history enable row level security;
create policy "rh1" on public.risk_history for all using (auth.uid() = user_id);

create table public.ai_analyses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  content text,
  trades_count int,
  created_at timestamptz default now()
);
alter table public.ai_analyses enable row level security;
create policy "ai1" on public.ai_analyses for all using (auth.uid() = user_id);

   ============================================================ */

/* ── helpers ─────────────────────────────────────────────── */
function ok(data)  { return { data, error: null }; }
function er(e, l='') {
  console.error('[DB'+(l?'/'+l:'')+']', e?.message || e);
  return { data: null, error: e };
}

/* ── AUTH ──────────────────────────────────────────────────── */
export async function signUp(email, password, username, role='trader') {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return er(error, 'signUp');
  const { error: pe } = await supabase.from('profiles')
    .insert({ id: data.user.id, username, role, init_balance: 50000 });
  if (pe) return er(pe, 'profile');
  return ok(data.user);
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return er(error, 'signIn');
  return ok(data.user);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return error ? er(error) : ok(true);
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles')
    .select('*').eq('id', userId).single();
  return error ? er(error, 'getProfile') : ok(data);
}

export async function updateInitBalance(userId, balance) {
  const { error } = await supabase.from('profiles')
    .update({ init_balance: balance }).eq('id', userId);
  return error ? er(error) : ok(true);
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? er(error) : ok(true);
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email,
    { redirectTo: window.location.origin });
  return error ? er(error) : ok(true);
}

/* ── TRADES ─────────────────────────────────────────────────── */
export async function fetchTrades(uid) {
  const { data, error } = await supabase.from('trades').select('*')
    .eq('user_id', uid).order('date', { ascending: true })
    .order('time', { ascending: true });
  return error ? er(error, 'fetchTrades') : ok(data);
}

export async function insertTrade(uid, trade) {
  const { data, error } = await supabase.from('trades')
    .insert({ user_id: uid, ...trade }).select().single();
  return error ? er(error, 'insertTrade') : ok(data);
}

export async function updateTrade(id, trade) {
  const { data, error } = await supabase.from('trades')
    .update(trade).eq('id', id).select().single();
  return error ? er(error, 'updateTrade') : ok(data);
}

export async function deleteTrade(id) {
  const { error } = await supabase.from('trades').delete().eq('id', id);
  return error ? er(error) : ok(true);
}

export async function deleteAllTrades(uid) {
  const { error } = await supabase.from('trades').delete().eq('user_id', uid);
  return error ? er(error) : ok(true);
}

/* ── PROP FIRMS ─────────────────────────────────────────────── */
export async function fetchPropFirms(uid) {
  const { data, error } = await supabase.from('prop_firms').select('*')
    .eq('user_id', uid).order('created_at', { ascending: false });
  return error ? er(error, 'fetchPropFirms') : ok(data);
}

export async function upsertPropFirm(uid, firm, id = null) {
  const payload = { user_id: uid, ...firm };
  if (id) payload.id = id;
  const { data, error } = await supabase.from('prop_firms')
    .upsert(payload).select().single();
  return error ? er(error, 'upsertPropFirm') : ok(data);
}

export async function deletePropFirm(id) {
  const { error } = await supabase.from('prop_firms').delete().eq('id', id);
  return error ? er(error) : ok(true);
}

/* ── PAYOUTS ─────────────────────────────────────────────────── */
export async function fetchPayouts(uid) {
  const { data, error } = await supabase.from('payouts').select('*')
    .eq('user_id', uid).order('created_at', { ascending: false });
  return error ? er(error, 'fetchPayouts') : ok(data);
}

export async function insertPayout(uid, payout) {
  const { data, error } = await supabase.from('payouts')
    .insert({ user_id: uid, ...payout }).select().single();
  return error ? er(error, 'insertPayout') : ok(data);
}

export async function deletePayout(id) {
  const { error } = await supabase.from('payouts').delete().eq('id', id);
  return error ? er(error) : ok(true);
}

/* ── PLAYBOOK ────────────────────────────────────────────────── */
export async function fetchPlaybook(uid) {
  const { data, error } = await supabase.from('playbook').select('*')
    .eq('user_id', uid).order('created_at', { ascending: false });
  return error ? er(error, 'fetchPlaybook') : ok(data);
}

export async function insertPlaybookRule(uid, rule) {
  const { data, error } = await supabase.from('playbook')
    .insert({ user_id: uid, ...rule }).select().single();
  return error ? er(error, 'insertPlaybookRule') : ok(data);
}

export async function deletePlaybookRule(id) {
  const { error } = await supabase.from('playbook').delete().eq('id', id);
  return error ? er(error) : ok(true);
}

/* ── PSICOLOGÍA ──────────────────────────────────────────────── */
export async function fetchPsyc(uid) {
  const { data, error } = await supabase.from('psyc_entries').select('*')
    .eq('user_id', uid).order('date', { ascending: false });
  return error ? er(error, 'fetchPsyc') : ok(data);
}

export async function insertPsyc(uid, entry) {
  const { data, error } = await supabase.from('psyc_entries')
    .insert({ user_id: uid, ...entry }).select().single();
  return error ? er(error, 'insertPsyc') : ok(data);
}

export async function deletePsycEntry(id) {
  const { error } = await supabase.from('psyc_entries').delete().eq('id', id);
  return error ? er(error) : ok(true);
}

/* ── RISK HISTORY ────────────────────────────────────────────── */
export async function fetchRiskHistory(uid) {
  const { data, error } = await supabase.from('risk_history').select('*')
    .eq('user_id', uid).order('created_at', { ascending: false }).limit(10);
  return error ? er(error, 'fetchRiskHistory') : ok(data);
}

export async function insertRiskHistory(uid, calc) {
  const { data: existing } = await supabase.from('risk_history')
    .select('id').eq('user_id', uid).order('created_at', { ascending: true });
  if (existing && existing.length >= 10) {
    await supabase.from('risk_history').delete().eq('id', existing[0].id);
  }
  const { data, error } = await supabase.from('risk_history')
    .insert({ user_id: uid, ...calc }).select().single();
  return error ? er(error, 'insertRiskHistory') : ok(data);
}

/* ── IA COACH ─────────────────────────────────────────────────── */
export async function fetchAiAnalyses(uid) {
  const { data, error } = await supabase.from('ai_analyses').select('*')
    .eq('user_id', uid).order('created_at', { ascending: false }).limit(10);
  return error ? er(error, 'fetchAiAnalyses') : ok(data);
}

export async function insertAiAnalysis(uid, content, tradesCount) {
  const { data, error } = await supabase.from('ai_analyses')
    .insert({ user_id: uid, content, trades_count: tradesCount }).select().single();
  return error ? er(error, 'insertAiAnalysis') : ok(data);
}

/* ── BACKUP COMPLETO ─────────────────────────────────────────── */
export async function fetchAllDataForBackup(uid) {
  const [t, pf, py, pl, ps, rh] = await Promise.all([
    fetchTrades(uid), fetchPropFirms(uid), fetchPayouts(uid),
    fetchPlaybook(uid), fetchPsyc(uid), fetchRiskHistory(uid)
  ]);
  return {
    trades:      t.data  || [],
    propFirms:   pf.data || [],
    payouts:     py.data || [],
    playbook:    pl.data || [],
    psycEntries: ps.data || [],
    riskHistory: rh.data || [],
    exportDate:  new Date().toISOString(),
    version:     'v5'
  };
}

export async function restoreAllData(uid, backup) {
  await Promise.all([
    supabase.from('trades').delete().eq('user_id', uid),
    supabase.from('prop_firms').delete().eq('user_id', uid),
    supabase.from('payouts').delete().eq('user_id', uid),
    supabase.from('playbook').delete().eq('user_id', uid),
    supabase.from('psyc_entries').delete().eq('user_id', uid),
    supabase.from('risk_history').delete().eq('user_id', uid),
  ]);
  const clean = arr => (arr || []).map(({ id, user_id, created_at, ...r }) =>
    ({ user_id: uid, ...r }));
  const ops = [];
  if (backup.trades?.length)      ops.push(supabase.from('trades').insert(clean(backup.trades)));
  if (backup.propFirms?.length)   ops.push(supabase.from('prop_firms').insert(clean(backup.propFirms)));
  if (backup.payouts?.length)     ops.push(supabase.from('payouts').insert(clean(backup.payouts)));
  if (backup.playbook?.length)    ops.push(supabase.from('playbook').insert(clean(backup.playbook)));
  if (backup.psycEntries?.length) ops.push(supabase.from('psyc_entries').insert(clean(backup.psycEntries)));
  const results = await Promise.all(ops);
  const failed  = results.filter(r => r.error);
  return failed.length ? er(failed[0].error, 'restore') : ok(true);
}
