/* ============================================================
   PROPEDGE PRO v5 — app.js (ESM + Supabase)
   ============================================================
   ✅ Auth real con Supabase (email/password)
   ✅ Base de datos en la nube (PostgreSQL)
   ✅ Cada usuario ve SOLO sus propios datos
   ✅ Auto-login si ya hay sesión activa
   ✅ Recuperación de contraseña por email
   ✅ Cambiar contraseña desde Configuración
   ✅ Crear usuarios desde panel de admin
   ✅ Indicador visual de sincronización
   ✅ Migración automática de datos locales a la nube
   ✅ Todo el resto de features de v4.5 intactos
   ============================================================ */

import {
  supabase,
  signIn, signUp, signOut, getSession, getProfile,
  updateInitBalance, updatePassword, resetPassword,
  fetchTrades, insertTrade, updateTrade, deleteTrade, deleteAllTrades, fetchAccounts,
  createAccount, archiveAccount, getTradeCountForAccount, deleteAccount,
  fetchPropFirms, upsertPropFirm, deletePropFirm,
  fetchPayouts, insertPayout, deletePayout as deletePayoutDB,
  fetchPlaybook, insertPlaybookRule, deletePlaybookRule,
  fetchPsyc, insertPsyc, deletePsycEntry,
  fetchRiskHistory, insertRiskHistory,
fetchAllDataForBackup, restoreAllData,
bulkInsertTrades,
} from './supabase.js';

// ── STATE ─────────────────────────────────────────────────────
let trades=[], accounts=[], riskHistory=[], playbook=[], propFirms=[], payouts=[], psycEntries=[];
let currentUser=null, currentProfile=null, currentAccountId=null;
let importParsed=null, importValidTrades=[], importErrors=[];
let newsFilter='all', isDark=true, editIndex=null, editPropIdx=null, editTradeId=null;
let charts={};

function getInitBalance() {
  return parseFloat(currentProfile?.init_balance || 50000);
}

// ── LOADING OVERLAY ───────────────────────────────────────────
function showLoading(text='Cargando...') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingOverlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

// ── SYNC BADGE ────────────────────────────────────────────────
let syncTimer;
function showSync() {
  const el = document.getElementById('syncStatus');
  el.classList.remove('hidden');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3200);
}

// ── TEMA ─────────────────────────────────────────────────────
function applyTheme(dark) {
  isDark = dark;
  document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  const lbl = dark?'🌙 Modo Oscuro':'☀️ Modo Claro';
  document.getElementById('themeBtn').textContent = lbl;
  const sb = document.getElementById('settingsThemeBtn');
  if (sb) sb.textContent = lbl;
}
document.getElementById('themeBtn').addEventListener('click', ()=>applyTheme(!isDark));
applyTheme(true);

document.getElementById('sidebarToggle').addEventListener('click', ()=>
  document.getElementById('sidebar').classList.toggle('open')
);

// ── RELOJ ─────────────────────────────────────────────────────
function updateClocks() {
  const fmt=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  ['liveClock','sessionsClockDisplay'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=fmt;});
}
setInterval(updateClocks,1000); updateClocks();
function destroyChart(k){if(charts[k]){charts[k].destroy();delete charts[k];}}

// ════════════════════════════════════════════════════════════════
//  LOGIN / AUTH — Supabase
// ════════════════════════════════════════════════════════════════

// Tabs del login
window.switchTab = function(tab) {
  ['signin','signup','forgot'].forEach(t => {
    document.getElementById('panel-'+t).classList.toggle('active', t===tab);
  });
  document.querySelectorAll('.login-tab').forEach((b,i) => {
    b.classList.toggle('active', (i===0&&tab==='signin')||(i===1&&tab==='signup'));
  });
};

window.showForgot = function() { switchTab('forgot'); };

// AUTO-LOGIN: si ya hay sesión, entrar directo
async function checkSession() {
  showLoading('Verificando sesión...');
  const session = await getSession();
  if (session) {
    currentUser = session.user;
    const { data: profile } = await getProfile(currentUser.id);
    currentProfile = profile;
    await loadAllData();
    enterApp();
  }
  hideLoading();
}
checkSession();

// Sign In
document.getElementById('loginBtn').addEventListener('click', async () => {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  errEl.style.display='none';
  if (!email||!password) { errEl.textContent='⚠ Completa todos los campos'; errEl.style.display='block'; return; }
  showLoading('Iniciando sesión...');
  const { data: user, error } = await signIn(email, password);
  hideLoading();
  if (error) { errEl.textContent='⚠ '+translateAuthError(error.message); errEl.style.display='block'; return; }
  currentUser = user;
  const { data: profile } = await getProfile(user.id);
  currentProfile = profile;
  showLoading('Cargando tus datos...');
  await loadAllData();
  hideLoading();
  enterApp();
});
document.getElementById('loginPassword').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('loginBtn').click(); });

// Sign Up
document.getElementById('registerBtn').addEventListener('click', async () => {
  const username = document.getElementById('regUsername').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm  = document.getElementById('regConfirm').value;
  const errEl    = document.getElementById('registerError');
  errEl.style.display='none';
  if (!username||!email||!password) { errEl.textContent='⚠ Completa todos los campos'; errEl.style.display='block'; return; }
  if (password !== confirm) { errEl.textContent='⚠ Las contraseñas no coinciden'; errEl.style.display='block'; return; }
  if (password.length < 6) { errEl.textContent='⚠ La contraseña debe tener al menos 6 caracteres'; errEl.style.display='block'; return; }
  showLoading('Creando tu cuenta...');
  const { data: user, error } = await signUp(email, password, username);
  hideLoading();
  if (error) { errEl.textContent='⚠ '+translateAuthError(error.message); errEl.style.display='block'; return; }
  showToast('✅ Cuenta creada. Revisa tu email para confirmar.');
  switchTab('signin');
  document.getElementById('loginEmail').value = email;
});

// Recuperar contraseña
document.getElementById('forgotBtn').addEventListener('click', async () => {
  const email = document.getElementById('forgotEmail').value.trim();
  const errEl = document.getElementById('forgotError');
  errEl.style.display='none';
  if (!email) { errEl.textContent='⚠ Ingresa tu email'; errEl.style.display='block'; return; }
  showLoading('Enviando email...');
  const { error } = await resetPassword(email);
  hideLoading();
  if (error) { errEl.textContent='⚠ '+translateAuthError(error.message); errEl.style.display='block'; return; }
  showToast('✅ Email enviado. Revisa tu bandeja de entrada.');
  switchTab('signin');
});

// Cerrar sesión
document.getElementById('logoutBtn').addEventListener('click', async () => {
  showLoading('Cerrando sesión...');
  await signOut();
  location.reload();
});

// Mensajes de error en español
function translateAuthError(msg) {
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos';
  if (msg.includes('Email not confirmed'))       return 'Confirma tu email antes de entrar';
  if (msg.includes('User already registered'))   return 'Este email ya está registrado';
  if (msg.includes('Password should be'))        return 'La contraseña debe tener al menos 6 caracteres';
  if (msg.includes('Unable to validate'))        return 'Email inválido';
  return msg;
}

// ── CARGA INICIAL DE DATOS ────────────────────────────────────
async function loadAllData() {
  const uid = currentUser.id;
  await loadAccounts();
  const [t, pf, py, pl, ps, rh] = await Promise.all([
    fetchTrades(uid, currentAccountId), fetchPropFirms(uid), fetchPayouts(uid),
    fetchPlaybook(uid), fetchPsyc(uid), fetchRiskHistory(uid)
  ]);
  trades      = t.data  || [];
  propFirms   = pf.data || [];
  payouts     = py.data || [];
  playbook    = pl.data || [];
  psycEntries = ps.data || [];
  riskHistory = rh.data || [];
}

async function loadAccounts() {
  const { data } = await fetchAccounts();
  accounts = data || [];
  if (!currentAccountId && accounts.length) {
    const def = accounts.find(a => a.is_default) || accounts[0];
    currentAccountId = def.id;
  }
  renderAccountSelect();
}

async function switchAccount(accountId) {
  currentAccountId = accountId;
  renderAccountSelect();
  const { data } = await fetchTrades(currentUser.id, accountId);
  trades = data || [];
  refreshAll();
}

function renderAccountSelect() {
  const sel = document.getElementById('accountSelect');
  if (!sel) return;
  sel.innerHTML = accounts.length
    ? accounts.map(a => `<option value="${a.id}" ${a.id === currentAccountId ? 'selected' : ''}>${a.firm_name || 'Cuenta Principal'}</option>`).join('')
    : '<option>Sin cuentas</option>';
}

async function renderAccountsList() {
  const el = document.getElementById('accountsList');
  if (!el) return;
  const active = accounts.filter(a => a.status !== 'archived');
  if (!active.length) { el.innerHTML = '<p style="color:var(--text3);text-align:center;padding:16px;">Sin cuentas activas.</p>'; return; }
  const counts = await Promise.all(active.map(a => getTradeCountForAccount(a.id)));
  el.innerHTML = active.map((a, i) => {
    const n = counts[i];
    const deleteBtn = n === 0
      ? `<button class="account-archive-btn" style="border-color:var(--red);color:var(--red);" onclick="deleteAccountRow('${a.id}')">Eliminar</button>`
      : `<span style="font-size:11px;color:var(--text3);">${n} trade${n===1?'':'s'}</span>`;
    return (
      `<div class="account-item">
        <div>
          <div class="account-item-name">${a.firm_name || 'Cuenta Principal'}</div>
          <div class="account-item-meta">${a.account_type || '—'} · $${Number(a.current_balance ?? a.initial_balance ?? 0).toLocaleString()} · ${a.status}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          ${deleteBtn}
          <button class="account-archive-btn" onclick="archiveAccountRow('${a.id}')">Archivar</button>
        </div>
      </div>`
    );
  }).join('');
}

async function archiveAccountRow(id) {
  const { error } = await archiveAccount(id);
  if (error) { showToast('⚠ Error archivando', 'error'); return; }
  await loadAccounts();
  renderAccountsList();
  showToast('✅ Cuenta archivada', 'warn'); showSync();
}
window.archiveAccountRow = archiveAccountRow;

async function deleteAccountRow(id) {
  if (!confirm('¿Eliminar esta cuenta permanentemente? Esta acción no se puede deshacer.')) return;
  const { error } = await deleteAccount(id);
  if (error) { showToast('⚠ Error eliminando cuenta', 'error'); return; }
  if (currentAccountId === id) {
    const remaining = accounts.filter(a => a.id !== id);
    const next = remaining.find(a => a.is_default) || remaining[0] || null;
    currentAccountId = next ? next.id : null;
    if (currentAccountId) {
      const { data } = await fetchTrades(currentUser.id, currentAccountId);
      trades = data || [];
    } else {
      trades = [];
    }
    refreshAll();
  }
  await loadAccounts();
  renderAccountsList();
  showToast('🗑 Cuenta eliminada', 'warn'); showSync();
}
window.deleteAccountRow = deleteAccountRow;

// ── ENTRAR A LA APP ───────────────────────────────────────────
function enterApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  initApp();
}

// ════════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════════
function initApp() {
  const now = new Date().toLocaleDateString('es-ES',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const username = currentProfile?.username || currentUser?.email?.split('@')[0] || 'Trader';
  document.getElementById('dashUser').textContent  = `Bienvenido, ${username} · ${now}`;
  document.getElementById('dashEmail').textContent = currentUser?.email || '';
  document.getElementById('settingsBalance').value = getInitBalance();

  loadNews();   renderTrades(); renderStats(); renderDashboard();
  buildMiniCalendar(); buildEquityChart(); buildWeeklyChart(); buildDailyChart();
  buildAllStatCharts();
  renderRiskHistory(); renderPlaybook(); renderPropFirms();
  renderPayouts(); renderPsyc(); renderLogros(); renderUserInfo();
updateSessions(); setInterval(updateSessions,30000);
  startAlertCheck();

  document.getElementById('newsSearch').addEventListener('input',renderNews);
  document.getElementById('tradeSearch').addEventListener('input',renderTrades);
  document.getElementById('filterPair').addEventListener('change',renderTrades);
  document.getElementById('filterSession').addEventListener('change',renderTrades);
  document.getElementById('filterSetup').addEventListener('change',renderTrades);
  document.getElementById('filterResult').addEventListener('change',renderTrades);

  document.querySelectorAll('.news-filter-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.news-filter-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); newsFilter=btn.dataset.filter; renderNews();
    });
  });
  document.querySelectorAll('#equityTabs .tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('#equityTabs .tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); buildEquityChart(btn.dataset.range);
    });
  });

  document.getElementById('settingsThemeBtn').addEventListener('click',()=>applyTheme(!isDark));

  // Guardar balance en Supabase
  document.getElementById('saveBalanceBtn').addEventListener('click', async ()=>{
    const v=parseFloat(document.getElementById('settingsBalance').value);
    if(!v||v<0){showToast('⚠ Balance inválido','warn');return;}
    const {error} = await updateInitBalance(currentUser.id, v);
    if(error){showToast('⚠ Error guardando balance','error');return;}
    currentProfile = {...currentProfile, init_balance: v};
    renderDashboard(); buildEquityChart();
    showToast('✅ Balance guardado en la nube: $'+v.toLocaleString()); showSync();
  });

  // Cambiar contraseña
  document.getElementById('changePwdBtn').addEventListener('click', async ()=>{
    const np = document.getElementById('newPwdInput').value;
    const cp = document.getElementById('confirmPwdInput').value;
    if(!np||np.length<6){showToast('⚠ Mínimo 6 caracteres','warn');return;}
    if(np!==cp){showToast('⚠ Las contraseñas no coinciden','warn');return;}
    const {error} = await updatePassword(np);
    if(error){showToast('⚠ Error: '+error.message,'error');return;}
    document.getElementById('newPwdInput').value='';
    document.getElementById('confirmPwdInput').value='';
    showToast('✅ Contraseña actualizada correctamente');
  });

  document.getElementById('backupBtn').addEventListener('click', downloadBackup);
  document.getElementById('restoreBtn').addEventListener('click',()=>document.getElementById('backupFileInput').click());
  document.getElementById('backupFileInput').addEventListener('change', restoreBackup);

  document.getElementById('nukeBtn').addEventListener('click', async ()=>{
    if(!confirm('¿BORRAR TODOS TUS DATOS DE LA NUBE? Esta acción es irreversible.'))return;
    showLoading('Borrando datos...');
    await Promise.all([
      deleteAllTrades(currentUser.id),
      supabase.from('prop_firms').delete().eq('user_id',currentUser.id),
      supabase.from('payouts').delete().eq('user_id',currentUser.id),
      supabase.from('playbook').delete().eq('user_id',currentUser.id),
      supabase.from('psyc_entries').delete().eq('user_id',currentUser.id),
      supabase.from('risk_history').delete().eq('user_id',currentUser.id),
    ]);
    hideLoading();
    trades=[]; propFirms=[]; payouts=[]; playbook=[]; psycEntries=[]; riskHistory=[];
    refreshAll(); renderPlaybook(); renderRiskHistory(); renderPropFirms(); renderPayouts(); renderPsyc(); renderLogros();
    showToast('🗑 Todos los datos eliminados','warn');
  });

  // Crear usuario desde admin
  document.getElementById('createUserBtn').addEventListener('click', async ()=>{
    const email    = document.getElementById('inviteEmail').value.trim();
    const pass     = document.getElementById('invitePass').value;
    const username = document.getElementById('inviteUsername').value.trim();
    const role     = document.getElementById('inviteRole').value;
    const errEl    = document.getElementById('inviteError');
    errEl.style.display='none';
    if(!email||!pass||!username){errEl.textContent='⚠ Completa todos los campos';errEl.style.display='block';return;}
    showLoading('Creando usuario...');
    const {data,error} = await signUp(email, pass, username, role);
    hideLoading();
    if(error){errEl.textContent='⚠ '+translateAuthError(error.message);errEl.style.display='block';return;}
    showToast('✅ Usuario creado: '+username);
    ['inviteEmail','invitePass','inviteUsername'].forEach(id=>document.getElementById(id).value='');
  });

  // Selector de cuenta en sidebar
  document.getElementById('accountSelect').addEventListener('change', e => switchAccount(e.target.value));

  // Modal Mis Cuentas
  document.getElementById('openAccountsModal').addEventListener('click', () => {
    renderAccountsList();
    document.getElementById('accountsModal').classList.remove('hidden');
  });
  document.getElementById('closeAccountsModal').addEventListener('click', () =>
    document.getElementById('accountsModal').classList.add('hidden')
  );
  document.getElementById('saveAccountBtn').addEventListener('click', async () => {
    const firm_name = document.getElementById('acctFirmName').value.trim();
    const initial_balance = parseFloat(document.getElementById('acctInitBalance').value) || 0;
    if (!firm_name) { showToast('⚠ Escribe un nombre para la cuenta', 'warn'); return; }
    const { data, error } = await createAccount({
      firm_name,
      account_type: document.getElementById('acctType').value,
      status: 'active',
      initial_balance,
      currency: document.getElementById('acctCurrency').value,
      notes: '',
    });
    if (error) { showToast('⚠ Error creando cuenta', 'error'); return; }
    document.getElementById('acctFirmName').value = '';
    document.getElementById('acctInitBalance').value = '';
    await loadAccounts();
    renderAccountsList();
    showToast('✅ Cuenta creada: ' + data.firm_name); showSync();
  });

  // Modal Importar CSV
  document.getElementById('openImportModal').addEventListener('click', () => {
    importParsed = null; importValidTrades = []; importErrors = [];
    document.getElementById('csvFileInput').value = '';
    document.getElementById('importMappingContainer').innerHTML = '';
    document.getElementById('importPreviewContainer').innerHTML = '';
    document.getElementById('importResultSummary').classList.add('hidden');
    const sel = document.getElementById('importAccountSelect');
    sel.innerHTML = accounts.filter(a => a.status !== 'archived').map(a => `<option value="${a.id}" ${a.id === currentAccountId ? 'selected' : ''}>${a.firm_name || 'Cuenta Principal'}</option>`).join('') || '<option>Sin cuentas</option>';
    showImportStep(1);
    document.getElementById('importModal').classList.remove('hidden');
  });

  function resetAndCloseImportModal() {
    importParsed = null; importValidTrades = []; importErrors = [];
    document.getElementById('csvFileInput').value = '';
    document.getElementById('importMappingContainer').innerHTML = '';
    document.getElementById('importPreviewContainer').innerHTML = '';
    document.getElementById('importResultSummary').classList.add('hidden');
    document.getElementById('confirmImportBtn').disabled = false;
    showImportStep(1);
    document.getElementById('importModal').classList.add('hidden');
  }
  document.getElementById('closeImportModal').addEventListener('click', resetAndCloseImportModal);
  document.getElementById('closeImportModalX').addEventListener('click', resetAndCloseImportModal);

  document.getElementById('importStep1Next').addEventListener('click', async () => {
    const file = document.getElementById('csvFileInput').files[0];
    if (!file) { showToast('⚠ Selecciona un archivo CSV', 'warn'); return; }
    try { importParsed = await parseCsvFile(file); }
    catch { showToast('⚠ Error leyendo el CSV', 'error'); return; }
    if (!importParsed.headers.length) { showToast('⚠ El CSV no tiene encabezados', 'warn'); return; }
    renderImportMapping(importParsed.headers);
    showImportStep(2);
  });

  document.getElementById('importStep2Back').addEventListener('click', () => showImportStep(1));

  document.getElementById('importStep2Next').addEventListener('click', () => {
    const mapping = {};
    CSV_FIELD_OPTIONS.forEach(f => { const v = document.getElementById(`importMap_${f.field}`)?.value; if (v) mapping[f.field] = v; });
    const missing = CSV_FIELD_OPTIONS.filter(f => f.required && !mapping[f.field]);
    if (missing.length) { showToast(`⚠ Mapea los campos requeridos: ${missing.map(f=>f.label).join(', ')}`, 'warn'); return; }
    const accountId = document.getElementById('importAccountSelect').value;
    const dateFormat = document.getElementById('importDateFormat').value;
    ({ validTrades: importValidTrades, errors: importErrors } = buildTradesFromMapping(importParsed.rows, mapping, dateFormat, accountId));
    if (!importValidTrades.length && !importErrors.length) { showToast('⚠ El CSV no tiene filas con datos', 'warn'); return; }
    renderImportPreview(importValidTrades, importErrors);
    showImportStep(3);
  });

  document.getElementById('importStep3Back').addEventListener('click', () => showImportStep(2));

  document.getElementById('confirmImportBtn').addEventListener('click', async () => {
    if (!importValidTrades.length) { showToast('⚠ No hay trades válidos para importar', 'warn'); return; }
    const btn = document.getElementById('confirmImportBtn');
    const closeX = document.getElementById('closeImportModalX');
    const closeCancel = document.getElementById('closeImportModal');
    btn.disabled = true;
    closeX.disabled = true;
    closeCancel.disabled = true;
    showLoading(`Importando ${importValidTrades.length} trades...`);
    const toInsert = importValidTrades.map(t => ({ ...t, user_id: currentUser.id }));
    const { data, error } = await bulkInsertTrades(toInsert);
    hideLoading();
    const inserted = data?.insertedCount ?? 0;
    const summaryEl = document.getElementById('importResultSummary');
    summaryEl.classList.remove('hidden');
    if (error) {
      summaryEl.innerHTML = `<span style="color:var(--red);">⚠ Error en fila ${inserted + 1}. Se importaron ${inserted} trades antes del fallo.</span>`;
      showToast(`⚠ Importación parcial: ${inserted} trades`, 'error');
      btn.disabled = false;
      closeX.disabled = false;
      closeCancel.disabled = false;
    } else {
      summaryEl.innerHTML = `<span style="color:var(--green);">✅ ${inserted} trades importados.${importErrors.length ? ` ${importErrors.length} filas omitidas.` : ''}</span>`;
      showToast(`✅ ${inserted} trades importados`); showSync();
      await loadAllData(); refreshAll();
      closeX.disabled = false;
      closeCancel.disabled = false;
    }
  });
}

// ── NAVEGACIÓN ────────────────────────────────────────────────
document.querySelectorAll('.menu-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.menu-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active-page'));
    document.getElementById(btn.dataset.section).classList.add('active-page');
    document.getElementById('sidebar').classList.remove('open');
    const s=btn.dataset.section;
    if(s==='psicologia'){renderPsyc();buildPsycChart();buildEmotionChart();renderPatrones();}
    if(s==='logros')renderLogros();
    if(s==='propfirm')renderPropFirms();
    if(s==='payouts'){renderPayouts();buildPayoutChart();}
    if(s==='stats'){renderStats();buildAllStatCharts();}
  });
});

// ════════════════════════════════════════════════════════════════
//  CALCSTATS, DASHBOARD, CHARTS — igual que v4.5
// ════════════════════════════════════════════════════════════════
function calcStats(arr) {
  const pnls=arr.map(t=>parseFloat(t.pnl)||0);
  const total=pnls.reduce((a,b)=>a+b,0);
  const wins=pnls.filter(p=>p>0), losses=pnls.filter(p=>p<0);
  const wr=arr.length?Math.round(wins.length/arr.length*100):0;
  const pf=wins.length&&losses.length?(wins.reduce((a,b)=>a+b,0)/Math.abs(losses.reduce((a,b)=>a+b,0))).toFixed(2):'—';
  const avgWin=wins.length?wins.reduce((a,b)=>a+b,0)/wins.length:0;
  const avgLoss=losses.length?losses.reduce((a,b)=>a+b,0)/losses.length:0;
  const rr=avgLoss!==0?(Math.abs(avgWin)/Math.abs(avgLoss)).toFixed(2):'—';
  const best=wins.length?Math.max(...wins):0, worst=losses.length?Math.min(...losses):0;
  const avgPer=arr.length?total/arr.length:0;
  let running=0,peak=0,maxDD=0;
  pnls.forEach(p=>{running+=p;if(running>peak)peak=running;const dd=peak-running;if(dd>maxDD)maxDD=dd;});
  const currentDD=peak-running;
  let curW=0,maxW=0,curL=0,maxL=0;
  pnls.forEach(p=>{if(p>0){curW++;maxW=Math.max(maxW,curW);curL=0;}else if(p<0){curL++;maxL=Math.max(maxL,curL);curW=0;}else{curW=0;curL=0;}});
  const wrDec=wr/100;
  const expectancy=arr.length?((wrDec*avgWin)+((1-wrDec)*avgLoss)).toFixed(2):'—';
  let sharpe='—';
  if(pnls.length>1){const mean=total/pnls.length;const v=pnls.reduce((s,p)=>s+Math.pow(p-mean,2),0)/(pnls.length-1);const std=Math.sqrt(v);if(std>0)sharpe=(mean/std*Math.sqrt(252)).toFixed(2);}
  const recovery=maxDD>0?(total/maxDD).toFixed(2):'—';
  return{pnls,total,wins,losses,wr,pf,avgWin,avgLoss,rr,best,worst,avgPer,maxDD,currentDD,maxW,maxL,expectancy,sharpe,recovery};
}

function renderDashboard(){
  const{total,wins,wr,pf,maxDD,currentDD,maxW,maxL,avgPer}=calcStats(trades);
  const activeAccount = accounts.find(a => a.id === currentAccountId) || {};
  const initBal = parseFloat(activeAccount.initial_balance) || getInitBalance();
  const balance = initBal + total;
  document.getElementById('dashBalanceInit').textContent='$'+initBal.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('dashBalance').textContent='$'+balance.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('dashEquity').textContent='$'+balance.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('dashEquityTrend').textContent=total>=0?'▲ En ganancias':'▼ En pérdidas';
  document.getElementById('dashEquityTrend').className='trend '+(total>=0?'trend-up':'trend-down');
  document.getElementById('dashPnl').textContent=(total>=0?'+':'')+' $'+total.toFixed(2);
  document.getElementById('dashPnl').className='value '+(total>=0?'trend-up':'trend-down');
  document.getElementById('dashWinRate').textContent=wr+'%';
  document.getElementById('dashWRTrend').textContent=trades.length?wins.length+' wins / '+(trades.length-wins.length)+' losses':'Sin trades';
  document.getElementById('dashTrades').textContent=trades.length;
  document.getElementById('dashPF').textContent=pf;
  document.getElementById('dashDD').textContent=trades.length?'-$'+maxDD.toFixed(2):'—';
  document.getElementById('dashDDActual').textContent=trades.length?'-$'+currentDD.toFixed(2):'—';
  document.getElementById('dashStreak').textContent=maxW;
  document.getElementById('dashLossStreak').textContent=maxL;
  document.getElementById('dashAvg').textContent=(avgPer>=0?'+':'')+' $'+parseFloat(avgPer).toFixed(2);
  document.getElementById('dashAvg').className='value '+(avgPer>=0?'trend-up':'trend-down');
  document.getElementById('dashBalanceTrend').textContent=total>=0?'▲ +$'+total.toFixed(2)+' vs inicial':'▼ $'+total.toFixed(2)+' vs inicial';
  const high=newsData.filter(n=>n.impact==='high'&&!n.actual).slice(0,4);
  document.getElementById('dashNewsPreview').innerHTML=high.length?high.map(n=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);"><span class="impact-dot ih"></span><span class="news-time">${n.time}</span><span class="news-currency">${n.currency}</span><span>${n.event}</span></div>`).join(''):'<p style="color:var(--text3);">Sin noticias de alto impacto pendientes.</p>';
  const alertEl=document.getElementById('dashAlert');
  if(high.length){alertEl.classList.remove('hidden');alertEl.textContent=`⚠️ ${high.length} eventos ALTO IMPACTO hoy: ${high.slice(0,2).map(n=>n.event).join(', ')}${high.length>2?'...':''}`;}
  else alertEl.classList.add('hidden');
  renderDashPropSummary();
}

function renderDashPropSummary(){
  const el=document.getElementById('dashPropSummary');
  if(!propFirms.length){el.innerHTML='<p style="color:var(--text3);font-size:13px;">Sin cuentas registradas. Ve a <b>Prop Firm Tracker</b> para agregar.</p>';return;}
  el.innerHTML=propFirms.filter(p=>p.phase!=='failed').slice(0,4).map(p=>{
    const pct=Math.min(100,((parseFloat(p.gain)||0)/(parseFloat(p.target)||1))*100);
    const col=p.phase==='funded'?'var(--green)':p.phase==='challenge'?'var(--yellow)':'var(--blue)';
    return`<div class="dash-prop-item"><div class="dash-prop-dot" style="background:${col};box-shadow:0 0 6px ${col};"></div><div><div class="dash-prop-info-name">${p.firm} — $${Number(p.size).toLocaleString()}</div><div class="dash-prop-info-sub">Profit: $${p.gain||0} · ${pct.toFixed(0)}% del objetivo · ${p.phase.toUpperCase()}</div></div></div>`;
  }).join('');
}

// Charts
function buildEquityChart(range='all'){
  let f=[...trades];
  if(range==='30'){const d=new Date();d.setDate(d.getDate()-30);f=trades.filter(t=>t.date&&new Date(t.date)>=d);}
  if(range==='7'){const d=new Date();d.setDate(d.getDate()-7);f=trades.filter(t=>t.date&&new Date(t.date)>=d);}
  const base=getInitBalance(), labels=['Inicio'], data=[base]; let run=base;
  f.forEach(t=>{run+=parseFloat(t.pnl)||0;labels.push(t.pair||'T');data.push(parseFloat(run.toFixed(2)));});
  destroyChart('equity');
  charts['equity']=new Chart(document.getElementById('equityChart'),{type:'line',data:{labels,datasets:[{label:'Equity ($)',data,borderColor:'#38bdf8',backgroundColor:'rgba(56,189,248,.07)',tension:.4,fill:true,pointRadius:3,pointHoverRadius:6,pointBackgroundColor:'#38bdf8'}]},options:{responsive:true,interaction:{intersect:false,mode:'index'},plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#4f6280',maxTicksLimit:10},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280',callback:v=>'$'+v.toLocaleString()},grid:{color:'#1a264033'}}}}});
}
function buildWeeklyChart(){
  const weeks={};
  trades.forEach(t=>{if(!t.date)return;const d=new Date(t.date+'T12:00:00');const day=d.getDay(),diff=d.getDate()-day+(day===0?-6:1);const mon=new Date(new Date(t.date+'T12:00:00').setDate(diff));const wk=mon.toISOString().split('T')[0];if(!weeks[wk])weeks[wk]=0;weeks[wk]+=parseFloat(t.pnl)||0;});
  const labels=Object.keys(weeks).sort().slice(-10), vals=labels.map(w=>parseFloat(weeks[w].toFixed(2)));
  destroyChart('weekly');
  charts['weekly']=new Chart(document.getElementById('weeklyChart'),{type:'bar',data:{labels:labels.length?labels:['Sin datos'],datasets:[{label:'P&L Semanal',data:vals.length?vals:[0],backgroundColor:vals.map(v=>v>=0?'rgba(52,211,153,.35)':'rgba(248,113,113,.35)'),borderColor:vals.map(v=>v>=0?'#34d399':'#f87171'),borderWidth:1.5,borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#4f6280',maxRotation:30},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}}}}});
}
function buildDailyChart(){
  const days={};
  [...trades].slice(-50).forEach(t=>{if(!t.date)return;if(!days[t.date])days[t.date]=0;days[t.date]+=parseFloat(t.pnl)||0;});
  const labels=Object.keys(days).sort().slice(-14), vals=labels.map(d=>parseFloat(days[d].toFixed(2)));
  destroyChart('daily');
  charts['daily']=new Chart(document.getElementById('dailyChart'),{type:'bar',data:{labels:labels.length?labels:['Sin datos'],datasets:[{label:'P&L Diario',data:vals.length?vals:[0],backgroundColor:vals.map(v=>v>=0?'rgba(56,189,248,.35)':'rgba(248,113,113,.35)'),borderColor:vals.map(v=>v>=0?'#38bdf8':'#f87171'),borderWidth:1.5,borderRadius:6}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#4f6280',maxRotation:30},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}}}}});
}
function buildMiniCalendar(){
  const today=new Date(),yr=today.getFullYear(),mo=today.getMonth();
  const firstDay=new Date(yr,mo,1).getDay(),daysInMonth=new Date(yr,mo+1,0).getDate(),daysInPrev=new Date(yr,mo,0).getDate();
  const ym=`${yr}-${String(mo+1).padStart(2,'0')}`;
  const tradeDays=new Set(trades.filter(t=>t.date&&t.date.toString().startsWith(ym)).map(t=>parseInt(t.date.toString().split('-')[2],10)));
  let html=`<div style="font-size:12px;color:var(--text2);margin-bottom:8px;font-weight:700;">${today.toLocaleDateString('es-ES',{month:'long',year:'numeric'}).toUpperCase()}</div><div class="calendar-grid">`;
  ['D','L','M','X','J','V','S'].forEach(d=>html+=`<div class="cal-head">${d}</div>`);
  for(let i=0;i<firstDay;i++)html+=`<div class="cal-day cal-other">${daysInPrev-firstDay+1+i}</div>`;
  for(let d=1;d<=daysInMonth;d++){let cls=d===today.getDate()?'cal-today':tradeDays.has(d)?'cal-event':'';html+=`<div class="cal-day ${cls}">${d}</div>`;}
  document.getElementById('miniCalendar').innerHTML=html+'</div>';
}

// NEWS
let newsData = [];

async function loadNews() {
  const tbody = document.getElementById('newsBody');
  if (tbody) tbody.innerHTML =
    '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:36px;">⏳ Cargando noticias en tiempo real...</td></tr>';
  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    newsData = json.events || [];
  } catch (e) {
    newsData = [];
    if (tbody) tbody.innerHTML =
      `<tr><td colspan="7" style="text-align:center;color:var(--red);padding:36px;">` +
      `⚠ No se pudieron cargar las noticias: ${e.message}</td></tr>`;
    return;
  }
  renderNews();
  renderDashboard();
}

function renderNews(){
  const q=(document.getElementById('newsSearch')?.value||'').toLowerCase();
  let data=[...newsData];
  if(newsFilter==='high')data=data.filter(n=>n.impact==='high');
  else if(newsFilter==='medium')data=data.filter(n=>n.impact==='medium');
  else if(newsFilter==='low')data=data.filter(n=>n.impact==='low');
  else if(newsFilter!=='all')data=data.filter(n=>n.currency===newsFilter);
  if(q)data=data.filter(n=>n.event.toLowerCase().includes(q)||n.currency.toLowerCase().includes(q));
  document.getElementById('newsBody').innerHTML=data.map(n=>{
    const ic=n.impact==='high'?'ih':n.impact==='medium'?'im':'il';
    const ac=n.actual===''?'':n.beat===true?'actual-beat':n.beat===false?'actual-miss':'';
    return`<tr><td><span class="news-time">${n.time}</span></td><td><span class="news-currency">${n.currency}</span></td><td><span class="impact-dot ${ic}"></span>${n.impact==='high'?'Alto':n.impact==='medium'?'Medio':'Bajo'}</td><td style="font-weight:600;">${n.event}${!n.actual?'<span style="font-size:10px;margin-left:8px;background:var(--blue2)33;color:var(--blue);padding:1px 6px;border-radius:4px;">PRÓXIMO</span>':''}</td><td style="color:var(--text3);">${n.prev}</td><td style="color:var(--text2);">${n.forecast}</td><td class="${ac}">${n.actual||'<span class="pending">Pendiente</span>'}</td></tr>`;
  }).join('');
}

// SESIONES
const SESSIONS_ET={sydney:{start:22,end:7},tokyo:{start:0,end:9},london:{start:3,end:12},newyork:{start:8,end:17}};
function getETHour(){const s=new Date().toLocaleString('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false});const[h,m]=s.split(':');return parseInt(h)+parseInt(m)/60;}
function isOpen(s,h){return s.start<s.end?h>=s.start&&h<s.end:h>=s.start||h<s.end;}
function updateSessions(){
  const h=getETHour();
  const lo=isOpen(SESSIONS_ET.london,h),ny=isOpen(SESSIONS_ET.newyork,h),ov=lo&&ny;
  let active=[];
  Object.entries(SESSIONS_ET).forEach(([k,s])=>{
    const open=isOpen(s,h);
    const card=document.getElementById('sc-'+k),badge=document.getElementById('sb-'+k);
    if(!card)return;
    card.className='session-card';
    if(open&&((k==='london'&&ny)||(k==='newyork'&&lo))){card.classList.add('is-overlap');badge.className='session-status-badge overlap';badge.textContent='🔥 OVERLAP';}
    else if(open){card.classList.add('is-active');badge.className='session-status-badge open';badge.textContent='✅ ABIERTA';active.push(k);}
    else{badge.className='session-status-badge closed';badge.textContent='⏸ CERRADA';}
    const tz={sydney:'Australia/Sydney',tokyo:'Asia/Tokyo',london:'Europe/London',newyork:'America/New_York'}[k];
    const lt=new Date().toLocaleTimeString('es-ES',{timeZone:tz,hour:'2-digit',minute:'2-digit'});
    const lel=document.getElementById('sl-'+k);if(lel)lel.textContent=lt+' (hora local)';
  });
  const dot=document.getElementById('sessionDot'),lbl=document.getElementById('sessionLabel');
  if(ov){dot.className='session-dot overlap';lbl.textContent='London/NY Overlap';}
  else if(active.length){dot.className='session-dot active';lbl.textContent=active[0]+' abierta';}
  else{dot.className='session-dot';lbl.textContent='Mercados cerrados';}
  const el=document.getElementById('sessionTimeline');if(!el)return;
  const sessions=[{label:'Sydney',start:22,end:31,color:'rgba(56,189,248,.5)'},{label:'Tokyo',start:24,end:33,color:'rgba(167,139,250,.5)'},{label:'London',start:27,end:36,color:'rgba(251,191,36,.5)'},{label:'NY',start:32,end:41,color:'rgba(52,211,153,.5)'}];
  el.innerHTML=sessions.map(s=>{const l=((s.start-20)/48)*100,w=((s.end-s.start)/48)*100;return`<div class="timeline-bar" style="left:${l.toFixed(1)}%;width:${w.toFixed(1)}%;background:${s.color};">${s.label}</div>`;}).join('');
}

// ALERTAS
function getETMin(){const s=new Date().toLocaleString('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false});const[h,m]=s.split(':');return parseInt(h)*60+parseInt(m);}
function playAlert(){try{const c=new(window.AudioContext||window.webkitAudioContext)();[880,1100,880].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=f;o.type='sine';g.gain.setValueAtTime(.3,c.currentTime+i*.25);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+i*.25+.2);o.start(c.currentTime+i*.25);o.stop(c.currentTime+i*.25+.3);});}catch(e){}}
function startAlertCheck(){const al=new Set();setInterval(()=>{const et=getETMin();newsData.filter(n=>n.impact==='high'&&!n.actual).forEach(n=>{const[nh,nm]=n.time.split(':').map(Number),diff=(nh*60+nm)-et;if(diff===15&&!al.has(n.event+'15')){al.add(n.event+'15');playAlert();showToast(`⚠️ Noticia en 15 min: ${n.event}`,'warn');}if(diff===5&&!al.has(n.event+'5')){al.add(n.event+'5');playAlert();showToast(`🔴 Noticia en 5 min: ${n.event}`,'warn');}});},30000);}

// RISK MANAGER PRO
function renderRiskHistory(){
  const el=document.getElementById('riskHistory');
  if(!riskHistory.length){el.innerHTML='<span style="color:var(--text3);">Sin cálculos aún.</span>';return;}
  el.innerHTML=riskHistory.map(r=>`<div style="padding:9px 0;border-bottom:1px solid var(--border);display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:13px;"><span style="color:var(--text3);">${r.date}</span><b style="color:var(--blue);">${r.pair}</b><span>$${r.balance} · ${r.risk}% · SL:${r.stop}p · R:R ${r.rr}</span><span>→ <b style="color:var(--green);">Lot ${r.lot}</b> · Riesgo $${r.risk_money}</span></div>`).join('');
}
document.getElementById('calculateRiskBtn').addEventListener('click', async ()=>{
  const balance=parseFloat(document.getElementById('riskBalance').value);
  const risk=parseFloat(document.getElementById('riskPercent').value);
  const stop=parseFloat(document.getElementById('riskStop').value);
  const pipVal=parseFloat(document.getElementById('riskPair').value);
  const rr=parseFloat(document.getElementById('riskRR').value)||2;
  const comm=parseFloat(document.getElementById('riskComm').value)||0;
  const dailyMax=parseFloat(document.getElementById('riskDailyMax').value)||0;
  const weeklyMax=parseFloat(document.getElementById('riskWeeklyMax').value)||0;
  const entryPrice=parseFloat(document.getElementById('riskEntryPrice').value)||0;
  const slPrice=parseFloat(document.getElementById('riskSLPrice').value)||0;
  if(!balance||!risk||!stop){showToast('⚠ Completa Balance, Riesgo y Stop Loss','warn');return;}
  const riskMoney=balance*risk/100, lotSize=riskMoney/(stop*pipVal), tpAmount=riskMoney*rr;
  const commTotal=comm*lotSize*2, netRisk=riskMoney+commTotal;
  const tradesDD=dailyMax>0?Math.floor(dailyMax/netRisk):null;
  const tradesWeekly=weeklyMax>0?Math.floor(weeklyMax/netRisk):null;
  let bePrice='—';
  if(entryPrice&&slPrice&&lotSize){const pipSize=Math.abs(entryPrice-slPrice)/stop;const commPips=commTotal/(lotSize*pipVal);bePrice=(entryPrice>slPrice?entryPrice-commPips*pipSize:entryPrice+commPips*pipSize).toFixed(5);}
  document.getElementById('riskMoney').textContent='$'+riskMoney.toFixed(2);
  document.getElementById('riskLot').textContent=lotSize.toFixed(2);
  document.getElementById('riskPipVal').textContent='$'+pipVal.toFixed(2);
  document.getElementById('riskTP').textContent='$'+tpAmount.toFixed(2);
  document.getElementById('riskCommTotal').textContent='$'+commTotal.toFixed(2);
  document.getElementById('riskNet').textContent='$'+netRisk.toFixed(2);
  document.getElementById('riskPct').textContent=risk.toFixed(2)+'%';
  document.getElementById('riskTradesDD').textContent=tradesDD!==null?tradesDD+' trades':'—';
  document.getElementById('riskTradesWeekly').textContent=tradesWeekly!==null?tradesWeekly+' trades':'—';
  document.getElementById('riskBE').textContent=bePrice;
  document.getElementById('parcialesGrid').innerHTML=[{label:'Parcial 1 (1R)',pct:50,r:1},{label:'Parcial 2 (2R)',pct:25,r:2},{label:'Parcial 3 (TP)',pct:25,r:rr}].map(p=>`<div class="parcial-item"><div class="parcial-label">${p.label}</div><div class="parcial-value">+$${(riskMoney*p.r*(p.pct/100)).toFixed(2)}</div><div class="parcial-sub">${p.pct}% posición · ${p.r}R</div></div>`).join('');
  const warn=document.getElementById('riskWarning');
  if(risk>2){warn.classList.remove('hidden');warn.textContent=`⚠️ Riesgo del ${risk}% es ALTO. Máximo recomendado: 1-2%.`;}else warn.classList.add('hidden');
  document.getElementById('riskOutput').classList.remove('hidden');
  const pairLabel=document.getElementById('riskPair').options[document.getElementById('riskPair').selectedIndex].text.split('—')[0].trim();
  const calc={date:new Date().toLocaleDateString('es-ES'),pair:pairLabel,balance,risk,stop,lot:lotSize.toFixed(2),risk_money:riskMoney.toFixed(2),rr};
  const {data} = await insertRiskHistory(currentUser.id, calc);
  if(data) riskHistory.unshift(data);
  renderRiskHistory(); showSync();
  showToast('✅ Cálculo completado');
});

// ════════════════════════════════════════════════════════════════
//  TRADE JOURNAL — CRUD con Supabase
// ════════════════════════════════════════════════════════════════
document.getElementById('openTradeModal').addEventListener('click',()=>{
  editIndex=null; editTradeId=null;
  document.getElementById('tradeModalTitle').textContent='📝 Registrar Trade';
  document.getElementById('tDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('tTime').value=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  ['tLot','tEntry','tSL','tTP','tPnl','tRisk','tNotes'].forEach(id=>document.getElementById(id).value='');
  ['tPair','tType','tSession','tSetup','tEmotion'].forEach(id=>document.getElementById(id).selectedIndex=0);
  document.getElementById('tradeModal').classList.remove('hidden');
});
document.getElementById('closeTradeModal').addEventListener('click',()=>document.getElementById('tradeModal').classList.add('hidden'));

document.getElementById('saveTradeBtn').addEventListener('click', async ()=>{
  const entry=parseFloat(document.getElementById('tEntry').value)||0;
  const sl=parseFloat(document.getElementById('tSL').value)||0;
  const tp=parseFloat(document.getElementById('tTP').value)||0;
  let rr='—';
  if(entry&&sl&&tp){const rp=Math.abs(entry-sl),tp2=Math.abs(tp-entry);if(rp>0)rr=(tp2/rp).toFixed(2);}
  const trade={
    date:document.getElementById('tDate').value,
    time:document.getElementById('tTime').value,
    pair:document.getElementById('tPair').value,
    type:document.getElementById('tType').value,
    lot:parseFloat(document.getElementById('tLot').value)||null,
    entry:parseFloat(document.getElementById('tEntry').value)||null,
    sl:parseFloat(document.getElementById('tSL').value)||null,
    tp:parseFloat(document.getElementById('tTP').value)||null,
    pnl:parseFloat(document.getElementById('tPnl').value)||0,
    risk:parseFloat(document.getElementById('tRisk').value)||null,
    rr, session:document.getElementById('tSession').value,
    setup:document.getElementById('tSetup').value,
    emotion:document.getElementById('tEmotion').value,
    notes:document.getElementById('tNotes').value,
    account_id: currentAccountId,
  };
  if(!trade.date){showToast('⚠ Completa la fecha','warn');return;}
  showLoading('Guardando trade...');
  if(editTradeId){
    const {data,error}=await updateTrade(editTradeId, trade);
    if(error){hideLoading();showToast('⚠ Error guardando','error');return;}
    const idx=trades.findIndex(t=>t.id===editTradeId);
    if(idx>-1) trades[idx]=data;
    showToast('✅ Trade actualizado');
  } else {
    const {data,error}=await insertTrade(currentUser.id, trade);
    if(error){hideLoading();showToast('⚠ Error guardando','error');return;}
    trades.push(data);
    showToast('✅ Trade registrado');
  }
  hideLoading(); showSync();
  document.getElementById('tradeModal').classList.add('hidden');
  editTradeId=null; editIndex=null; refreshAll();
});

function openEditTrade(idx){
  const reversed=[...trades].reverse();
  const t=reversed[idx]; editTradeId=t.id;
  document.getElementById('tradeModalTitle').textContent='✏️ Editar Trade';
  document.getElementById('tDate').value=t.date||'';
  document.getElementById('tTime').value=t.time||'';
  document.getElementById('tPair').value=t.pair||'EURUSD';
  document.getElementById('tType').value=t.type||'BUY';
  document.getElementById('tLot').value=t.lot||'';
  document.getElementById('tEntry').value=t.entry||'';
  document.getElementById('tSL').value=t.sl||'';
  document.getElementById('tTP').value=t.tp||'';
  document.getElementById('tPnl').value=t.pnl||'';
  document.getElementById('tRisk').value=t.risk||'';
  document.getElementById('tSession').value=t.session||'London';
  document.getElementById('tSetup').value=t.setup||'';
  document.getElementById('tEmotion').value=t.emotion||'';
  document.getElementById('tNotes').value=t.notes||'';
  document.getElementById('tradeModal').classList.remove('hidden');
}

async function deleteTradeRow(idx){
  const reversed=[...trades].reverse();
  const t=reversed[idx];
  if(!confirm(`¿Eliminar trade ${t.pair} ${t.date}?`))return;
  showLoading('Eliminando...');
  const {error}=await deleteTrade(t.id);
  hideLoading();
  if(error){showToast('⚠ Error eliminando','error');return;}
  trades=trades.filter(x=>x.id!==t.id);
  refreshAll(); showToast('🗑 Trade eliminado','warn'); showSync();
}
window.openEditTrade=openEditTrade;
window.deleteTradeRow=deleteTradeRow;

function getFilteredTrades(){
  const q=(document.getElementById('tradeSearch')?.value||'').toLowerCase();
  const fp=document.getElementById('filterPair')?.value||'';
  const fs=document.getElementById('filterSession')?.value||'';
  const fst=document.getElementById('filterSetup')?.value||'';
  const fr=document.getElementById('filterResult')?.value||'';
  return[...trades].reverse().filter(t=>{
    if(q&&!(t.pair||'').toLowerCase().includes(q)&&!(t.notes||'').toLowerCase().includes(q)&&!(t.setup||'').toLowerCase().includes(q))return false;
    if(fp&&t.pair!==fp)return false; if(fs&&t.session!==fs)return false; if(fst&&t.setup!==fst)return false;
    if(fr==='win'&&!(parseFloat(t.pnl)>0))return false; if(fr==='loss'&&!(parseFloat(t.pnl)<0))return false; if(fr==='be'&&parseFloat(t.pnl)!==0)return false;
    return true;
  });
}
function renderTrades(){
  const data=getFilteredTrades(), tbody=document.getElementById('tradesBody');
  const totalPnl=data.reduce((a,t)=>a+(parseFloat(t.pnl)||0),0);
  const wins=data.filter(t=>parseFloat(t.pnl)>0).length;
  const sumEl=document.getElementById('journalSummary');
  sumEl.innerHTML=data.length?`<div class="journal-summary-item">Trades: <span>${data.length}</span></div><div class="journal-summary-item">P&amp;L: <span class="${totalPnl>=0?'trend-up':'trend-down'}">${totalPnl>=0?'+':''}$${totalPnl.toFixed(2)}</span></div><div class="journal-summary-item">WIN: <span class="trend-up">${wins}</span> / LOSS: <span class="trend-down">${data.length-wins}</span></div><div class="journal-summary-item">Win Rate: <span>${Math.round(wins/data.length*100)}%</span></div>`:'';
  if(!data.length){tbody.innerHTML='<tr><td colspan="16" style="text-align:center;color:var(--text3);padding:36px;">Sin trades que coincidan.</td></tr>';return;}
  tbody.innerHTML=data.map((t,i)=>{
    const pnl=parseFloat(t.pnl)||0;
    const badge=pnl>0?'badge-win':pnl<0?'badge-loss':'badge-be';
    const label=pnl>0?'WIN':pnl<0?'LOSS':'BE';
    return`<tr><td style="white-space:nowrap;">${t.date||'—'}</td><td><span class="hour-badge">${t.time||'—'}</span></td><td style="font-weight:700;color:var(--blue);">${t.pair}</td><td style="color:${t.type==='BUY'?'var(--green)':'var(--red)'};font-weight:700;">${t.type}</td><td>${t.lot||'—'}</td><td>${t.entry||'—'}</td><td>${t.sl||'—'}</td><td>${t.tp||'—'}</td><td style="color:var(--purple);font-weight:700;">${t.rr||'—'}</td><td class="${pnl>=0?'trend-up':'trend-down'}" style="font-weight:700;">${pnl>=0?'+':''}$${pnl.toFixed(2)}</td><td><span class="badge ${badge}">${label}</span></td><td style="color:var(--text3);">${t.session||'—'}</td><td>${t.setup?`<span style="font-size:10px;background:var(--bg3);color:var(--purple);padding:2px 7px;border-radius:5px;">${t.setup}</span>`:'—'}</td><td style="font-size:12px;">${t.emotion?t.emotion.split(' ')[0]:'—'}</td><td style="color:var(--text3);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.notes||'—'}</td><td style="white-space:nowrap;"><button class="icon-btn" onclick="openEditTrade(${i})">✏️</button><button class="icon-btn del" onclick="deleteTradeRow(${i})">🗑</button></td></tr>`;
  }).join('');
}

document.getElementById('clearAllBtn').addEventListener('click', async ()=>{
  if(!confirm('¿Borrar TODOS los trades de la nube?'))return;
  showLoading('Borrando...');
  await deleteAllTrades(currentUser.id);
  hideLoading(); trades=[]; refreshAll(); showToast('🗑 Trades eliminados','warn'); showSync();
});

// CSV IMPORT UTILITIES
function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => resolve({ headers: results.meta.fields || [], rows: results.data }),
      error: err => reject(err),
    });
  });
}

const CSV_FIELD_OPTIONS = [
  { field: 'date',    label: 'Fecha',        required: true  },
  { field: 'pair',    label: 'Par',          required: true  },
  { field: 'type',    label: 'Tipo',         required: true  },
  { field: 'pnl',     label: 'P&L',          required: true  },
  { field: 'time',    label: 'Hora',         required: false },
  { field: 'lot',     label: 'Lote',         required: false },
  { field: 'entry',   label: 'Entrada',      required: false },
  { field: 'sl',      label: 'Stop Loss',    required: false },
  { field: 'tp',      label: 'Take Profit',  required: false },
  { field: 'risk',    label: 'Riesgo',       required: false },
  { field: 'rr',      label: 'R:R',          required: false },
  { field: 'session', label: 'Sesión',       required: false },
  { field: 'setup',   label: 'Setup',        required: false },
  { field: 'emotion', label: 'Emoción',      required: false },
  { field: 'notes',   label: 'Notas',        required: false },
];

function parseDateFlexible(value, format) {
  if (!value) return null;
  const v = value.trim();
  let y, m, d;
  if      (format === 'YYYY-MM-DD') { const p = v.split('-'); y=p[0]; m=p[1]; d=p[2]; }
  else if (format === 'DD/MM/YYYY') { const p = v.split('/'); d=p[0]; m=p[1]; y=p[2]; }
  else if (format === 'MM/DD/YYYY') { const p = v.split('/'); m=p[0]; d=p[1]; y=p[2]; }
  else if (format === 'YYYY.MM.DD') { const p = v.split('.'); y=p[0]; m=p[1]; d=p[2]; }
  else return null;
  if (!y || !m || !d) return null;
  const iso = `${y.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  return isNaN(Date.parse(iso)) ? null : iso;
}

function buildTradesFromMapping(rows, columnMapping, dateFormat, accountId) {
  const validTrades = [], errors = [];
  const normalizeType = raw => {
    const v = (raw || '').trim().toLowerCase();
    if (['buy', 'long'].includes(v))   return 'buy';
    if (['sell', 'short'].includes(v)) return 'sell';
    return null;
  };
  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const get = field => { const col = columnMapping[field]; return col ? (row[col] ?? '').toString().trim() : ''; };
    const num = field => { const v = get(field); return v !== '' ? (parseFloat(v) ?? null) : null; };
    const rawDate = get('date');
    const pair    = get('pair');
    const rawType = get('type');
    const rawPnl  = get('pnl');
    const date    = parseDateFlexible(rawDate, dateFormat);
    const type    = normalizeType(rawType);
    const pnl     = rawPnl !== '' ? parseFloat(rawPnl) : null;
    const rowErrors = [];
    if (!date)                       rowErrors.push('fecha inválida');
    if (!pair)                       rowErrors.push('par vacío');
    if (!type)                       rowErrors.push(`tipo no reconocido: "${rawType}"`);
    if (pnl === null || isNaN(pnl))  rowErrors.push('P&L inválido');
    if (rowErrors.length) { errors.push({ row: rowNum, reasons: rowErrors }); return; }
    validTrades.push({
      account_id: accountId,
      date, pair, type, pnl,
      time:    get('time')    || null,
      lot:     num('lot'),
      entry:   num('entry'),
      sl:      num('sl'),
      tp:      num('tp'),
      risk:    num('risk'),
      rr:      get('rr')      || null,
      session: get('session') || null,
      setup:   get('setup')   || null,
      emotion: get('emotion') || null,
      notes:   get('notes')   || null,
    });
  });
  return { validTrades, errors };
}

function showImportStep(n) {
  [1,2,3].forEach(i => document.getElementById(`importStep${i}`).classList.toggle('hidden', i !== n));
}

function renderImportMapping(headers) {
  const noneOpt = '<option value="">— No mapear —</option>';
  const headerOpts = headers.map(h => `<option value="${h}">${h}</option>`).join('');
  document.getElementById('importMappingContainer').innerHTML = CSV_FIELD_OPTIONS.map(f =>
    `<div class="form-row" style="margin-bottom:8px;align-items:center;">
      <div class="form-group" style="margin-bottom:0;flex:1;">
        <label style="font-size:12px;">${f.label}${f.required ? ' <span style="color:var(--red);">*</span>' : ''}</label>
      </div>
      <div class="form-group" style="margin-bottom:0;flex:2;">
        <select id="importMap_${f.field}" style="width:100%;">${noneOpt}${headerOpts}</select>
      </div>
    </div>`
  ).join('');
  CSV_FIELD_OPTIONS.forEach(f => {
    const sel = document.getElementById(`importMap_${f.field}`);
    const match = headers.find(h => h.toLowerCase() === f.field.toLowerCase() || h.toLowerCase().includes(f.field.toLowerCase()));
    if (match) sel.value = match;
  });
}

function renderImportPreview(validTrades, errors) {
  const preview = validTrades.slice(0, 5);
  let html = `<div style="margin-bottom:14px;font-size:13px;">
    <span style="color:var(--green);font-weight:700;">✅ ${validTrades.length} trades válidos</span>
    ${errors.length ? `&nbsp;·&nbsp;<span style="color:var(--red);font-weight:700;">⚠ ${errors.length} con errores</span>` : ''}
  </div>`;
  if (preview.length) {
    html += `<div style="overflow-x:auto;margin-bottom:14px;"><table class="trades-table" style="font-size:11px;">
      <thead><tr><th>Fecha</th><th>Par</th><th>Tipo</th><th>P&L</th><th>Sesión</th><th>Setup</th></tr></thead>
      <tbody>${preview.map(t => `<tr><td>${t.date}</td><td>${t.pair}</td><td>${t.type}</td><td>${t.pnl}</td><td>${t.session||'—'}</td><td>${t.setup||'—'}</td></tr>`).join('')}</tbody>
    </table></div>`;
    if (validTrades.length > 5) html += `<p style="font-size:12px;color:var(--text3);margin-bottom:14px;">... y ${validTrades.length - 5} trades más</p>`;
  }
  if (errors.length) {
    html += `<div style="background:var(--bg3);border-radius:8px;padding:10px;max-height:120px;overflow-y:auto;">
      <div style="font-size:12px;color:var(--red);font-weight:700;margin-bottom:6px;">Filas con errores (no se importarán):</div>
      ${errors.slice(0,10).map(e => `<div style="font-size:11px;color:var(--text3);">Fila ${e.row}: ${e.reasons.join(', ')}</div>`).join('')}
      ${errors.length > 10 ? `<div style="font-size:11px;color:var(--text3);">... y ${errors.length-10} más</div>` : ''}
    </div>`;
  }
  document.getElementById('importPreviewContainer').innerHTML = html;
}

document.getElementById('exportCsvBtn').addEventListener('click',()=>{
  if(!trades.length){showToast('Sin trades para exportar','warn');return;}
  const h=['Fecha','Hora','Par','Tipo','Lote','Entrada','SL','TP','RR','PnL','Riesgo','Sesion','Setup','Emocion','Notas'];
  const rows=trades.map(t=>[t.date,t.time,t.pair,t.type,t.lot,t.entry,t.sl,t.tp,t.rr,t.pnl,t.risk,t.session,t.setup,t.emotion,t.notes].map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(','));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([[h.join(','),...rows].join('\n')],{type:'text/csv;charset=utf-8;'}));
  a.download='propedge_trades.csv';a.click();showToast('✅ CSV exportado');
});

// PDF Export
document.getElementById('exportPdfBtn').addEventListener('click', () => {
  document.getElementById('pdfDateFrom').value = '';
  document.getElementById('pdfDateTo').value = '';
  document.getElementById('pdfModal').classList.remove('hidden');
});

document.getElementById('closePdfModal').addEventListener('click', () =>
  document.getElementById('pdfModal').classList.add('hidden')
);

document.getElementById('generatePdfBtn').addEventListener('click', () => {
  const from = document.getElementById('pdfDateFrom').value;
  const to   = document.getElementById('pdfDateTo').value;

  const activeAccount = accounts.find(a => a.id === currentAccountId) || {};
  const firmName = activeAccount.firm_name || 'Cuenta Principal';

  let filtered = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  if (from) filtered = filtered.filter(t => t.date >= from);
  if (to)   filtered = filtered.filter(t => t.date <= to);

  if (!filtered.length) { showToast('⚠ Sin trades en el rango seleccionado', 'warn'); return; }

  const { total, wins, losses, wr } = calcStats(filtered);
  const initBal = parseFloat(activeAccount.initial_balance) || getInitBalance();
  const balance = initBal + total;
  const today   = new Date().toISOString().split('T')[0];
  const rangeLabel = (from || to) ? `${from || '—'}  →  ${to || '—'}` : 'Histórico completo';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ── Encabezado
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('PropEdge Pro — Reporte de Trading', margin, 18);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Firma: ${firmName}`, margin, 26);
  doc.text(`Período: ${rangeLabel}`, margin, 32);
  doc.setDrawColor(180); doc.line(margin, 36, pageW - margin, 36);

  // ── Resumen
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Resumen', margin, 44);
  doc.autoTable({
    startY: 48,
    head: [['Métrica', 'Valor']],
    body: [
      ['Balance Inicial', `$${initBal.toLocaleString('en', {minimumFractionDigits:2})}`],
      ['Balance Actual',  `$${balance.toLocaleString('en', {minimumFractionDigits:2})}`],
      ['P&L Total',       `${total >= 0 ? '+' : ''}$${total.toFixed(2)}`],
      ['Total de Trades', filtered.length],
      ['Wins / Losses',   `${wins.length} / ${losses.length}`],
      ['Win Rate',        `${wr}%`],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [6, 95, 70] },
    columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 55 } },
    margin: { left: margin, right: margin },
    tableWidth: 'wrap',
  });

  // ── Equity Curve (solo con ≥ 2 trades)
  let afterResumen = doc.lastAutoTable.finalY + 8;
  if (filtered.length >= 2) {
    const equityLabels = ['Inicio', ...filtered.map((_, i) => i + 1)];
    const equityData   = [initBal];
    filtered.forEach(t => equityData.push(equityData[equityData.length - 1] + (parseFloat(t.pnl) || 0)));

    const canvas = document.createElement('canvas');
    canvas.id = 'equityChartCanvas';
    canvas.width = 900; canvas.height = 300;
    canvas.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(canvas);

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: equityLabels,
        datasets: [{
          data: equityData,
          borderColor: '#059669',
          backgroundColor: 'rgba(5,150,105,0.08)',
          borderWidth: 2,
          pointRadius: filtered.length > 50 ? 0 : 3,
          pointHoverRadius: 0,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        animation: false,
        responsive: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.06)' } },
          y: { grid: { color: 'rgba(0,0,0,0.06)' } },
        },
      },
    });

    const chartW = pageW - margin * 2;
    const chartH = 65;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('Equity Curve', margin, afterResumen);
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', margin, afterResumen + 4, chartW, chartH);
    afterResumen = afterResumen + 4 + chartH + 8;

    chart.destroy();
    canvas.remove();
  }

  // ── Tabla de trades
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Trades', margin, afterResumen);
  doc.autoTable({
    startY: afterResumen + 4,
    head: [['Fecha', 'Par', 'Tipo', 'Lote', 'P&L', 'Resultado']],
    body: filtered.map(t => [
      t.date  || '',
      t.pair  || '',
      t.type  || '',
      t.lot   || '',
      `${parseFloat(t.pnl) >= 0 ? '+' : ''}${parseFloat(t.pnl || 0).toFixed(2)}`,
      (t.result || '').toUpperCase(),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [6, 95, 70] },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(150);
      doc.text(`Generado el ${today}   ·   Página ${data.pageNumber}`, pageW / 2, pageH - 8, { align: 'center' });
      doc.setTextColor(0);
    },
  });

  doc.save(`PropEdge_${firmName.replace(/\s+/g, '_')}_${today}.pdf`);
  document.getElementById('pdfModal').classList.add('hidden');
  showToast('✅ PDF generado');
});

// BACKUP
async function downloadBackup(){
  showLoading('Generando backup...');
  const data=await fetchAllDataForBackup(currentUser.id);
  hideLoading();
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download=`propedge_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();showToast('✅ Backup descargado');
}
async function restoreBackup(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      if(!confirm(`¿Restaurar backup del ${data.exportDate||'desconocido'}?\nEsto sobreescribirá TODOS tus datos actuales.`))return;
      showLoading('Restaurando datos...');
      const {error}=await restoreAllData(currentUser.id, data);
      if(error){hideLoading();showToast('⚠ Error restaurando','error');return;}
      await loadAllData(); hideLoading();
      refreshAll();renderPlaybook();renderRiskHistory();renderPropFirms();renderPayouts();renderPsyc();renderLogros();
      showToast('✅ Backup restaurado correctamente'); showSync();
    }catch{showToast('⚠ Archivo inválido','error');}
  };
  reader.readAsText(file); e.target.value='';
}

// STATS
function renderStats(){
  const{wr,pf,best,worst,avgWin,avgLoss,rr,maxDD,maxW,maxL,expectancy,sharpe,recovery}=calcStats(trades);
  document.getElementById('statWR').textContent=wr+'%';
  document.getElementById('statPF').textContent=pf;
  document.getElementById('statBest').textContent=best>0?'+$'+best.toFixed(2):'$0';
  document.getElementById('statWorst').textContent=worst<0?'$'+worst.toFixed(2):'$0';
  document.getElementById('statAvgWin').textContent=avgWin>0?'+$'+avgWin.toFixed(2):'$0';
  document.getElementById('statAvgLoss').textContent=avgLoss<0?'$'+avgLoss.toFixed(2):'$0';
  document.getElementById('statRR').textContent=rr;
  document.getElementById('statDD').textContent=maxDD>0?'-$'+maxDD.toFixed(2):'$0';
  document.getElementById('statStreak').textContent=maxW;
  document.getElementById('statLossStreak').textContent=maxL;
  document.getElementById('statExpectancy').textContent=expectancy!=='—'?'$'+expectancy:'—';
  document.getElementById('statExpectancy').className='value '+(parseFloat(expectancy)>0?'trend-up':'trend-down');
  document.getElementById('statSharpe').textContent=sharpe;
  document.getElementById('statSharpe').className='value '+(parseFloat(sharpe)>=1?'trend-up':parseFloat(sharpe)<0?'trend-down':'');
  document.getElementById('statRecovery').textContent=recovery;
  document.getElementById('statRecovery').className='value '+(parseFloat(recovery)>1?'trend-up':'');
}
function buildAllStatCharts(){buildPieChart();buildBarChart();buildMonthlyChart();buildSessionChart();buildDistChart();buildWeekdayChart();buildHourChart();buildSetupChart();}
function buildPieChart(){const wins=trades.filter(t=>parseFloat(t.pnl)>0).length,losses=trades.filter(t=>parseFloat(t.pnl)<0).length,be=trades.filter(t=>parseFloat(t.pnl)===0).length;destroyChart('pie');charts['pie']=new Chart(document.getElementById('pieChart'),{type:'doughnut',data:{labels:['Wins','Losses','Breakeven'],datasets:[{data:[wins||0,losses||0,be||0],backgroundColor:['rgba(52,211,153,.25)','rgba(248,113,113,.25)','rgba(100,116,139,.25)'],borderColor:['#34d399','#f87171','#64748b'],borderWidth:2}]},options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8',font:{size:13}}}}}});}
function buildBarChart(){const pairs={};trades.forEach(t=>{if(!pairs[t.pair])pairs[t.pair]=0;pairs[t.pair]+=parseFloat(t.pnl)||0;});const keys=Object.keys(pairs),vals=keys.map(k=>parseFloat(pairs[k].toFixed(2)));destroyChart('bar');charts['bar']=new Chart(document.getElementById('barChart'),{type:'bar',data:{labels:keys.length?keys:['Sin datos'],datasets:[{label:'P&L ($)',data:vals.length?vals:[0],backgroundColor:vals.map(v=>v>=0?'rgba(52,211,153,.35)':'rgba(248,113,113,.35)'),borderColor:vals.map(v=>v>=0?'#34d399':'#f87171'),borderWidth:1.5,borderRadius:7}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}}}}});}
function buildMonthlyChart(){const months={};trades.forEach(t=>{if(!t.date)return;const mo=t.date.toString().slice(0,7);if(!months[mo])months[mo]=0;months[mo]+=parseFloat(t.pnl)||0;});const labels=Object.keys(months).sort(),vals=labels.map(m=>parseFloat(months[m].toFixed(2)));destroyChart('monthly');charts['monthly']=new Chart(document.getElementById('monthlyChart'),{type:'bar',data:{labels:labels.length?labels:['Sin datos'],datasets:[{label:'P&L mensual',data:vals.length?vals:[0],backgroundColor:vals.map(v=>v>=0?'rgba(56,189,248,.3)':'rgba(248,113,113,.3)'),borderColor:vals.map(v=>v>=0?'#38bdf8':'#f87171'),borderWidth:1.5,borderRadius:7}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}}}}});}
function buildSessionChart(){const s={'London':0,'New York':0,'Tokyo':0,'Sydney':0,'London/NY Overlap':0};trades.forEach(t=>{if(t.session&&s[t.session]!==undefined)s[t.session]+=parseFloat(t.pnl)||0;});const keys=Object.keys(s),vals=keys.map(k=>parseFloat(s[k].toFixed(2)));destroyChart('session');charts['session']=new Chart(document.getElementById('sessionChart'),{type:'bar',data:{labels:keys,datasets:[{label:'P&L ($)',data:vals,backgroundColor:vals.map(v=>v>=0?'rgba(167,139,250,.35)':'rgba(248,113,113,.35)'),borderColor:vals.map(v=>v>=0?'#a78bfa':'#f87171'),borderWidth:1.5,borderRadius:7}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#4f6280',maxRotation:30},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}}}}});const ctx2=document.getElementById('sessionPieChart');if(ctx2){destroyChart('sessionPie');const c={'London':0,'New York':0,'Tokyo':0,'Sydney':0,'London/NY Overlap':0};trades.forEach(t=>{if(t.session&&c[t.session]!==undefined)c[t.session]++;});charts['sessionPie']=new Chart(ctx2,{type:'doughnut',data:{labels:Object.keys(c),datasets:[{data:Object.values(c),backgroundColor:['rgba(251,191,36,.4)','rgba(52,211,153,.4)','rgba(167,139,250,.4)','rgba(56,189,248,.4)','rgba(248,113,113,.4)'],borderColor:['#fbbf24','#34d399','#a78bfa','#38bdf8','#f87171'],borderWidth:2}]},options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8',font:{size:12}}}}}});}}
function buildDistChart(){const pnls=trades.map(t=>parseFloat(t.pnl)||0);destroyChart('dist');if(!pnls.length){charts['dist']=new Chart(document.getElementById('distChart'),{type:'bar',data:{labels:['Sin datos'],datasets:[{data:[0]}]},options:{responsive:true,plugins:{legend:{display:false}}}});return;}const min=Math.floor(Math.min(...pnls)/50)*50,max=Math.ceil(Math.max(...pnls)/50)*50;const buckets={};for(let b=min;b<=max;b+=50)buckets[b]=0;pnls.forEach(p=>{const b=Math.floor(p/50)*50;buckets[b]=(buckets[b]||0)+1;});const labels=Object.keys(buckets).map(Number).sort((a,b)=>a-b).map(v=>(v>=0?'+':'')+v),vals=Object.keys(buckets).map(Number).sort((a,b)=>a-b).map(k=>buckets[k]);charts['dist']=new Chart(document.getElementById('distChart'),{type:'bar',data:{labels,datasets:[{label:'# Trades',data:vals,backgroundColor:'rgba(56,189,248,.3)',borderColor:'#38bdf8',borderWidth:1.5,borderRadius:5}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280',stepSize:1},grid:{color:'#1a264033'}}}}});}
function buildWeekdayChart(){const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];const pnlDay=Array(7).fill(0),countDay=Array(7).fill(0);trades.forEach(t=>{if(!t.date)return;const d=new Date(t.date+'T12:00:00').getDay();const idx=d===0?6:d-1;pnlDay[idx]+=parseFloat(t.pnl)||0;countDay[idx]++;});const vals=pnlDay.map((v,i)=>countDay[i]>0?parseFloat((v/countDay[i]).toFixed(2)):0);destroyChart('weekday');charts['weekday']=new Chart(document.getElementById('weekdayChart'),{type:'bar',data:{labels:DAYS,datasets:[{label:'P&L promedio',data:vals,backgroundColor:vals.map(v=>v>=0?'rgba(52,211,153,.35)':'rgba(248,113,113,.35)'),borderColor:vals.map(v=>v>=0?'#34d399':'#f87171'),borderWidth:1.5,borderRadius:7}]},options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`Prom: $${c.raw} (${countDay[c.dataIndex]} trades)`}}},scales:{x:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}}}}});}
function buildHourChart(){const pnlH={},countH={};trades.forEach(t=>{if(!t.time)return;const h=parseInt(t.time.split(':')[0],10);if(!pnlH[h]){pnlH[h]=0;countH[h]=0;}pnlH[h]+=parseFloat(t.pnl)||0;countH[h]++;});const hours=Object.keys(pnlH).map(Number).sort((a,b)=>a-b),labels=hours.map(h=>h+':00'),vals=hours.map(h=>countH[h]>0?parseFloat((pnlH[h]/countH[h]).toFixed(2)):0);destroyChart('hour');if(!hours.length){charts['hour']=new Chart(document.getElementById('hourChart'),{type:'bar',data:{labels:['Sin datos con hora'],datasets:[{data:[0]}]},options:{responsive:true,plugins:{legend:{display:false}}}});return;}charts['hour']=new Chart(document.getElementById('hourChart'),{type:'bar',data:{labels,datasets:[{label:'P&L promedio',data:vals,backgroundColor:vals.map(v=>v>=0?'rgba(56,189,248,.35)':'rgba(248,113,113,.35)'),borderColor:vals.map(v=>v>=0?'#38bdf8':'#f87171'),borderWidth:1.5,borderRadius:5}]},options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`Prom: $${c.raw} (${countH[hours[c.dataIndex]]} trades)`}}},scales:{x:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}}}}});}
function buildSetupChart(){const pnlS={},countS={};trades.forEach(t=>{if(!t.setup)return;if(!pnlS[t.setup]){pnlS[t.setup]=0;countS[t.setup]=0;}pnlS[t.setup]+=parseFloat(t.pnl)||0;countS[t.setup]++;});const setups=Object.keys(pnlS),vals=setups.map(s=>parseFloat(pnlS[s].toFixed(2)));destroyChart('setup');if(!setups.length){charts['setup']=new Chart(document.getElementById('setupChart'),{type:'bar',data:{labels:['Sin setups'],datasets:[{data:[0]}]},options:{responsive:true,plugins:{legend:{display:false}}}});return;}charts['setup']=new Chart(document.getElementById('setupChart'),{type:'bar',data:{labels:setups,datasets:[{label:'P&L total',data:vals,backgroundColor:vals.map(v=>v>=0?'rgba(167,139,250,.35)':'rgba(248,113,113,.35)'),borderColor:vals.map(v=>v>=0?'#a78bfa':'#f87171'),borderWidth:1.5,borderRadius:7}]},options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`Total: $${c.raw} (${countS[setups[c.dataIndex]]} trades)`}}},scales:{x:{ticks:{color:'#4f6280',maxRotation:30},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}}}}});}

function refreshAll(){renderTrades();renderStats();renderDashboard();buildEquityChart();buildWeeklyChart();buildDailyChart();buildAllStatCharts();buildMiniCalendar();renderLogros();renderPatrones();}

// PLAYBOOK
const CAT_ICONS={regla:'📋',setup:'🎯',gestion:'⚖️',psicologia:'🧠',nota:'📝'};
const CAT_LABELS={regla:'Regla de Trading',setup:'Setup / Estrategia',gestion:'Gestión de Riesgo',psicologia:'Psicología',nota:'Nota General'};
function renderPlaybook(){
  const list=document.getElementById('playbookList');
  if(!playbook.length){list.innerHTML='<div class="playbook-empty">📚 Sin reglas aún.<br><span style="font-size:12px;">Agrega tus primeras reglas de trading.</span></div>';return;}
  list.innerHTML=playbook.map((r,i)=>`<div class="playbook-item priority-${r.priority}"><div class="playbook-icon">${CAT_ICONS[r.category]||'📝'}</div><div class="playbook-body"><div class="playbook-title">${r.title}</div><div class="playbook-category">${CAT_LABELS[r.category]||r.category} · ${r.priority==='high'?'🔴 Alta':r.priority==='medium'?'🟡 Media':'🟢 Baja'}</div><div class="playbook-content">${r.content}</div></div><button class="playbook-del" onclick="deleteRuleRow('${r.id}')">✕</button></div>`).join('');
}
async function deleteRuleRow(id){
  if(!confirm('¿Eliminar regla?'))return;
  await deletePlaybookRule(id); playbook=playbook.filter(r=>r.id!==id);
  renderPlaybook(); showToast('🗑 Regla eliminada','warn'); showSync();
}
window.deleteRuleRow=deleteRuleRow;
document.getElementById('openRuleModal').addEventListener('click',()=>document.getElementById('ruleModal').classList.remove('hidden'));
document.getElementById('closeRuleModal').addEventListener('click',()=>document.getElementById('ruleModal').classList.add('hidden'));
document.getElementById('saveRuleBtn').addEventListener('click', async ()=>{
  const title=document.getElementById('ruleTitle').value.trim();
  const content=document.getElementById('ruleContent').value.trim();
  if(!title||!content){showToast('⚠ Completa título y descripción','warn');return;}
  const rule={title,content,category:document.getElementById('ruleCategory').value,priority:document.getElementById('rulePriority').value,date:new Date().toLocaleDateString('es-ES')};
  const {data,error}=await insertPlaybookRule(currentUser.id, rule);
  if(error){showToast('⚠ Error guardando','error');return;}
  playbook.unshift(data);
  document.getElementById('ruleModal').classList.add('hidden');
  document.getElementById('ruleTitle').value=''; document.getElementById('ruleContent').value='';
  renderPlaybook(); showToast('✅ Regla guardada'); showSync();
});

// PROP FIRMS
const PHASE_BADGE={challenge:'<span class="propfirm-phase-badge phase-badge-challenge">🎯 CHALLENGE</span>',verification:'<span class="propfirm-phase-badge phase-badge-verification">🔄 VERIFICACIÓN</span>',funded:'<span class="propfirm-phase-badge phase-badge-funded">✅ FONDEADA</span>',failed:'<span class="propfirm-phase-badge phase-badge-failed">❌ FALLIDA</span>'};
function renderPropFirms(){
  const el=document.getElementById('propFirmList');
  if(!propFirms.length){el.innerHTML='<div class="propfirm-empty"><span>🏦</span>Sin cuentas registradas.</div>';renderDashPropSummary();return;}
  el.innerHTML=propFirms.map((p,i)=>{
    const gain=parseFloat(p.gain)||0,target=parseFloat(p.target)||1,dd=parseFloat(p.dd)||1,ddUsed=parseFloat(p.dd_used||p.ddUsed)||0;
    const pct=Math.min(100,(gain/target)*100),ddPct=Math.min(100,(ddUsed/dd)*100);
    const fc=pct>=100?'success':ddPct>70?'danger':'';
    return`<div class="propfirm-card phase-${p.phase}"><div class="propfirm-header"><div><div class="propfirm-name">${p.firm}</div><div class="propfirm-size">$${Number(p.size).toLocaleString()} · Inicio: ${p.start_date||p.startDate||'—'}</div></div>${PHASE_BADGE[p.phase]||''}</div><div class="propfirm-target-bar"><div class="propfirm-target-label"><span>Progreso Profit Target</span><span>$${gain.toFixed(0)} / $${Number(p.target).toLocaleString()} (${pct.toFixed(1)}%)</span></div><div class="progress-track"><div class="progress-fill ${fc}" style="width:${pct}%"></div></div></div><div class="propfirm-stats"><div class="pf-stat"><div class="pf-stat-label">Ganancia Actual</div><div class="pf-stat-value" style="color:${gain>=0?'var(--green)':'var(--red)'}">$${gain.toFixed(2)}</div></div><div class="pf-stat"><div class="pf-stat-label">Profit Target</div><div class="pf-stat-value">$${Number(p.target).toLocaleString()}</div></div><div class="pf-stat"><div class="pf-stat-label">DD Permitido</div><div class="pf-stat-value">$${Number(p.dd).toLocaleString()}</div></div><div class="pf-stat"><div class="pf-stat-label">DD Restante</div><div class="pf-stat-value" style="color:${ddPct>70?'var(--red)':'var(--text)'}">$${(dd-ddUsed).toFixed(2)}</div></div></div><div class="propfirm-dd-bar"><div class="dd-label"><span>Drawdown Usado</span><span>$${ddUsed.toFixed(0)} / $${dd} (${ddPct.toFixed(1)}%)</span></div><div class="dd-track"><div class="dd-fill" style="width:${ddPct}%;opacity:${0.4+ddPct/200}"></div></div></div><div class="propfirm-footer"><div class="propfirm-days">📅 ${p.days_traded||p.daysTraded||0} días operados</div><div class="propfirm-actions-row"><button class="pf-btn" onclick="openEditProp(${i})">✏️ Editar</button><button class="pf-btn del" onclick="deletePropRow('${p.id}')">🗑</button></div></div></div>`;
  }).join('');
  renderDashPropSummary();
}
function openEditProp(i){
  const p=propFirms[i]; editPropIdx=i;
  document.getElementById('propModalTitle').textContent='✏️ Editar Cuenta';
  document.getElementById('propFirmName').value=p.firm; document.getElementById('propPhase').value=p.phase;
  document.getElementById('propSize').value=p.size; document.getElementById('propTarget').value=p.target;
  document.getElementById('propGain').value=p.gain||0; document.getElementById('propDD').value=p.dd;
  document.getElementById('propDDUsed').value=p.dd_used||p.ddUsed||0;
  document.getElementById('propMinDays').value=p.min_days||p.minDays||5;
  document.getElementById('propDaysTraded').value=p.days_traded||p.daysTraded||0;
  document.getElementById('propStartDate').value=p.start_date||p.startDate||'';
  document.getElementById('propNotes').value=p.notes||'';
  document.getElementById('propModal').classList.remove('hidden');
}
async function deletePropRow(id){
  if(!confirm('¿Eliminar cuenta?'))return;
  await deletePropFirm(id); propFirms=propFirms.filter(p=>p.id!==id);
  renderPropFirms(); showToast('🗑 Cuenta eliminada','warn'); showSync();
}
window.openEditProp=openEditProp; window.deletePropRow=deletePropRow;
document.getElementById('openPropModal').addEventListener('click',()=>{
  editPropIdx=null;
  document.getElementById('propModalTitle').textContent='🏦 Nueva Cuenta Prop Firm';
  ['propSize','propTarget','propGain','propDD','propDDUsed','propNotes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('propFirmName').selectedIndex=0; document.getElementById('propPhase').selectedIndex=0;
  document.getElementById('propStartDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('propMinDays').value='5'; document.getElementById('propDaysTraded').value='0';
  document.getElementById('propModal').classList.remove('hidden');
});
document.getElementById('closePropModal').addEventListener('click',()=>document.getElementById('propModal').classList.add('hidden'));
document.getElementById('savePropBtn').addEventListener('click', async ()=>{
  if(!document.getElementById('propSize').value||!document.getElementById('propTarget').value){showToast('⚠ Completa tamaño y objetivo','warn');return;}
  const entry={firm:document.getElementById('propFirmName').value,phase:document.getElementById('propPhase').value,size:parseFloat(document.getElementById('propSize').value),target:parseFloat(document.getElementById('propTarget').value),gain:parseFloat(document.getElementById('propGain').value)||0,dd:parseFloat(document.getElementById('propDD').value),dd_used:parseFloat(document.getElementById('propDDUsed').value)||0,min_days:parseInt(document.getElementById('propMinDays').value)||5,days_traded:parseInt(document.getElementById('propDaysTraded').value)||0,start_date:document.getElementById('propStartDate').value,notes:document.getElementById('propNotes').value};
  const existId=editPropIdx!==null?propFirms[editPropIdx]?.id:null;
  const {data,error}=await upsertPropFirm(currentUser.id, entry, existId);
  if(error){showToast('⚠ Error guardando','error');return;}
  if(existId) propFirms[editPropIdx]=data; else propFirms.unshift(data);
  document.getElementById('propModal').classList.add('hidden'); editPropIdx=null;
  renderPropFirms(); renderLogros(); showToast('✅ Cuenta guardada'); showSync();
});

// PAYOUTS
function renderPayouts(){
  const received=payouts.filter(p=>p.status==='received');
  const total=received.reduce((a,p)=>a+parseFloat(p.amount||0),0);
  const best=received.length?Math.max(...received.map(p=>parseFloat(p.amount||0))):0;
  const last=payouts.length?payouts[0]:null;
  document.getElementById('payoutTotal').textContent='$'+total.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('payoutCount').textContent=received.length;
  document.getElementById('payoutBest').textContent=best?'$'+best.toLocaleString():'$0';
  document.getElementById('payoutLast').textContent=last?`$${last.amount} · ${last.firm}`:'—';
  const el=document.getElementById('payoutList');
  if(!payouts.length){el.innerHTML='<div class="payout-empty"><span>💸</span>Sin payouts registrados.</div>';return;}
  el.innerHTML=payouts.map((p,i)=>{const rec=p.status==='received';return`<div class="payout-item"><div class="payout-icon">${rec?'💰':'⏳'}</div><div class="payout-body"><div class="payout-firm">${p.firm}</div><div class="payout-date">📅 ${p.date||'—'}</div>${p.notes?`<div class="payout-notes">📝 ${p.notes}</div>`:''}</div><div><div class="payout-amount ${rec?'':'pending'}">${rec?'+':'⏳ '}$${Number(p.amount).toLocaleString()}</div><div style="text-align:right;margin-top:4px;"><span class="payout-status-badge" style="${rec?'background:rgba(52,211,153,.15);color:var(--green);border:1px solid rgba(52,211,153,.3)':'background:rgba(251,191,36,.12);color:var(--yellow);border:1px solid rgba(251,191,36,.3)'}">${rec?'✅ Recibido':'⏳ Pendiente'}</span></div></div><button class="payout-del-btn" onclick="deletePayoutRow('${p.id}')">✕</button></div>`;}).join('');
  buildPayoutChart();
}
function buildPayoutChart(){const ctx=document.getElementById('payoutChart');if(!ctx)return;const byFirm={};payouts.filter(p=>p.status==='received').forEach(p=>{if(!byFirm[p.firm])byFirm[p.firm]=0;byFirm[p.firm]+=parseFloat(p.amount||0);});const labels=Object.keys(byFirm),vals=labels.map(k=>byFirm[k]);destroyChart('payout');if(!labels.length){charts['payout']=new Chart(ctx,{type:'doughnut',data:{labels:['Sin payouts'],datasets:[{data:[1],backgroundColor:['rgba(100,116,139,.2)'],borderColor:['#64748b'],borderWidth:1}]},options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8'}}}}});return;}charts['payout']=new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data:vals,backgroundColor:['rgba(52,211,153,.4)','rgba(56,189,248,.4)','rgba(167,139,250,.4)','rgba(251,191,36,.4)','rgba(248,113,113,.4)'],borderColor:['#34d399','#38bdf8','#a78bfa','#fbbf24','#f87171'],borderWidth:2}]},options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8',font:{size:12}}},tooltip:{callbacks:{label:c=>`${c.label}: $${c.raw.toLocaleString()}`}}}}});}
async function deletePayoutRow(id){if(!confirm('¿Eliminar payout?'))return;await deletePayoutDB(id);payouts=payouts.filter(p=>p.id!==id);renderPayouts();showToast('🗑 Payout eliminado','warn');showSync();}
window.deletePayoutRow=deletePayoutRow;
document.getElementById('openPayoutModal').addEventListener('click',()=>{document.getElementById('payoutDate').value=new Date().toISOString().split('T')[0];document.getElementById('payoutAmount').value='';document.getElementById('payoutNotes').value='';document.getElementById('payoutFirm').selectedIndex=0;document.getElementById('payoutStatus').selectedIndex=0;document.getElementById('payoutModal').classList.remove('hidden');});
document.getElementById('closePayoutModal').addEventListener('click',()=>document.getElementById('payoutModal').classList.add('hidden'));
document.getElementById('savePayoutBtn').addEventListener('click', async ()=>{
  if(!document.getElementById('payoutAmount').value){showToast('⚠ Ingresa el monto','warn');return;}
  const entry={firm:document.getElementById('payoutFirm').value,amount:parseFloat(document.getElementById('payoutAmount').value),status:document.getElementById('payoutStatus').value,date:document.getElementById('payoutDate').value,notes:document.getElementById('payoutNotes').value};
  const{data,error}=await insertPayout(currentUser.id,entry);
  if(error){showToast('⚠ Error guardando','error');return;}
  payouts.unshift(data);document.getElementById('payoutModal').classList.add('hidden');renderPayouts();renderLogros();showToast('✅ Payout registrado');showSync();
});

// PSICOLOGÍA
const EMO_ICONS={excelente:'😄',bien:'🙂',neutral:'😐',mal:'😞',muy_mal:'😣'};
const EMO_LABELS={excelente:'Excelente',bien:'Bien',neutral:'Neutral',mal:'Mal',muy_mal:'Muy Mal'};
function renderPsyc(){
  if(psycEntries.length){const avg=k=>(psycEntries.reduce((a,e)=>a+(parseFloat(e[k])||0),0)/psycEntries.length).toFixed(1);document.getElementById('psycTotal').textContent=psycEntries.length;document.getElementById('psycDisciplina').textContent=avg('disciplina');document.getElementById('psycConfianza').textContent=avg('confianza');document.getElementById('psycEstres').textContent=avg('estres');}else{['psycTotal','psycDisciplina','psycConfianza','psycEstres'].forEach(id=>document.getElementById(id).textContent='—');}
  const el=document.getElementById('psycList');
  if(!psycEntries.length){el.innerHTML='<div class="psyc-empty"><span>🧠</span>Sin entradas psicológicas aún.</div>';return;}
  el.innerHTML=psycEntries.map(e=>{const d=e.date?new Date(e.date+'T12:00:00'):new Date();return`<div class="psyc-item"><div class="psyc-date-col"><div class="psyc-date-day">${String(d.getDate()).padStart(2,'0')}</div><div class="psyc-date-month">${d.toLocaleDateString('es-ES',{month:'short'}).toUpperCase()}</div></div><div><div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;"><span style="font-size:26px;">${EMO_ICONS[e.emocion]||'😐'}</span><span style="font-size:14px;font-weight:700;color:var(--text);">${EMO_LABELS[e.emocion]||'—'}</span></div><div class="psyc-metrics"><div class="psyc-metric">💪 <b>${e.confianza||'—'}/10</b></div><div class="psyc-metric">😤 <b>${e.estres||'—'}/10</b></div><div class="psyc-metric">🎯 <b>${e.disciplina||'—'}/10</b></div><div class="psyc-metric">📋 <b>${e.plan||'—'}/10</b></div></div>${e.comentarios?`<div class="psyc-comment">"${e.comentarios}"</div>`:''}</div><button class="psyc-del" onclick="deletePsycRow('${e.id}')">✕</button></div>`;}).join('');
}
async function deletePsycRow(id){if(!confirm('¿Eliminar entrada?'))return;await deletePsycEntry(id);psycEntries=psycEntries.filter(e=>e.id!==id);renderPsyc();buildPsycChart();buildEmotionChart();showToast('🗑 Eliminado','warn');showSync();}
window.deletePsycRow=deletePsycRow;
function buildPsycChart(){const ctx=document.getElementById('psycChart');if(!ctx)return;const last14=[...psycEntries].slice(0,14).reverse();const labels=last14.map(e=>e.date?new Date(e.date+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short'}):'—');destroyChart('psyc');charts['psyc']=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Confianza',data:last14.map(e=>e.confianza||0),borderColor:'#38bdf8',tension:.4,fill:false,pointRadius:3},{label:'Disciplina',data:last14.map(e=>e.disciplina||0),borderColor:'#34d399',tension:.4,fill:false,pointRadius:3},{label:'Estrés',data:last14.map(e=>e.estres||0),borderColor:'#f87171',tension:.4,fill:false,pointRadius:3}]},options:{responsive:true,scales:{x:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'},min:0,max:10}},plugins:{legend:{labels:{color:'#94a3b8',font:{size:12}}}}}});}
function buildEmotionChart(){const ctx=document.getElementById('emotionChart');if(!ctx)return;const ep={};psycEntries.forEach(e=>{if(!e.emocion||!e.date)return;const dt=trades.filter(t=>t.date&&t.date.toString()===e.date.toString());if(!dt.length)return;const dp=dt.reduce((a,t)=>a+(parseFloat(t.pnl)||0),0);if(!ep[e.emocion])ep[e.emocion]={sum:0,count:0};ep[e.emocion].sum+=dp;ep[e.emocion].count++;});const labels=Object.keys(ep).map(k=>EMO_LABELS[k]||k),vals=Object.keys(ep).map(k=>parseFloat((ep[k].sum/ep[k].count).toFixed(2)));destroyChart('emotion');charts['emotion']=new Chart(ctx,{type:'bar',data:{labels:labels.length?labels:['Sin correlaciones'],datasets:[{label:'P&L promedio',data:vals.length?vals:[0],backgroundColor:vals.map(v=>v>=0?'rgba(52,211,153,.35)':'rgba(248,113,113,.35)'),borderColor:vals.map(v=>v>=0?'#34d399':'#f87171'),borderWidth:1.5,borderRadius:7}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}},y:{ticks:{color:'#4f6280'},grid:{color:'#1a264033'}}}}});}
function renderPatrones() {
  const el = document.getElementById('patronesContent');
  if (!el) return;
  let html = '';

  // ── Rachas
  const sorted = [...trades].sort((a, b) => (a.date||'').localeCompare(b.date||''));
  let streakLen = 0, streakType = null;
  if (sorted.length) {
    const lastPnl = parseFloat(sorted[sorted.length - 1].pnl) || 0;
    streakType = lastPnl > 0 ? 'win' : lastPnl < 0 ? 'loss' : null;
    if (streakType) {
      for (let i = sorted.length - 1; i >= 0; i--) {
        const p = parseFloat(sorted[i].pnl) || 0;
        if ((p > 0 ? 'win' : p < 0 ? 'loss' : null) === streakType) streakLen++;
        else break;
      }
    }
  }
  if (streakLen >= 3) {
    if (streakType === 'loss')
      html += `<div style="background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.3);border-radius:10px;padding:14px 16px;margin-bottom:14px;font-size:13px;">⚠️ <strong>Llevas ${streakLen} pérdidas seguidas.</strong> Cuidado con el revenge trading.</div>`;
    else
      html += `<div style="background:rgba(5,150,105,0.1);border:1px solid rgba(5,150,105,0.25);border-radius:10px;padding:14px 16px;margin-bottom:14px;font-size:13px;">✅ Llevas ${streakLen} operaciones ganadoras seguidas. Mantén la disciplina de tu plan.</div>`;
  }

  // ── Correlación emoción vs resultado
  const emoMap = {};
  trades.filter(t => t.emotion).forEach(t => {
    if (!emoMap[t.emotion]) emoMap[t.emotion] = { count: 0, wins: 0, pnlSum: 0 };
    emoMap[t.emotion].count++;
    if (parseFloat(t.pnl) > 0) emoMap[t.emotion].wins++;
    emoMap[t.emotion].pnlSum += parseFloat(t.pnl) || 0;
  });
  const generalWR = trades.length ? Math.round(trades.filter(t => parseFloat(t.pnl) > 0).length / trades.length * 100) : 0;
  const qualified = Object.entries(emoMap)
    .filter(([, v]) => v.count >= 3)
    .map(([emo, v]) => ({ emo, count: v.count, wr: Math.round(v.wins / v.count * 100), avgPnl: v.pnlSum / v.count }))
    .sort((a, b) => a.wr - b.wr);

  if (!qualified.length) {
    html += `<p style="color:var(--text2);font-size:13px;margin:0;">Aún no hay suficientes trades etiquetados con emoción para detectar patrones.</p>`;
  } else {
    const worst = qualified[0];
    if (worst.wr < generalWR)
      html += `<div style="background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.2);border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:13px;">📉 Cuando marcas <strong>"${worst.emo}"</strong> tu win rate cae a <strong>${worst.wr}%</strong> (vs ${generalWR}% general).</div>`;
    html += `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="color:var(--text2);border-bottom:1px solid var(--border2);">
        <th style="text-align:left;padding:6px 8px;font-weight:600;">Emoción</th>
        <th style="text-align:center;padding:6px 8px;font-weight:600;">Trades</th>
        <th style="text-align:center;padding:6px 8px;font-weight:600;">Win Rate</th>
        <th style="text-align:center;padding:6px 8px;font-weight:600;">P&L Prom.</th>
      </tr></thead>
      <tbody>${qualified.map((r, i) => `<tr style="border-bottom:1px solid var(--border2);${i===0?'background:rgba(220,38,38,0.06);':''}">
        <td style="padding:7px 8px;font-weight:${i===0?'700':'400'};">${i===0?'📉 ':''}${r.emo}</td>
        <td style="text-align:center;padding:7px 8px;color:var(--text2);">${r.count}</td>
        <td style="text-align:center;padding:7px 8px;color:${r.wr>=generalWR?'var(--green)':'var(--red)'};font-weight:700;">${r.wr}%</td>
        <td style="text-align:center;padding:7px 8px;color:${r.avgPnl>=0?'var(--green)':'var(--red)'};">${r.avgPnl>=0?'+':''}$${r.avgPnl.toFixed(2)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }
  el.innerHTML = html;
}
document.getElementById('openPsycModal').addEventListener('click',()=>{document.getElementById('psycDate').value=new Date().toISOString().split('T')[0];document.getElementById('psycComentarios').value='';document.getElementById('psycEmocion').selectedIndex=0;['psycConfianzaVal','psycEstresVal','psycDisciplinaVal','psycPlanVal'].forEach(id=>{const el=document.getElementById(id);el.value=id.includes('Estres')?'3':'7';});['psycConfianzaNum','psycDisciplinaNum','psycPlanNum'].forEach(id=>document.getElementById(id).textContent='7');document.getElementById('psycEstresNum').textContent='3';document.getElementById('psycModal').classList.remove('hidden');});
document.getElementById('closePsycModal').addEventListener('click',()=>document.getElementById('psycModal').classList.add('hidden'));
document.getElementById('savePsycBtn').addEventListener('click', async ()=>{
  const date=document.getElementById('psycDate').value;
  if(!date){showToast('⚠ Selecciona una fecha','warn');return;}
  const entry={date,emocion:document.getElementById('psycEmocion').value,confianza:parseInt(document.getElementById('psycConfianzaVal').value),estres:parseInt(document.getElementById('psycEstresVal').value),disciplina:parseInt(document.getElementById('psycDisciplinaVal').value),plan:parseInt(document.getElementById('psycPlanVal').value),comentarios:document.getElementById('psycComentarios').value};
  const{data,error}=await insertPsyc(currentUser.id,entry);
  if(error){showToast('⚠ Error guardando','error');return;}
  psycEntries.unshift(data);document.getElementById('psycModal').classList.add('hidden');
  renderPsyc();buildPsycChart();buildEmotionChart();renderLogros();showToast('✅ Entrada guardada');showSync();
});

// LOGROS
function getAchievements(){
  const{wr,maxW,total,wins}=calcStats(trades);
  const rec=payouts.filter(p=>p.status==='received');
  const totalPay=rec.reduce((a,p)=>a+parseFloat(p.amount||0),0);
  const funded=propFirms.filter(p=>p.phase==='funded').length;
  const{expectancy}=calcStats(trades);
  return[
    {icon:'🎯',title:'Primer Trade',       desc:'Registra tu primer trade.',                        unlocked:trades.length>=1},
    {icon:'📊',title:'10 Trades',          desc:'10 operaciones en el journal.',                    unlocked:trades.length>=10},
    {icon:'📈',title:'50 Trades',          desc:'50 operaciones registradas.',                      unlocked:trades.length>=50},
    {icon:'💯',title:'100 Trades',         desc:'100 trades. La disciplina es tu ventaja.',         unlocked:trades.length>=100},
    {icon:'⏰',title:'Registro con Hora',  desc:'Registra un trade con la hora específica.',        unlocked:trades.some(t=>t.time)},
    {icon:'✅',title:'Primera Victoria',   desc:'Obtén tu primer trade ganador.',                   unlocked:wins.length>=1},
    {icon:'⚖️',title:'Win Rate 50%+',     desc:'Win rate de 50%+ (mín. 10 trades).',              unlocked:wr>=50&&trades.length>=10},
    {icon:'🎖️',title:'Win Rate 60%+',     desc:'Win rate superior al 60% (mín. 20 trades).',      unlocked:wr>=60&&trades.length>=20},
    {icon:'🔥',title:'Racha de 5',         desc:'5 trades ganadores consecutivos.',                 unlocked:maxW>=5},
    {icon:'⚡',title:'Racha de 10',        desc:'10 trades ganadores seguidos.',                    unlocked:maxW>=10},
    {icon:'💵',title:'$500 Ganancias',     desc:'$500 en ganancias netas.',                         unlocked:total>=500},
    {icon:'💰',title:'$5,000 Ganancias',   desc:'$5,000 netos. Trader rentable.',                  unlocked:total>=5000},
    {icon:'📉',title:'Expectancy Positivo',desc:'Expectancy positiva (mín. 10 trades).',            unlocked:parseFloat(expectancy)>0&&trades.length>=10},
    {icon:'🏦',title:'Primera Prop Firm',  desc:'Registra tu primera cuenta de prop firm.',         unlocked:propFirms.length>=1},
    {icon:'🎉',title:'Cuenta Fondeada',    desc:'Tu primera cuenta fondeada.',                      unlocked:funded>=1},
    {icon:'🏆',title:'3 Cuentas Fondeadas',desc:'3 cuentas fondeadas simultáneamente.',            unlocked:funded>=3},
    {icon:'💸',title:'Primer Payout',      desc:'Tu primer retiro recibido.',                       unlocked:rec.length>=1},
    {icon:'💳',title:'$1,000 Retirados',   desc:'$1,000 acumulados en payouts.',                    unlocked:totalPay>=1000},
    {icon:'🤑',title:'$10,000 Retirados',  desc:'$10,000 en payouts. Trader profesional.',          unlocked:totalPay>=10000},
    {icon:'🧠',title:'Autoconciencia',     desc:'Primera entrada en el diario psicológico.',        unlocked:psycEntries.length>=1},
    {icon:'🌟',title:'Semana Consciente',  desc:'7 entradas en el diario psicológico.',             unlocked:psycEntries.length>=7},
    {icon:'📚',title:'Playbook Activo',    desc:'Tu primera regla de trading.',                     unlocked:playbook.length>=1},
  ];
}
function renderLogros(){
  const ach=getAchievements(), unlocked=ach.filter(a=>a.unlocked);
  const pct=ach.length?Math.round(unlocked.length/ach.length*100):0;
  document.getElementById('logrosProgress').textContent=`${unlocked.length} / ${ach.length}`;
  document.getElementById('logrosBar').style.width=pct+'%';
  document.getElementById('logrosSubtitle').textContent=pct===100?'🎉 ¡Completaste todos los logros!':pct+'% completado';
  document.getElementById('logrosList').innerHTML=ach.map(a=>`<div class="logro-card ${a.unlocked?'unlocked':'locked'}"><div class="logro-icon">${a.icon}</div><div class="logro-body"><div class="logro-title">${a.title}</div><div class="logro-desc">${a.desc}</div>${a.unlocked?'<div class="logro-unlocked-date">✓ Desbloqueado</div>':'<div class="logro-locked-label">🔒 Bloqueado</div>'}</div></div>`).join('');
}

// INFO DE USUARIO
function renderUserInfo(){
  const el=document.getElementById('usersList');
  if(!el)return;
  const username=currentProfile?.username||'—';
  const email=currentUser?.email||'—';
  const role=currentProfile?.role||'trader';
  el.innerHTML=`<div class="user-item"><div><div class="user-name">👤 ${username}</div><div class="user-role">${role==='admin'?'🔑 Admin':role==='viewer'?'👁 Solo lectura':'📊 Trader'}</div><div style="font-size:11px;color:var(--text3);margin-top:3px;">📧 ${email}</div></div><div class="sync-badge"><div class="sync-dot"></div>Supabase Auth</div></div>`;
}

