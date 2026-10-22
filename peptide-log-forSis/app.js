const APP_VERSION = '1.7.2';
const SITES = ['Abdomen L', 'Abdomen R', 'Thigh L', 'Thigh R', 'Arm L', 'Arm R', 'Glute L', 'Glute R', 'Nasal', 'Oral', 'Topical', 'Other'];
const ADD_NEW = '__add__';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);
const fmtNum = (n) => (n == null ? '' : String(+(+n).toFixed(4)));

const state = { peptides: [], supplies: [], entries: [], schedules: [], daily: [], editingId: null, site: '', volTouched: false };

// ---------- helpers ----------
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function timeStr(iso) { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function dayKey(iso) { const d = new Date(iso); return toLocalInput(d).slice(0, 10); }
function dayLabel(key) {
  const today = dayKey(new Date().toISOString());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === today) return 'Today';
  if (key === dayKey(y.toISOString())) return 'Yesterday';
  const [Y, M, D] = key.split('-').map(Number);
  return new Date(Y, M - 1, D).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}
function vialText(p) {
  if (p.vialAmount == null) return p.vialCount != null ? `${p.vialCount} vial${p.vialCount === 1 ? '' : 's'}` : '';
  return `${fmtNum(p.vialAmount)} ${p.vialUnit} × ${p.vialCount ?? 0} vial${p.vialCount === 1 ? '' : 's'}`;
}
function entrySummary(e) {
  const parts = [];
  if (e.dose != null) parts.push(`${fmtNum(e.dose)} ${e.doseUnit}`);
  if (e.volume != null) parts.push(`${fmtNum(e.volume)} ${e.volumeUnit}`);
  if (e.site) parts.push(e.site);
  return parts.join(' · ');
}
let toastTimer;
function toast(msg, undo) {
  const t = $('toast');
  t.textContent = msg;
  if (undo) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Undo' });
    b.onclick = () => { t.classList.remove('show'); undo(); };
    t.appendChild(b);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 5000 : 2200);
}
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
const activePeptides = () => state.peptides.filter((p) => !p.archived).sort(byName);
const lastEntryFor = (pid) => state.entries.filter((e) => e.peptideId === pid).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];

async function load() {
  [state.peptides, state.supplies, state.entries, state.schedules, state.daily] = await Promise.all([DB.all('peptides'), DB.all('supplies'), DB.all('entries'), DB.all('schedules'), DB.all('daily')]);
}

// ---------- tabs ----------
const TITLES = { log: 'Log a dose', history: 'History', peptides: 'Peptides', calc: 'Dose calculator', info: 'Info' };
function show(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('title').textContent = view === 'log' && state.editingId ? 'Edit dose' : TITLES[view];
  if (view === 'history') renderHistTab();
  if (view === 'peptides') renderPeptides();
  if (view === 'log') { renderToday(); renderAlerts(); renderCheckin(); }
  if (view === 'info') renderInfo();
  if (view === 'calc') renderCalc();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

// ---------- log form ----------
function renderPeptideSelect(selectId) {
  const sel = $('fPeptide');
  const current = selectId ?? sel.value;
  const list = activePeptides();
  // keep an archived peptide visible when editing an old entry that uses it
  const editing = state.editingId && state.peptides.find((p) => p.id === current && p.archived);
  if (editing) list.push(editing);
  sel.innerHTML =
    `<option value="" disabled>Choose a peptide</option>` +
    list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.vialAmount != null ? ` (${fmtNum(p.vialAmount)} ${esc(p.vialUnit)})` : ''}</option>`).join('') +
    `<option value="${ADD_NEW}">+ Add new peptide…</option>`;
  sel.value = list.some((p) => p.id === current) ? current : '';
}

function renderSites() {
  const last = lastEntryFor($('fPeptide').value);
  $('siteChips').innerHTML = SITES.map((s) =>
    `<button type="button" class="chip${state.site === s ? ' on' : ''}" data-site="${esc(s)}">${esc(s)}${last && last.site === s ? '<span class="last">last</span>' : ''}</button>`
  ).join('');
  $('fSiteOther').hidden = state.site !== 'Other';
}
$('siteChips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  state.site = state.site === b.dataset.site ? '' : b.dataset.site;
  renderSites();
});

function renderLastHint() {
  const hint = $('lastHint');
  const last = state.editingId ? null : lastEntryFor($('fPeptide').value);
  if (!last) { hint.hidden = true; return; }
  hint.hidden = false;
  hint.innerHTML = `<span>Last: ${esc(entrySummary(last) || 'logged')} · ${esc(ago(last.takenAt))}</span><button type="button" class="btn ghost small" id="useLast">Use same dose</button>`;
  $('useLast').onclick = () => {
    $('fDose').value = fmtNum(last.dose);
    $('fDoseUnit').value = last.doseUnit || 'mcg';
    $('fVolume').value = fmtNum(last.volume);
    $('fVolumeUnit').value = last.volumeUnit || 'mL';
    state.volTouched = true;
    renderVolHint();
  };
}

// ---------- mixing math ----------
// U-100 insulin syringe: 1 mL = 100 units. Strength = peptide mg per mL of bac water.
function toMg(amount, unit) {
  if (amount == null) return null;
  if (unit === 'mg') return amount;
  if (unit === 'mcg') return amount / 1000;
  return null;
}
function strengthOf(vialAmount, vialUnit, bacMl) {
  const mg = toMg(vialAmount, vialUnit);
  return mg && bacMl > 0 ? mg / bacMl : null;
}
const pepStrength = (p) => (p ? strengthOf(p.vialAmount, p.vialUnit, p.bacMl) : null);
const round1 = (n) => Math.round(n * 10) / 10;
function mixText(p) { return p?.bacMl > 0 && p.vialAmount != null ? `${fmtNum(p.vialAmount)} ${p.vialUnit} + ${fmtNum(p.bacMl)} mL` : ''; }

function renderVolHint() {
  const v = num($('fVolume').value);
  const u = $('fVolumeUnit').value;
  const p = state.peptides.find((x) => x.id === $('fPeptide').value);
  const conc = pepStrength(p);
  const parts = [];
  if (v != null) parts.push(u === 'mL' ? `= ${fmtNum(v * 100)} units on a U-100 insulin syringe` : `= ${fmtNum(v / 100)} mL`);
  if (conc) parts.push(`Strength ${fmtNum(conc)} mg/mL (${mixText(p)})`);
  $('volHint').textContent = parts.join(' · ');
}
// Fill units from the dose when the peptide's mix is known, until the volume is typed by hand.
function autoUnits() {
  if (state.volTouched) return renderVolHint();
  const p = state.peptides.find((x) => x.id === $('fPeptide').value);
  const conc = pepStrength(p);
  const mg = toMg(num($('fDose').value), $('fDoseUnit').value);
  if (conc && mg != null) {
    $('fVolume').value = fmtNum(round1((mg / conc) * 100));
    $('fVolumeUnit').value = 'units';
  }
  renderVolHint();
}
['input', 'change'].forEach((ev) => {
  $('fVolume').addEventListener(ev, () => { state.volTouched = $('fVolume').value !== ''; renderVolHint(); });
  $('fVolumeUnit').addEventListener(ev, () => { state.volTouched = true; renderVolHint(); });
  $('fDose').addEventListener(ev, autoUnits);
  $('fDoseUnit').addEventListener(ev, autoUnits);
});

$('fPeptide').addEventListener('change', () => {
  if ($('fPeptide').value === ADD_NEW) {
    $('fPeptide').value = '';
    openPeptideDialog(null, (p) => { renderPeptideSelect(p.id); onPeptideChosen(); });
    return;
  }
  onPeptideChosen();
});
function onPeptideChosen() { renderLastHint(); renderSites(); autoUnits(); renderToday(); renderAlerts(); renderCheckin(); }

$('nowBtn').addEventListener('click', () => { $('fWhen').value = toLocalInput(new Date()); });

function resetForm(keepPeptide = true) {
  const pid = keepPeptide ? $('fPeptide').value : '';
  state.editingId = null;
  state.site = '';
  state.volTouched = false;
  $('logForm').reset();
  renderPeptideSelect(pid);
  $('fWhen').value = toLocalInput(new Date());
  $('editBanner').hidden = true;
  $('cancelEditBtn').hidden = true;
  $('deleteBtn').hidden = true;
  $('saveBtn').textContent = 'Save dose';
  $('fSiteOther').value = '';
  renderVolHint();
  onPeptideChosen();
  if (document.querySelector('#view-log.active')) $('title').textContent = TITLES.log;
}

function editEntry(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  state.editingId = id;
  state.volTouched = true;
  renderPeptideSelect(e.peptideId);
  $('fDose').value = fmtNum(e.dose);
  $('fDoseUnit').value = e.doseUnit || 'mcg';
  $('fVolume').value = fmtNum(e.volume);
  $('fVolumeUnit').value = e.volumeUnit || 'mL';
  $('fWhen').value = toLocalInput(new Date(e.takenAt));
  $('fNotes').value = e.notes || '';
  if (e.site && !SITES.includes(e.site)) { state.site = 'Other'; $('fSiteOther').value = e.site; }
  else { state.site = e.site || ''; $('fSiteOther').value = ''; }
  $('editBanner').hidden = false;
  $('cancelEditBtn').hidden = false;
  $('deleteBtn').hidden = false;
  $('saveBtn').textContent = 'Update entry';
  renderVolHint();
  onPeptideChosen();
  show('log');
}

$('logForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const pid = $('fPeptide').value;
  const pep = state.peptides.find((p) => p.id === pid);
  if (!pep) { toast('Choose a peptide first'); $('fPeptide').focus(); return; }
  const dose = num($('fDose').value);
  const volume = num($('fVolume').value);
  if (dose == null && volume == null) { toast('Enter a dose or a volume'); $('fDose').focus(); return; }
  const when = new Date($('fWhen').value);
  if (isNaN(when)) { toast('Check the date and time'); return; }
  const site = state.site === 'Other' ? ($('fSiteOther').value.trim() || 'Other') : state.site;

  const prev = state.editingId ? state.entries.find((x) => x.id === state.editingId) : {};
  const rec = await DB.put('entries', {
    ...prev,
    peptideId: pep.id,
    peptideName: pep.name,
    dose, doseUnit: $('fDoseUnit').value,
    volume, volumeUnit: $('fVolumeUnit').value,
    takenAt: when.toISOString(),
    site,
    notes: $('fNotes').value.trim(),
    status: prev.status || 'taken',
    vialId: prev.vialId ?? null,
    scheduleId: prev.scheduleId ?? null
  });
  const i = state.entries.findIndex((x) => x.id === rec.id);
  if (i >= 0) state.entries[i] = rec; else state.entries.push(rec);
  const wasEditing = !!state.editingId;
  toast(wasEditing ? 'Entry updated' : `Saved ${pep.name}`);
  askPersist();
  resetForm(true);
  if (wasEditing) show('history');
});

$('cancelEditBtn').addEventListener('click', () => { resetForm(false); show('history'); });
// Two taps to delete, so a stray tap can't remove an entry.
let deleteArmed = null;
$('deleteBtn').addEventListener('click', async () => {
  if (!state.editingId) return;
  if (deleteArmed !== state.editingId) {
    deleteArmed = state.editingId;
    $('deleteBtn').textContent = 'Tap again to delete';
    setTimeout(() => { deleteArmed = null; $('deleteBtn').textContent = 'Delete'; }, 4000);
    return;
  }
  deleteArmed = null;
  $('deleteBtn').textContent = 'Delete';
  await DB.del('entries', state.editingId);
  state.entries = state.entries.filter((x) => x.id !== state.editingId);
  toast('Entry deleted');
  resetForm(false);
  show('history');
});

// Ask Chrome to keep our data even when the phone is low on space.
async function askPersist() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch {}
}

// ---------- history ----------
function renderHistoryFilter() {
  const sel = $('histFilter');
  const cur = sel.value;
  const used = new Set(state.entries.map((e) => e.peptideId));
  const list = state.peptides.filter((p) => used.has(p.id)).sort(byName);
  sel.innerHTML = `<option value="">All peptides</option>` + list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  sel.value = list.some((p) => p.id === cur) ? cur : '';
}
function renderHistory() {
  renderHistoryFilter();
  const f = $('histFilter').value;
  const q = $('histSearch').value.trim().toLowerCase();
  const names = Object.fromEntries(state.peptides.map((p) => [p.id, p.name]));
  const list = state.entries
    .filter((e) => !f || e.peptideId === f)
    .filter((e) => !q || [e.notes, e.site, names[e.peptideId] || e.peptideName].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt) || (b.createdAt || '').localeCompare(a.createdAt || ''));

  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = list.filter((e) => new Date(e.takenAt) >= weekAgo).length;
  $('histStats').textContent = state.entries.length ? `${list.length} entr${list.length === 1 ? 'y' : 'ies'} · ${thisWeek} in the last 7 days` : '';

  if (!list.length) {
    $('histList').innerHTML = `<div class="empty">${state.entries.length ? 'No entries match.' : 'No doses logged yet.<br>Log one from the Log tab.'}</div>`;
    return;
  }
  let html = '', day = '';
  for (const e of list) {
    const k = dayKey(e.takenAt);
    if (k !== day) { day = k; html += `<div class="day-h">${esc(dayLabel(k))}</div>`; }
    html += `<button class="card" data-id="${esc(e.id)}">
      <div class="line1"><span>${esc(names[e.peptideId] || e.peptideName)}</span><span class="time">${esc(timeStr(e.takenAt))}</span></div>
      <div class="line2">${esc(entrySummary(e))}</div>
      ${e.notes ? `<div class="note">${esc(e.notes)}</div>` : ''}
    </button>`;
  }
  $('histList').innerHTML = html;
}
$('histList').addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) editEntry(c.dataset.id); });
$('histFilter').addEventListener('change', renderHistory);
$('histSearch').addEventListener('input', renderHistory);

// ---------- peptides ----------
function renderPeptides() {
  renderSchedList();
  const untracked = state.schedules.map((s) => state.peptides.find((p) => p.id === s.peptideId)).filter((p, i, a) => p && !p.supplement && !p.mixedAt && a.indexOf(p) === i);
  $('vialHint').hidden = !untracked.length;
  $('vialHint').textContent = `Tip: tap a peptide and set the date you mixed its vial to see how much is left. Not set yet: ${untracked.map((p) => p.name).join(', ')}.`;
  const showArch = $('showArchived').checked;
  const list = state.peptides.filter((p) => showArch || !p.archived).sort(byName);
  $('pepList').innerHTML = list.map((p) => {
    const count = state.entries.filter((e) => e.peptideId === p.id).length;
    const last = lastEntryFor(p.id);
    const meta = [vialText(p), p.bacMl > 0 ? `mixed with ${fmtNum(p.bacMl)} mL` : "", count ? `${count} dose${count === 1 ? '' : 's'} logged` : 'no doses yet', last ? `last ${ago(last.takenAt)}` : ''].filter(Boolean).join(' · ');
    return `<button class="card${p.archived ? ' archived' : ''}" data-id="${esc(p.id)}">
      <div class="line1"><span>${esc(p.name)}</span>${p.archived ? '<span class="time">archived</span>' : ''}</div>
      <div class="line2">${esc(meta)}</div>
      ${vialLine(p)}
      ${p.notes ? `<div class="note">${esc(p.notes)}</div>` : ''}
    </button>`;
  }).join('') || `<div class="empty">No peptides yet.</div>`;

  $('supplyList').innerHTML = state.supplies.sort(byName).map((s) =>
    `<button class="card" data-id="${esc(s.id)}"><div class="line1"><span>${esc(s.name)}</span></div>
     <div class="line2">${esc(`${fmtNum(s.amount)} ${s.unit} × ${s.count} vial${s.count === 1 ? '' : 's'}`)}</div></button>`
  ).join('');
}
$('pepList').addEventListener('click', (e) => {
  const c = e.target.closest('.card');
  if (c) openPeptideDialog(state.peptides.find((p) => p.id === c.dataset.id), () => renderPeptides());
});
$('addPeptideBtn').addEventListener('click', () => openPeptideDialog(null, () => renderPeptides()));
$('showArchived').addEventListener('change', renderPeptides);

let pepDone = null, pepEditing = null, pepNewInfo = null;
function openPeptideDialog(p, done) {
  pepEditing = p;
  pepNewInfo = null;
  pepDone = done;
  $('pepDialogTitle').textContent = p ? 'Edit peptide' : 'Add peptide';
  $('pName').value = p?.name || '';
  $('pAmount').value = fmtNum(p?.vialAmount);
  $('pUnit').value = p?.vialUnit || 'mg';
  $('pCount').value = p ? (p.vialCount ?? '') : 1;
  $('pBac').value = fmtNum(p?.bacMl);
  pMixedAt = p?.mixedAt || null;
  $('pMixed').value = pMixedAt ? dayKey(pMixedAt) : '';
  renderPepStrength();
  $('pNotes').value = p?.notes || '';
  $('pArchived').checked = !!p?.archived;
  $('pArchivedWrap').hidden = !p;
  $('pepDialog').returnValue = '';
  $('pepDialog').showModal();
}
$('pepDialog').addEventListener('close', async () => {
  if ($('pepDialog').returnValue !== 'save') return;
  const name = $('pName').value.trim();
  if (!name) return;
  const rec = await DB.put('peptides', {
    ...(pepEditing || { archived: false, ...(pepNewInfo ? { info: pepNewInfo } : {}) }),
    name,
    vialAmount: num($('pAmount').value),
    vialUnit: $('pUnit').value,
    vialCount: num($('pCount').value),
    bacMl: num($('pBac').value),
    mixedAt: pMixedAt,
    notes: $('pNotes').value.trim(),
    archived: pepEditing ? $('pArchived').checked : false
  });
  const i = state.peptides.findIndex((x) => x.id === rec.id);
  if (i >= 0) state.peptides[i] = rec; else state.peptides.push(rec);
  // keep old history entries showing the current name
  toast(pepEditing ? 'Peptide updated' : `Added ${rec.name}`);
  renderPeptideSelect();
  pepDone?.(rec);
});
function renderPepStrength() {
  const c = strengthOf(num($('pAmount').value), $('pUnit').value, num($('pBac').value));
  $('pStrength').textContent = c ? `Strength ${fmtNum(c)} mg/mL · 1 mg = ${fmtNum(round1(100 / c))} units` : '';
  const v = pepEditing && pMixedAt ? vialStatus({ ...pepEditing, vialAmount: num($('pAmount').value), vialUnit: $('pUnit').value, bacMl: num($('pBac').value), mixedAt: pMixedAt }) : null;
  $('pVialLeft').textContent = v ? vialSummary(v) : '';
}
// Mix date: typing a date counts doses from the start of that day; "New vial" counts from right now and takes one spare.
let pMixedAt = null;
$('pMixed').addEventListener('change', () => {
  const k = $('pMixed').value;
  pMixedAt = k ? new Date(`${k}T00:00`).toISOString() : null;
  renderPepStrength();
});
$('pNewVial').addEventListener('click', () => {
  pMixedAt = new Date().toISOString();
  $('pMixed').value = todayKey();
  const c = num($('pCount').value);
  if (c > 0) $('pCount').value = c - 1;
  renderPepStrength();
  toast(c > 0 ? 'New vial started, 1 spare used' : 'New vial started');
});
['pAmount', 'pUnit', 'pBac'].forEach((id) => $(id).addEventListener('input', renderPepStrength));
$('pepDialog').addEventListener('cancel', () => { $('pepDialog').returnValue = 'cancel'; });

let supEditing = null;
$('supplyList').addEventListener('click', (e) => {
  const c = e.target.closest('.card');
  if (!c) return;
  supEditing = state.supplies.find((s) => s.id === c.dataset.id);
  $('sName').value = supEditing.name;
  $('sAmount').value = fmtNum(supEditing.amount);
  $('sUnit').value = supEditing.unit;
  $('sCount').value = supEditing.count ?? '';
  $('supDialog').returnValue = '';
  $('supDialog').showModal();
});
$('supDialog').addEventListener('close', async () => {
  if ($('supDialog').returnValue !== 'save' || !supEditing) return;
  const rec = await DB.put('supplies', { ...supEditing, name: $('sName').value.trim() || supEditing.name, amount: num($('sAmount').value), unit: $('sUnit').value, count: num($('sCount').value) });
  state.supplies = state.supplies.map((s) => (s.id === rec.id ? rec : s));
  renderPeptides();
});

// ---------- settings ----------
$('settingsBtn').addEventListener('click', async () => {
  let persisted = 'unknown', usage = '';
  try {
    if (navigator.storage?.persisted) persisted = (await navigator.storage.persisted()) ? 'Protected' : 'Not yet protected (Chrome decides; installing the app helps)';
    if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); usage = `${(e.usage / 1024).toFixed(0)} KB used`; }
  } catch {}
  const installed = matchMedia('(display-mode: standalone)').matches;
  $('setBody').innerHTML = `
    <p>All your data is stored only on this phone, inside this app. Nothing is uploaded.</p>
    <p><strong>${state.entries.length}</strong> doses logged · <strong>${state.peptides.filter((p) => !p.supplement).length}</strong> peptides</p>
    <p>Storage: ${esc(persisted)}${usage ? ` · ${esc(usage)}` : ''}</p>
    <p>${installed ? 'Running as an installed app.' : 'Tip: install from Chrome’s menu (⋮ → Add to Home screen / Install app) so it opens like a normal app and works offline.'}</p>
    <p class="subtle">Clearing Chrome’s site data or uninstalling the app deletes your log, so save a backup file regularly and keep a copy on your computer.</p>
    <p style="color:var(--muted);font-size:13px">Version ${APP_VERSION}</p>`;
  const lb = await DB.getMeta('lastBackup');
  $('lastBackup').textContent = lb ? `Last backup: ${new Date(lb).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })} (${ago(lb)})` : 'No backup saved yet.';
  $('setDialog').showModal();
});

// ---------- import ----------
// File format: {"format":"peptide-log-import","version":1,"entries":[
//   {"peptide":"BPC-157","dose":250,"doseUnit":"mcg","volume":0.1,"volumeUnit":"mL",
//    "takenAt":"2026-09-01T08:00","site":"Abdomen L","notes":""}]}
// takenAt without a timezone is read as phone-local time. Unknown peptides are created.
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
let pendingImport = null;

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async () => {
  const file = $('importFile').files[0];
  $('importFile').value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('That file isn’t a backup or import file'); return; }
  if (data?.format === 'peptide-log-backup') { previewRestore(data); return; }
  const rows = Array.isArray(data) ? data : data?.entries;
  if (!Array.isArray(rows) || !rows.length) { toast('No entries found in that file'); return; }

  const byNorm = Object.fromEntries(state.peptides.map((p) => [normName(p.name), p]));
  const existing = new Set(state.entries.map((e) => `${e.peptideId}|${e.takenAt.slice(0, 16)}|${e.dose}`));
  const newPeps = new Map();
  const items = [];
  for (const r of rows) {
    const name = String(r.peptide || r.peptideName || '').trim();
    const when = new Date(r.takenAt);
    if (!name || isNaN(when)) { items.push({ bad: true, r }); continue; }
    const pep = byNorm[normName(name)];
    if (!pep && !newPeps.has(normName(name))) newPeps.set(normName(name), name);
    const e = {
      peptideName: pep ? pep.name : name,
      dose: num(r.dose), doseUnit: ['mcg', 'mg', 'IU'].includes(r.doseUnit) ? r.doseUnit : 'mcg',
      volume: num(r.volume), volumeUnit: r.volumeUnit === 'units' ? 'units' : 'mL',
      takenAt: when.toISOString(), site: String(r.site || '').trim(), notes: String(r.notes || '').trim()
    };
    const dup = pep && existing.has(`${pep.id}|${e.takenAt.slice(0, 16)}|${e.dose}`);
    items.push({ e, norm: normName(name), dup });
  }
  pendingImport = { items, newPeps };
  const good = items.filter((i) => !i.bad && !i.dup);
  const dups = items.filter((i) => i.dup).length;
  const bad = items.filter((i) => i.bad).length;
  const fmtWhen = (iso) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  $('impBody').innerHTML = `
    <p><strong>${good.length}</strong> new entr${good.length === 1 ? 'y' : 'ies'} to add.${dups ? ` ${dups} already in your log will be skipped.` : ''}${bad ? ` ${bad} couldn’t be read (missing peptide or date).` : ''}</p>
    ${newPeps.size ? `<p>New peptides that will be added: ${esc([...newPeps.values()].join(', '))}</p>` : ''}
    <div class="imp-list">${items.filter((i) => !i.bad).sort((a, b) => b.e.takenAt.localeCompare(a.e.takenAt)).map((i) =>
      `<div class="${i.dup ? 'dup' : ''}"><strong>${esc(i.e.peptideName)}</strong> · ${esc(fmtWhen(i.e.takenAt))}<br>${esc(entrySummary(i.e))}${i.e.notes ? ` · ${esc(i.e.notes)}` : ''}</div>`).join('')}</div>`;
  $('impConfirm').hidden = !good.length;
  $('impConfirm').textContent = 'Import';
  pendingRestore = null;
  $('setDialog').close();
  $('impDialog').returnValue = '';
  $('impDialog').showModal();
});

$('impDialog').addEventListener('close', async () => {
  if ($('impDialog').returnValue === 'import' && pendingRestore) return doRestore();
  pendingRestore = null;
  if ($('impDialog').returnValue !== 'import' || !pendingImport) return;
  const { items, newPeps } = pendingImport;
  pendingImport = null;
  const ids = Object.fromEntries(state.peptides.map((p) => [normName(p.name), p]));
  for (const [norm, name] of newPeps) {
    const p = await DB.put('peptides', { name, vialAmount: null, vialUnit: 'mg', vialCount: 0, notes: 'Added by import', archived: false });
    state.peptides.push(p);
    ids[norm] = p;
  }
  let n = 0;
  for (const i of items) {
    if (i.bad || i.dup) continue;
    const pep = ids[i.norm];
    const rec = await DB.put('entries', { ...i.e, peptideId: pep.id, peptideName: pep.name, status: 'taken', vialId: null, scheduleId: null, source: 'import' });
    state.entries.push(rec);
    n++;
  }
  askPersist();
  resetForm(true);
  toast(`Imported ${n} entr${n === 1 ? 'y' : 'ies'}`);
  show('history');
});

// ---------- info ----------
// Stored on each peptide as p.info = {about, dose, frequency, cycle, mixing, notes}.
const INFO_FIELDS = [['dose', 'My dose'], ['frequency', 'How often'], ['cycle', 'Cycle'], ['mixing', 'Mixing'], ['notes', 'Notes']];
let infoPep = null;

async function seedInfo() {
  if (await DB.getMeta('infoSeeded')) return;
  const seeds = Object.fromEntries(Object.entries(window.INFO_SEED || {}).map(([k, v]) => [normName(k), v]));
  for (const p of state.peptides) {
    const s = seeds[normName(p.name)];
    if (s && !p.info) {
      const rec = await DB.put('peptides', { ...p, info: { ...s } });
      Object.assign(p, rec);
    }
  }
  await DB.setMeta('infoSeeded', new Date().toISOString());
}

let infoSeg = 'mine', libCat = '';
const LIB_CATS = ['Healing', 'Weight', 'Growth hormone', 'Brain', 'Sleep', 'Longevity', 'Skin', 'Immune', 'Sexual health', 'Other'];
// Library names match loosely, so 'Retatrutide 20mg' finds 'Retatrutide'.
const libMatch = (pepName, libName) => normName(pepName).startsWith(normName(libName));
const libFor = (name) => (window.PEP_LIBRARY || []).find((l) => libMatch(name, l.name));
const ownsLib = (l) => state.peptides.some((p) => !p.archived && libMatch(p.name, l.name));
$('infoSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  infoSeg = b.dataset.seg;
  document.querySelectorAll('#infoSeg button').forEach((x) => x.classList.toggle('on', x === b));
  $('infoSearch').value = '';
  renderInfo();
});
$('libCats').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  libCat = libCat === b.dataset.cat ? '' : b.dataset.cat;
  renderInfo();
});
function renderInfo() {
  $('infoSearch').hidden = infoSeg === 'guides';
  $('infoSearch').placeholder = infoSeg === 'library' ? 'Search the library' : 'Search peptides';
  $('libCats').hidden = infoSeg !== 'library';
  if (infoSeg === 'library') return renderLibrary();
  if (infoSeg === 'guides') return renderGuides();
  const q = $('infoSearch').value.trim().toLowerCase();
  const list = activePeptides().filter((p) => !q || `${p.name} ${p.info?.about || ''}`.toLowerCase().includes(q));
  $('infoList').innerHTML = list.map((p) => {
    const sub = p.info?.about || 'No info yet. Tap to add some.';
    const proto = [p.info?.dose, p.info?.frequency].filter(Boolean).join(' · ');
    return `<button class="card" data-id="${esc(p.id)}">
      <div class="line1"><span>${esc(p.name)}</span></div>
      <div class="line2">${esc(sub)}</div>
      ${proto ? `<div class="note">${esc(proto)}</div>` : ''}
    </button>`;
  }).join('') || '<div class="empty">No peptides match.</div>';
}
$('infoSearch').addEventListener('input', renderInfo);
$('infoList').addEventListener('click', (e) => {
  const c = e.target.closest('.card');
  if (!c) return;
  if (c.dataset.lib != null) return openLib(window.PEP_LIBRARY[+c.dataset.lib]);
  if (c.dataset.guide != null) return openGuide(window.PEP_GUIDES[+c.dataset.guide]);
  openInfo(state.peptides.find((p) => p.id === c.dataset.id));
});

function renderLibrary() {
  const q = $('infoSearch').value.trim().toLowerCase();
  $('libCats').innerHTML = LIB_CATS.filter((c) => window.PEP_LIBRARY.some((l) => l.cat === c))
    .map((c) => `<button type="button" class="chip${libCat === c ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  const list = window.PEP_LIBRARY.map((l, i) => ({ l, i }))
    .filter(({ l }) => (!libCat || l.cat === libCat) && (!q || `${l.name} ${l.aka || ''} ${l.about} ${l.cat}`.toLowerCase().includes(q)))
    .sort((a, b) => a.l.name.localeCompare(b.l.name));
  $('infoList').innerHTML = list.map(({ l, i }) => `<button class="card" data-lib="${i}">
      <div class="line1"><span>${esc(l.name)}${ownsLib(l) ? '<span class="tag">Mine</span>' : ''}</span><span class="time">${esc(l.cat)}</span></div>
      <div class="line2">${esc(l.about)}</div>
    </button>`).join('') || '<div class="empty">Nothing matches.</div>';
}
function libRows(l) {
  return [['Also known as', l.aka], ['Status', l.status], ['How it’s taken', l.route], ['Watch for', l.watch]]
    .filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
}
let libOpen = null;
function openLib(l) {
  libOpen = l; infoPep = null;
  $('infoTitle').textContent = l.name;
  $('infoView').innerHTML = `<p class="info-about">${esc(l.about)}</p><dl class="info-grid">${libRows(l)}</dl>
    <p class="info-empty">General background, not medical advice. No dose amounts are given here.</p>`;
  setInfoEditing(false);
  $('infoEditBtn').hidden = true;
  $('infoAddBtn').hidden = ownsLib(l);
  $('infoDialog').returnValue = '';
  $('infoDialog').showModal();
}
$('infoAddBtn').addEventListener('click', () => {
  const l = libOpen; if (!l) return;
  $('infoDialog').close('close');
  openPeptideDialog({ name: l.name, vialAmount: null, vialUnit: 'mg', vialCount: 1, notes: '', archived: false, info: { about: l.about } }, () => renderInfo());
  pepEditing = null;
  pepNewInfo = { about: l.about };
  $('pepDialogTitle').textContent = 'Add peptide';
  $('pArchivedWrap').hidden = true;
});
function renderGuides() {
  $('infoList').innerHTML = window.PEP_GUIDES.map((g, i) => `<button class="card" data-guide="${i}">
      <div class="line1"><span>${g.icon} ${esc(g.title)}</span></div>
      <div class="line2">${esc(g.steps[0])}</div>
    </button>`).join('');
}
function openGuide(g) {
  libOpen = null; infoPep = null;
  $('infoTitle').textContent = `${g.icon} ${g.title}`;
  $('infoView').innerHTML = `<ol class="guide-steps">${g.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
  setInfoEditing(false);
  $('infoEditBtn').hidden = true;
  $('infoAddBtn').hidden = true;
  $('infoDialog').returnValue = '';
  $('infoDialog').showModal();
}

function openInfo(p) {
  infoPep = p;
  const i = p.info || {};
  $('infoTitle').textContent = p.name;
  const count = state.entries.filter((e) => e.peptideId === p.id).length;
  const last = lastEntryFor(p.id);
  const rows = INFO_FIELDS.filter(([k]) => i[k]).map(([k, label]) => `<div><dt>${label}</dt><dd>${esc(i[k])}</dd></div>`).join('');
  $('infoView').innerHTML = `
    ${i.about ? `<p class="info-about">${esc(i.about)}</p>` : '<p class="info-empty">No info yet. Tap Edit to add what it’s for and your protocol.</p>'}
    ${rows ? `<dl class="info-grid">${rows}</dl>` : ''}
    ${libFor(p.name) ? `<dl class="info-grid">${libRows(libFor(p.name))}</dl>` : ''}
    <p class="info-empty">${[vialText(p), count ? `${count} dose${count === 1 ? '' : 's'} logged` : 'No doses logged', last ? `last ${ago(last.takenAt)}` : ''].filter(Boolean).map(esc).join(' · ')}</p>`;
  $('iAbout').value = i.about || '';
  INFO_FIELDS.forEach(([k]) => { $('i' + k[0].toUpperCase() + k.slice(1)).value = i[k] || ''; });
  libOpen = null;
  setInfoEditing(false);
  $('infoAddBtn').hidden = true;
  $('infoDialog').returnValue = '';
  $('infoDialog').showModal();
}
function setInfoEditing(on) {
  $('infoView').hidden = on;
  $('infoEdit').hidden = !on;
  $('infoEditBtn').hidden = on;
  $('infoSave').hidden = !on;
  $('infoClose').textContent = on ? 'Cancel' : 'Close';
}
$('infoEditBtn').addEventListener('click', () => setInfoEditing(true));
$('infoDialog').addEventListener('close', async () => {
  if ($('infoDialog').returnValue !== 'save' || !infoPep) return;
  const info = { about: $('iAbout').value.trim() };
  INFO_FIELDS.forEach(([k]) => { info[k] = $('i' + k[0].toUpperCase() + k.slice(1)).value.trim(); });
  const rec = await DB.put('peptides', { ...infoPep, info });
  state.peptides = state.peptides.map((p) => (p.id === rec.id ? rec : p));
  toast('Info saved');
  renderInfo();
});

// ---------- backup, export, restore ----------
// Backup file: {format:'peptide-log-backup', version:1, exportedAt, appVersion, data:{peptides, supplies, entries, vials, schedules}}
const BACKUP_STORES = ['peptides', 'supplies', 'entries', 'vials', 'schedules', 'daily'];
let pendingRestore = null;
const stamp = () => toLocalInput(new Date()).replace('T', '_').replace(':', '-');

// Prefer the Android share sheet (Drive, email, Files) so the file can reach a computer; fall back to a download.
async function saveFile(name, text, type) {
  const blob = new Blob([text], { type });
  try {
    const file = new File([blob], name, { type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

async function doBackup() {
  const data = {};
  for (const s of BACKUP_STORES) data[s] = await DB.all(s);
  const text = JSON.stringify({ format: 'peptide-log-backup', version: 1, exportedAt: new Date().toISOString(), appVersion: APP_VERSION, data });
  if (await saveFile(`peptide-log-backup_${stamp()}.json`, text, 'application/json')) {
    state.lastBackup = new Date().toISOString();
    await DB.setMeta('lastBackup', state.lastBackup);
    $('lastBackup').textContent = 'Last backup: just now';
    renderAlerts();
    toast(`Backup saved (${data.entries.length} entries)`);
  }
}
$('backupBtn').addEventListener('click', doBackup);

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
$('csvBtn').addEventListener('click', async () => {
  const names = Object.fromEntries(state.peptides.map((p) => [p.id, p.name]));
  const rows = [...state.entries].sort((a, b) => a.takenAt.localeCompare(b.takenAt)).map((e) => {
    const d = new Date(e.takenAt);
    const local = toLocalInput(d);
    return [local.slice(0, 10), local.slice(11), names[e.peptideId] || e.peptideName, e.dose, e.dose == null ? '' : e.doseUnit, e.volume, e.volume == null ? '' : e.volumeUnit, e.site, e.notes];
  });
  const csv = [['Date', 'Time', 'Peptide', 'Dose', 'Dose unit', 'Volume', 'Volume unit', 'Site', 'Notes'], ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  if (await saveFile(`peptide-log_${stamp()}.csv`, '﻿' + csv, 'text/csv')) toast(`Exported ${rows.length} entries`);
});

function previewRestore(b) {
  if (!Array.isArray(b.data?.entries) || !Array.isArray(b.data?.peptides)) { toast('That backup file looks damaged'); return; }
  const d = remapBackup(b.data);
  const have = new Set(state.entries.map((e) => e.id));
  const newEntries = d.entries.filter((e) => !have.has(e.id)).length;
  const havePep = new Set(state.peptides.map((p) => p.id));
  const newPeps = d.peptides.filter((p) => !havePep.has(p.id)).length;
  pendingRestore = b;
  pendingImport = null;
  $('impBody').innerHTML = `
    <p>Backup from <strong>${esc(new Date(b.exportedAt).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}</strong> with ${d.entries.length} entries and ${d.peptides.length} peptides.</p>
    <p><strong>${newEntries}</strong> entries and <strong>${newPeps}</strong> peptides are not on this phone yet and will be added. Matching records are updated to the backup’s version. Nothing is deleted.</p>`;
  $('impConfirm').hidden = false;
  $('impConfirm').textContent = 'Restore';
  $('setDialog').close();
  $('impDialog').returnValue = '';
  $('impDialog').showModal();
}

// A fresh install seeds its own peptides with new ids, so match backup peptides to existing ones by name.
function remapBackup(d) {
  const byName = Object.fromEntries(state.peptides.map((p) => [normName(p.name), p.id]));
  const ids = new Set(state.peptides.map((p) => p.id));
  const map = {};
  for (const p of d.peptides) if (!ids.has(p.id) && byName[normName(p.name)]) map[p.id] = byName[normName(p.name)];
  const fix = (r) => (r && map[r.peptideId] ? { ...r, peptideId: map[r.peptideId] } : r);
  return {
    ...d,
    peptides: d.peptides.map((p) => (map[p.id] ? { ...p, id: map[p.id] } : p)),
    entries: (d.entries || []).map(fix), vials: (d.vials || []).map(fix), schedules: (d.schedules || []).map(fix)
  };
}

async function doRestore() {
  const d = remapBackup(pendingRestore.data);
  pendingRestore = null;
  for (const s of BACKUP_STORES) for (const rec of d[s] || []) if (rec?.id) await DB.putRaw(s, rec);
  await load();
  resetForm(true);
  $('impConfirm').textContent = 'Import';
  toast(`Restored ${d.entries.length} entries`);
  show('history');
}

// ---------- calculator ----------
function renderCalc() {
  const sel = $('cPeptide');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Type my own numbers</option>' +
    activePeptides().filter((p) => !p.supplement).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${mixText(p) ? ` (${esc(mixText(p))})` : ''}</option>`).join('');
  sel.value = activePeptides().some((p) => p.id === cur && !p.supplement) ? cur : '';
  calcResult();
}
$('cPeptide').addEventListener('change', () => {
  const p = state.peptides.find((x) => x.id === $('cPeptide').value);
  if (p) {
    $('cAmount').value = fmtNum(p.vialAmount);
    $('cAmountUnit').value = p.vialUnit === 'mcg' ? 'mcg' : 'mg';
    $('cBac').value = fmtNum(p.bacMl);
    const last = lastEntryFor(p.id);
    if (last?.dose != null && (last.doseUnit === 'mcg' || last.doseUnit === 'mg')) {
      $('cDose').value = fmtNum(last.dose);
      $('cDoseUnit').value = last.doseUnit;
    }
  }
  calcResult();
});
['cAmount', 'cAmountUnit', 'cBac', 'cDose', 'cDoseUnit'].forEach((id) => $(id).addEventListener('input', calcResult));

function calcResult() {
  const amount = num($('cAmount').value), bac = num($('cBac').value);
  const conc = strengthOf(amount, $('cAmountUnit').value, bac);
  const mg = toMg(num($('cDose').value), $('cDoseUnit').value);
  const p = state.peptides.find((x) => x.id === $('cPeptide').value);
  const out = $('calcOut');
  $('calcLog').hidden = !(p && conc && mg);
  $('calcSave').hidden = !(p && conc && (p.bacMl !== bac || p.vialAmount !== amount || (p.vialUnit || 'mg') !== $('cAmountUnit').value));
  if (!conc) { out.innerHTML = amount != null || bac != null ? '<div class="rest">Enter the peptide in the vial and the bac water you added.</div>' : ''; return; }
  const strength = `Strength ${fmtNum(conc)} mg/mL (${fmtNum(conc * 1000)} mcg/mL)`;
  if (mg == null) { out.innerHTML = `<div class="rest">${strength}. 10 units = ${fmtNum(conc / 10)} mg.</div>`; return; }
  const units = (mg / conc) * 100;
  const doses = Math.floor(toMg(amount, $('cAmountUnit').value) / mg);
  out.innerHTML = `<div class="big">${fmtNum(round1(units))} <small>units</small></div>
    <div class="rest">= ${fmtNum(+(units / 100).toFixed(3))} mL · ${strength} · about ${doses} dose${doses === 1 ? '' : 's'} per vial</div>
    ${units > 100 ? '<div class="warn">More than one full 1 mL syringe. Check the numbers.</div>' : units < 2 ? '<div class="warn">Very small amount, hard to measure accurately.</div>' : ''}`;
}
$('calcLog').addEventListener('click', () => {
  const pid = $('cPeptide').value;
  resetForm(false);
  renderPeptideSelect(pid);
  $('fDose').value = $('cDose').value;
  $('fDoseUnit').value = $('cDoseUnit').value;
  onPeptideChosen();
  show('log');
});
$('calcSave').addEventListener('click', async () => {
  const p = state.peptides.find((x) => x.id === $('cPeptide').value);
  if (!p) return;
  const rec = await DB.put('peptides', { ...p, vialAmount: num($('cAmount').value), vialUnit: $('cAmountUnit').value, bacMl: num($('cBac').value) });
  Object.assign(p, rec);
  toast(`Saved mix for ${p.name}`);
  renderCalc();
});

// ---------- vial tracker ----------
// What's left in the current vial = vial amount minus every dose logged since it was mixed.
// Uses mg when the vial size is in mg/mcg, otherwise mL of mixed liquid.
function usualDoseFor(p) {
  const s = state.schedules.find((x) => x.peptideId === p.id && x.dose != null);
  if (s) return { dose: s.dose, doseUnit: s.doseUnit };
  const e = lastEntryFor(p.id);
  return e ? { dose: e.dose, doseUnit: e.doseUnit, volume: e.volume, volumeUnit: e.volumeUnit } : null;
}
const volMl = (e) => (e.volume == null ? null : e.volumeUnit === 'units' ? e.volume / 100 : e.volume);
function vialStatus(p) {
  if (!p?.mixedAt) return null;
  const since = state.entries.filter((e) => e.peptideId === p.id && e.takenAt >= p.mixedAt);
  const conc = pepStrength(p);
  const totalMg = toMg(p.vialAmount, p.vialUnit);
  let total, used = 0, unit, per = null;
  if (totalMg) {
    total = totalMg; unit = 'mg';
    for (const e of since) { const mg = toMg(e.dose, e.doseUnit); used += mg != null ? mg : conc && volMl(e) != null ? volMl(e) * conc : 0; }
    const u = usualDoseFor(p); per = u ? toMg(u.dose, u.doseUnit) : null;
  } else {
    total = p.bacMl || (p.vialUnit === 'mL' ? p.vialAmount : null); unit = 'mL';
    if (!total) return null;
    for (const e of since) used += volMl(e) || 0;
    const u = usualDoseFor(p); per = u ? volMl(u) : null;
  }
  const left = Math.max(0, total - used);
  const ageDays = Math.floor((Date.now() - new Date(p.mixedAt)) / 864e5);
  const dosesLeft = per ? Math.floor(left / per + 1e-9) : null;
  return { total, left, unit, used, ageDays, dosesLeft, pct: left / total,
    empty: left <= total * 0.02, low: dosesLeft != null ? dosesLeft <= 3 : left / total <= 0.15, old: ageDays > 28 };
}
function vialSummary(v) {
  const parts = [`${fmtNum(+v.left.toFixed(2))} of ${fmtNum(v.total)} ${v.unit} left`];
  if (v.dosesLeft != null) parts.push(`about ${v.dosesLeft} dose${v.dosesLeft === 1 ? '' : 's'}`);
  parts.push(v.ageDays === 0 ? 'mixed today' : `mixed ${v.ageDays} day${v.ageDays === 1 ? '' : 's'} ago`);
  return parts.join(' · ');
}
function vialLine(p) {
  const v = vialStatus(p);
  if (!v) return '';
  const cls = v.empty ? ' empty' : v.low ? ' low' : '';
  return `<div class="line2">Current vial: ${esc(vialSummary(v))}${v.old ? ' · over 4 weeks' : ''}</div>
    <div class="vial-bar${cls}"><i style="width:${Math.round(v.pct * 100)}%"></i></div>`;
}
// Heads-up list on the Log screen: vials running low or empty, and vials mixed more than 4 weeks ago.
function renderAlerts() {
  const out = [];
  for (const p of activePeptides()) {
    const v = vialStatus(p);
    if (!v) continue;
    const spare = p.vialCount > 0 ? ` ${p.vialCount} spare.` : ' No spare vials.';
    if (v.empty) out.push({ p, bad: true, html: `<b>${esc(p.name)}</b> vial is probably empty.${esc(spare)}` });
    else if (v.low) out.push({ p, html: `<b>${esc(p.name)}</b> running low: ${v.dosesLeft != null ? `about ${v.dosesLeft} dose${v.dosesLeft === 1 ? '' : 's'}` : `${fmtNum(+v.left.toFixed(2))} ${v.unit}`} left.${esc(spare)}` });
    if (v.old && !v.empty) out.push({ p, html: `<b>${esc(p.name)}</b> was mixed ${v.ageDays} days ago. Most mixed vials are used within 4 weeks.` });
  }
  // Weekly backup nudge: shown until a backup is saved, then again after 7 days.
  if (state.entries.length) {
    const days = state.lastBackup ? Math.floor((Date.now() - new Date(state.lastBackup)) / 864e5) : null;
    if (days == null || days >= 7) {
      out.unshift({ backup: true, bad: days == null || days >= 14,
        html: days == null ? `<b>No backup yet.</b> Tap to save your ${state.entries.length} entries to a file (Drive, email or Files).`
          : `<b>Backup is ${days} days old.</b> Tap to save a fresh copy of your ${state.entries.length} entries.` });
    }
  }
  $('alerts').hidden = !out.length || !!state.editingId;
  $('alerts').innerHTML = out.map((a) => `<button type="button" class="alert${a.bad ? ' bad' : ''}" ${a.backup ? 'data-backup="1"' : `data-id="${esc(a.p.id)}"`}><span>${a.html}</span></button>`).join('');
}
$('alerts').addEventListener('click', (e) => {
  const b = e.target.closest('.alert');
  if (b?.dataset.backup) return doBackup();
  if (b) openPeptideDialog(state.peptides.find((p) => p.id === b.dataset.id), () => { renderAlerts(); });
});

// ---------- daily check-in ----------
const FACES = ['😫', '🙁', '😐', '🙂', '😄'];
const CI_KEYS = [['sleep', 'Sleep'], ['energy', 'Energy'], ['mood', 'Mood']];
let ciOpen = null;
const dailyFor = (k) => state.daily.find((d) => d.id === k);
function renderCheckin() {
  const d = dailyFor(todayKey()) || {};
  const filled = CI_KEYS.some(([k]) => d[k]) || d.weight != null;
  if (ciOpen == null) ciOpen = !filled;
  $('ciBody').hidden = !ciOpen;
  $('checkin').hidden = !!state.editingId;
  const sum = [...CI_KEYS.filter(([k]) => d[k]).map(([k, l]) => `${l} ${FACES[d[k] - 1]}`), d.weight != null ? `${fmtNum(d.weight)} ${d.weightUnit || 'kg'}` : ''].filter(Boolean).join(' · ');
  $('ciSub').textContent = ciOpen ? (filled ? 'Saved' : 'Tap to rate') : sum || 'Tap to fill in';
  document.querySelectorAll('#ciBody .scale').forEach((el) => {
    el.innerHTML = FACES.map((f, i) => `<button type="button" data-v="${i + 1}" class="${d[el.dataset.k] === i + 1 ? 'on' : ''}" aria-label="${i + 1} of 5">${f}</button>`).join('');
  });
  if (document.activeElement?.closest?.('#ciBody') == null) {
    $('ciSide').value = d.side || '';
    $('ciWeight').value = fmtNum(d.weight);
    $('ciWaist').value = fmtNum(d.waist);
  }
  $('ciWeightUnit').value = d.weightUnit || state.weightUnit || 'kg';
}
async function saveCheckin(patch) {
  const k = todayKey();
  const rec = await DB.put('daily', { ...(dailyFor(k) || { id: k, date: k }), ...patch });
  state.daily = state.daily.filter((d) => d.id !== k).concat(rec);
  renderCheckin();
}
$('ciHead').addEventListener('click', () => { ciOpen = !ciOpen; renderCheckin(); });
$('ciBody').addEventListener('click', (e) => {
  const b = e.target.closest('.scale button'); if (!b) return;
  const k = b.parentElement.dataset.k, v = +b.dataset.v;
  saveCheckin({ [k]: dailyFor(todayKey())?.[k] === v ? null : v });
});
$('ciSide').addEventListener('change', () => saveCheckin({ side: $('ciSide').value.trim() }));
$('ciWeight').addEventListener('change', () => saveCheckin({ weight: num($('ciWeight').value), weightUnit: $('ciWeightUnit').value }));
$('ciWaist').addEventListener('change', () => saveCheckin({ waist: num($('ciWaist').value) }));
$('ciWeightUnit').addEventListener('change', async () => {
  state.weightUnit = $('ciWeightUnit').value;
  await DB.setMeta('weightUnit', state.weightUnit);
  if (num($('ciWeight').value) != null) saveCheckin({ weightUnit: state.weightUnit });
});

// ---------- history: list / calendar / progress ----------
let histSeg = 'list', calMonth = null, calSel = null, progDays = 90;
$('histSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  histSeg = b.dataset.seg;
  document.querySelectorAll('#histSeg button').forEach((x) => x.classList.toggle('on', x === b));
  renderHistTab();
});
function renderHistTab() {
  $('histMain').hidden = histSeg !== 'list';
  $('histCal').hidden = histSeg !== 'calendar';
  $('histProg').hidden = histSeg !== 'progress';
  if (histSeg === 'list') renderHistory();
  if (histSeg === 'calendar') renderCalendar();
  if (histSeg === 'progress') renderProgress();
}

function renderCalendar() {
  const tk = todayKey();
  if (!calMonth) calMonth = tk.slice(0, 7);
  if (!calSel) calSel = tk;
  const [Y, M] = calMonth.split('-').map(Number);
  $('calTitle').textContent = new Date(Y, M - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const counts = {};
  for (const e of state.entries) { const k = dayKey(e.takenAt); counts[k] = (counts[k] || 0) + 1; }
  const first = `${calMonth}-01`, lead = (weekday(first) + 6) % 7; // weeks start Monday
  const days = new Date(Y, M, 0).getDate();
  let html = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-dow">${d[0]}</div>`).join('');
  for (let i = 0; i < lead; i++) html += '<div class="cal-cell out"></div>';
  for (let d = 1; d <= days; d++) {
    const k = `${calMonth}-${String(d).padStart(2, '0')}`, ci = dailyFor(k);
    html += `<button type="button" class="cal-cell${k === tk ? ' today' : ''}${k === calSel ? ' sel' : ''}" data-k="${k}" aria-label="${k}, ${counts[k] || 0} doses">
      <span>${d}</span>${counts[k] ? `<span class="n">${counts[k]}</span>` : ''}${ci?.mood ? `<span class="f">${FACES[ci.mood - 1]}</span>` : ''}</button>`;
  }
  $('calGrid').innerHTML = html;
  const list = state.entries.filter((e) => dayKey(e.takenAt) === calSel).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const names = Object.fromEntries(state.peptides.map((p) => [p.id, p.name]));
  const ci = dailyFor(calSel);
  const ciText = ci ? [...CI_KEYS.filter(([k]) => ci[k]).map(([k, l]) => `${l} ${FACES[ci[k] - 1]}`), ci.weight != null ? `${fmtNum(ci.weight)} ${ci.weightUnit || 'kg'}` : '', ci.waist != null ? `waist ${fmtNum(ci.waist)} cm` : '', ci.side ? `side effects: ${ci.side}` : ''].filter(Boolean).join(' · ') : '';
  $('calDay').innerHTML = `<div class="day-h">${esc(dayLabel(calSel))}</div>` + (ciText ? `<p class="subtle-p">${esc(ciText)}</p>` : '') +
    (list.map((e) => `<button class="card" data-id="${esc(e.id)}">
      <div class="line1"><span>${esc(names[e.peptideId] || e.peptideName)}</span><span class="time">${esc(timeStr(e.takenAt))}</span></div>
      <div class="line2">${esc(entrySummary(e))}</div></button>`).join('') || '<p class="subtle-p">No doses logged.</p>');
}
$('calGrid').addEventListener('click', (e) => { const c = e.target.closest('.cal-cell[data-k]'); if (c) { calSel = c.dataset.k; renderCalendar(); } });
$('calDay').addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) editEntry(c.dataset.id); });
function shiftMonth(n) {
  const [Y, M] = calMonth.split('-').map(Number);
  const d = new Date(Y, M - 1 + n, 1);
  calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderCalendar();
}
$('calPrev').addEventListener('click', () => shiftMonth(-1));
$('calNext').addEventListener('click', () => shiftMonth(1));

// Progress charts: simple inline SVG, one y-axis each, tap or drag to read values.
const CHART_W = 340, CHART_H = 170, PAD = { l: 34, r: 12, t: 10, b: 22 };
function lineChart({ series, yMin, yMax, yTicks, xMin, xMax, ticks = [], fmtY = fmtNum }) {
  const x = (k) => PAD.l + (daysBetween(xMin, k) / Math.max(1, daysBetween(xMin, xMax))) * (CHART_W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (CHART_H - PAD.t - PAD.b);
  const xLabels = [xMin, addDays(xMin, Math.round(daysBetween(xMin, xMax) / 2)), xMax];
  const short = (k) => new Date(keyToUTC(k)).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' });
  let svg = `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" role="img"><g class="grid">${yTicks.map((t) => `<line x1="${PAD.l}" x2="${CHART_W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>
    <g class="axis">${yTicks.map((t) => `<text x="${PAD.l - 6}" y="${y(t) + 3}" text-anchor="end">${esc(fmtY(t))}</text>`).join('')}
    ${xLabels.map((k, i) => `<text x="${x(k)}" y="${CHART_H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${esc(short(k))}</text>`).join('')}</g>`;
  for (const t of ticks) svg += `<path d="M${x(t)} ${CHART_H - PAD.b} l-4 6 h8 z" fill="var(--muted)" opacity=".6"/>`;
  for (const s of series) {
    const pts = s.points.filter((p) => p.k >= xMin && p.k <= xMax);
    if (!pts.length) continue;
    svg += `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.k).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (pts.length <= 40) svg += pts.map((p) => `<circle cx="${x(p.k)}" cy="${y(p.v)}" r="3.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`).join('');
  }
  svg += `<line class="xhair" x1="0" x2="0" y1="${PAD.t}" y2="${CHART_H - PAD.b}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/></svg>`;
  return { svg, x, y };
}
function attachHover(el, xMin, xMax, keys, describe) {
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), hair = svg.querySelector('.xhair');
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * CHART_W;
    const span = Math.max(1, daysBetween(xMin, xMax));
    const k = addDays(xMin, Math.round(((px - PAD.l) / (CHART_W - PAD.l - PAD.r)) * span));
    const near = keys.reduce((b, c) => (Math.abs(daysBetween(c, k)) < Math.abs(daysBetween(b, k)) ? c : b), keys[0]);
    if (!near) return;
    const cx = PAD.l + (daysBetween(xMin, near) / span) * (CHART_W - PAD.l - PAD.r);
    hair.setAttribute('x1', cx); hair.setAttribute('x2', cx); hair.setAttribute('visibility', 'visible');
    tip.innerHTML = describe(near);
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max((cx / CHART_W) * r.width + svg.offsetLeft, 70), el.clientWidth - 70)}px`;
    tip.style.top = `${svg.offsetTop + 20}px`;
  };
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; hair.setAttribute('visibility', 'hidden'); });
}
function niceTicks(lo, hi, n = 4) {
  const step0 = (hi - lo) / n || 1, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const out = [];
  for (let t = Math.floor(lo / step) * step; t <= hi + step / 2; t += step) out.push(+t.toFixed(6));
  return out;
}
function renderProgress() {
  const tk = todayKey();
  const ranges = [[30, '30 days'], [90, '90 days'], [365, 'Year']];
  $('progRange').innerHTML = ranges.map(([d, l]) => `<button type="button" class="chip${progDays === d ? ' on' : ''}" data-d="${d}">${l}</button>`).join('');
  const xMin = addDays(tk, -progDays + 1), xMax = tk;
  const days = state.daily.filter((d) => d.id >= xMin && d.id <= xMax).sort((a, b) => a.id.localeCompare(b.id));
  const unit = state.weightUnit || 'kg';
  const toUnit = (d) => (d.weightUnit || 'kg') === unit ? d.weight : unit === 'kg' ? d.weight * 0.453592 : d.weight / 0.453592;
  const wpts = days.filter((d) => d.weight != null).map((d) => ({ k: d.id, v: +toUnit(d).toFixed(1) }));
  const reta = state.peptides.filter((p) => /retatrutide|semaglutide|tirzepatide|cagrilintide/i.test(p.name)).map((p) => p.id);
  const doseKeys = [...new Set(state.entries.filter((e) => reta.includes(e.peptideId)).map((e) => dayKey(e.takenAt)).filter((k) => k >= xMin))];
  let html = '';
  // weight
  html += `<div class="chart" id="chWeight"><h3>Weight</h3>`;
  if (wpts.length) {
    const vs = wpts.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs), padv = Math.max(0.5, (hi - lo) * 0.15);
    const yTicks = niceTicks(lo - padv, hi + padv);
    const chg = wpts.length > 1 ? +(wpts.at(-1).v - wpts[0].v).toFixed(1) : null;
    html += `<div class="sub">${fmtNum(wpts.at(-1).v)} ${unit} now${chg != null ? ` · ${chg > 0 ? '+' : ''}${fmtNum(chg)} ${unit} over this period` : ''}</div>`;
    html += lineChart({ series: [{ points: wpts, color: 'var(--accent)' }], yMin: yTicks[0], yMax: yTicks.at(-1), yTicks, xMin, xMax, ticks: doseKeys }).svg;
    if (doseKeys.length) html += `<div class="legend"><span>▲ GLP-1 / Reta dose days</span></div>`;
  } else html += `<div class="empty">Add your weight in the daily check-in on the Log screen to see it here.</div>`;
  html += `<div class="tip" hidden></div></div>`;
  // how I feel
  const colors = { sleep: 'var(--s1)', energy: 'var(--s2)', mood: 'var(--s3)' };
  const fser = CI_KEYS.map(([k, l]) => ({ k, l, color: colors[k], points: days.filter((d) => d[k]).map((d) => ({ k: d.id, v: d[k] })) }));
  html += `<div class="chart" id="chFeel"><h3>How I feel</h3>`;
  if (fser.some((s) => s.points.length)) {
    html += `<div class="legend">${fser.map((s) => `<span><i style="background:${s.color}"></i>${s.l}</span>`).join('')}</div>`;
    html += lineChart({ series: fser, yMin: 1, yMax: 5, yTicks: [1, 2, 3, 4, 5], xMin, xMax, fmtY: (t) => FACES[t - 1] }).svg;
  } else html += `<div class="empty">Rate sleep, energy and mood in the daily check-in to see trends here.</div>`;
  html += `<div class="tip" hidden></div></div>`;
  // table view
  const recent = days.slice().reverse().slice(0, 14);
  if (recent.length) {
    html += `<h2 class="section-h">Recent check-ins</h2><table class="prog-table"><tr><th>Date</th><th>Sleep</th><th>Energy</th><th>Mood</th><th>Weight</th></tr>` +
      recent.map((d) => `<tr><td>${esc(fmtDay(d.id))}</td>${CI_KEYS.map(([k]) => `<td>${d[k] ? FACES[d[k] - 1] : ''}</td>`).join('')}<td>${d.weight != null ? esc(`${fmtNum(d.weight)} ${d.weightUnit || 'kg'}`) : ''}</td></tr>`).join('') + '</table>';
  }
  $('progBody').innerHTML = html;
  if (wpts.length) attachHover($('chWeight'), xMin, xMax, wpts.map((p) => p.k), (k) => `${esc(fmtDay(k))}: ${fmtNum(wpts.find((p) => p.k === k).v)} ${unit}${doseKeys.includes(k) ? ' · dose day' : ''}`);
  const fkeys = [...new Set(fser.flatMap((s) => s.points.map((p) => p.k)))].sort();
  if (fkeys.length) attachHover($('chFeel'), xMin, xMax, fkeys, (k) => `${esc(fmtDay(k))}: ` + CI_KEYS.map(([kk, l]) => { const d = dailyFor(k); return d?.[kk] ? `${l} ${FACES[d[kk] - 1]}` : ''; }).filter(Boolean).join(' · '));
}
$('progRange').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) { progDays = +b.dataset.d; renderProgress(); } });

// ---------- schedule ----------
// {id, peptideId, dose, doseUnit, time:'HH:MM', repeat:'daily'|'every'|'weekly'|'once', every, days:[0-6],
//  start:'YYYY-MM-DD', cycleOn, cycleOff, active}. Cycles count from start: cycleOn days on, then cycleOff days off.
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const keyToUTC = (k) => { const [Y, M, D] = k.split('-').map(Number); return Date.UTC(Y, M - 1, D); };
const daysBetween = (a, b) => Math.round((keyToUTC(b) - keyToUTC(a)) / 86400000);
const addDays = (k, n) => new Date(keyToUTC(k) + n * 86400000).toISOString().slice(0, 10);
const todayKey = () => toLocalInput(new Date()).slice(0, 10);
const weekday = (k) => new Date(keyToUTC(k)).getUTCDay();
function fmtTime(hm) { const [h, m] = hm.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
const fmtDayIn = (k) => { const t = fmtDay(k); return t === 'Today' || t === 'Tomorrow' ? t.toLowerCase() : t; };
function fmtDay(k) {
  const d = daysBetween(todayKey(), k);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return new Date(keyToUTC(k)).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function cyclePhase(s, k) {
  if (!(s.cycleOn > 0)) return null;
  const len = s.cycleOn + (s.cycleOff || 0);
  const d = ((daysBetween(s.start, k) % len) + len) % len;
  return d < s.cycleOn ? { on: true, day: d + 1, left: s.cycleOn - d } : { on: false, day: d - s.cycleOn + 1, left: len - d };
}
function occursOn(s, k) {
  if (s.active === false || k < s.start) return false;
  const ph = cyclePhase(s, k);
  if (ph && !ph.on) return false;
  const d = daysBetween(s.start, k);
  if (s.repeat === 'once') return d === 0;
  if (s.repeat === 'every') return d % Math.max(1, s.every || 1) === 0;
  if (s.repeat === 'weekly') return (s.days || []).includes(weekday(k));
  return true;
}
function nextOccurrence(s, fromKey, maxDays = 120) {
  for (let i = 0; i <= maxDays; i++) { const k = addDays(fromKey, i); if (occursOn(s, k)) return k; }
  return null;
}
function repeatText(s) {
  let t = s.repeat === 'once' ? `Once on ${fmtDayIn(s.start)}` : s.repeat === 'every' ? `Every ${s.every} days` :
    s.repeat === 'weekly' ? (s.days || []).slice().sort().map((d) => DAY_NAMES[d]).join(', ') || 'No days picked' : 'Every day';
  if (s.cycleOn > 0) t += ` · ${s.cycleOn} days on, ${s.cycleOff || 0} off`;
  return t;
}
// Units to draw for a dose, from the peptide's mix, or else the volume last used for that same dose.
function plannedVolume(p, dose, doseUnit) {
  const conc = pepStrength(p), mg = toMg(dose, doseUnit);
  if (conc && mg != null) return { volume: round1((mg / conc) * 100), volumeUnit: 'units' };
  const prev = state.entries.filter((e) => e.peptideId === p?.id && e.volume != null && e.dose === dose && e.doseUnit === doseUnit)
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
  return prev ? { volume: prev.volume, volumeUnit: prev.volumeUnit } : { volume: null, volumeUnit: 'mL' };
}
function doseText(s, p) {
  const v = plannedVolume(p, s.dose, s.doseUnit);
  return [s.dose != null ? `${fmtNum(s.dose)} ${s.doseUnit}` : '', v.volume != null ? `${fmtNum(v.volume)} ${v.volumeUnit}` : ''].filter(Boolean).join(' · ');
}

// Today's checklist: each scheduled dose is done if an entry today is linked to it, or is an unlinked dose of the same peptide.
function todayItems() {
  const k = todayKey();
  const items = state.schedules.filter((s) => occursOn(s, k) && state.peptides.some((p) => p.id === s.peptideId))
    .sort((a, b) => a.time.localeCompare(b.time)).map((s) => ({ s, entry: null }));
  const todays = state.entries.filter((e) => dayKey(e.takenAt) === k);
  const used = new Set();
  for (const it of items) it.entry = todays.find((e) => !used.has(e.id) && e.scheduleId === it.s.id) || null, it.entry && used.add(it.entry.id);
  for (const it of items) if (!it.entry) { it.entry = todays.find((e) => !used.has(e.id) && !e.scheduleId && e.peptideId === it.s.peptideId) || null; it.entry && used.add(it.entry.id); }
  return items;
}
function renderToday() {
  const box = $('today');
  if (state.editingId) { box.hidden = true; return; }
  box.hidden = false;
  if (!state.schedules.length) {
    $('todaySub').textContent = '';
    $('todayList').innerHTML = `<div class="today-empty">Add your usual doses to a schedule, then tick them off here with one tap.<br><button type="button" class="btn ghost small" id="todaySetup">Set up schedule</button></div>`;
    $('todayNext').textContent = '';
    $('todaySetup').onclick = () => show('peptides');
    return;
  }
  const items = todayItems();
  const done = items.filter((i) => i.entry).length;
  $('todaySub').textContent = items.length ? `${done} of ${items.length} done` : 'Nothing scheduled';
  $('todayList').innerHTML = items.map(({ s, entry }) => {
    const p = state.peptides.find((x) => x.id === s.peptideId);
    return `<button type="button" class="qrow${entry ? ' done' : ''}" data-sid="${esc(s.id)}" data-eid="${esc(entry?.id || '')}">
      <span class="qbox">${entry ? '✓' : ''}</span>
      <span class="qtext"><span class="qname">${esc(p.name)}</span><br><span class="qdose">${esc(doseText(s, p))}</span></span>
      <span class="qtime">${entry ? esc(timeStr(entry.takenAt)) : esc(fmtTime(s.time))}</span>
    </button>`;
  }).join('');
  // next few doses after today
  const up = [];
  for (const s of state.schedules) {
    const k = nextOccurrence(s, addDays(todayKey(), 1), 30);
    const p = state.peptides.find((x) => x.id === s.peptideId);
    if (k && p) up.push({ k, s, p });
  }
  up.sort((a, b) => (a.k + a.s.time).localeCompare(b.k + b.s.time));
  const soon = up.filter((u) => daysBetween(todayKey(), u.k) <= 2).slice(0, 4);
  $('todayNext').textContent = soon.length ? 'Next: ' + soon.map((u) => `${u.p.name} ${fmtDayIn(u.k)} ${fmtTime(u.s.time)}`).join(' · ') : '';
}
// Long-press a ticked dose to edit it (a plain tap unticks it).
let lpTimer = null, lpFired = false;
$('todayList').addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.qrow');
  lpFired = false;
  clearTimeout(lpTimer);
  if (!row || !row.dataset.eid) return;
  lpTimer = setTimeout(() => { lpFired = true; editEntry(row.dataset.eid); }, 600);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => $('todayList').addEventListener(t, () => clearTimeout(lpTimer)));
$('todayList').addEventListener('contextmenu', (e) => { if (e.target.closest('.qrow')) e.preventDefault(); });
$('todayList').addEventListener('click', async (e) => {
  const row = e.target.closest('.qrow');
  if (!row) return;
  if (lpFired) { lpFired = false; return; }
  if (row.dataset.eid) {
    const old = state.entries.find((x) => x.id === row.dataset.eid);
    if (!old) return;
    // Entries with your own notes (e.g. weight) open for editing instead of being removed.
    if (old.notes) return editEntry(old.id);
    await DB.del('entries', old.id);
    state.entries = state.entries.filter((x) => x.id !== old.id);
    renderToday(); renderLastHint(); renderAlerts();
    toast(`Unticked ${old.peptideName}`, async () => {
      await DB.putRaw('entries', old);
      state.entries.push(old);
      renderToday(); renderLastHint(); renderAlerts();
    });
    return;
  }
  const s = state.schedules.find((x) => x.id === row.dataset.sid);
  const p = state.peptides.find((x) => x.id === s?.peptideId);
  if (!p) return;
  const rec = await DB.put('entries', {
    peptideId: p.id, peptideName: p.name,
    dose: s.dose, doseUnit: s.doseUnit, ...plannedVolume(p, s.dose, s.doseUnit),
    takenAt: new Date().toISOString(), site: '', notes: '', status: 'taken', vialId: null, scheduleId: s.id
  });
  state.entries.push(rec);
  renderToday(); renderLastHint(); renderAlerts();
  askPersist();
  toast(`Logged ${p.name}`, async () => {
    await DB.del('entries', rec.id);
    state.entries = state.entries.filter((x) => x.id !== rec.id);
    renderToday(); renderLastHint();
  });
});

function renderSchedList() {
  const list = state.schedules.map((s) => ({ s, p: state.peptides.find((x) => x.id === s.peptideId) })).filter((x) => x.p)
    .sort((a, b) => a.s.time.localeCompare(b.s.time) || a.p.name.localeCompare(b.p.name));
  $('schedList').innerHTML = list.map(({ s, p }) => {
    const ph = cyclePhase(s, todayKey());
    const next = nextOccurrence(s, todayKey());
    const status = todayKey() < s.start ? `starts ${fmtDayIn(s.start)}` : ph ? (ph.on ? `day ${ph.day} of ${s.cycleOn}` : `break, back ${fmtDayIn(addDays(todayKey(), ph.left))}`) : '';
    const nextT = next ? `next ${fmtDayIn(next)}` : 'nothing coming up';
    return `<button class="card" data-id="${esc(s.id)}">
      <div class="line1"><span>${esc(p.name)}</span><span class="time">${esc(fmtTime(s.time))}</span></div>
      <div class="line2">${esc([doseText(s, p), repeatText(s)].filter(Boolean).join(' · '))}</div>
      <div class="line2">${esc([status, nextT].filter(Boolean).join(' · '))}</div>
    </button>`;
  }).join('') || '<div class="subtle-p">Nothing scheduled yet.</div>';
}
$('schedList').addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) openSched(state.schedules.find((s) => s.id === c.dataset.id)); });
$('addSchedBtn').addEventListener('click', () => openSched(null));

let schedEditing = null, kDays = [];
function openSched(s) {
  schedEditing = s;
  $('schedTitle').textContent = s ? 'Edit schedule' : 'Add to schedule';
  $('kPep').innerHTML = activePeptides().map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('kPep').value = s?.peptideId || activePeptides()[0]?.id || '';
  const last = !s && lastEntryFor($('kPep').value);
  $('kDose').value = fmtNum(s ? s.dose : last?.dose);
  $('kDoseUnit').value = (s ? s.doseUnit : last?.doseUnit) || 'mcg';
  $('kTime').value = s?.time || '08:00';
  $('kRepeat').value = s?.repeat || 'daily';
  $('kEvery').value = s?.every || 2;
  kDays = s?.days ? [...s.days] : [];
  $('kStart').value = s?.start || todayKey();
  $('kCycle').checked = s?.cycleOn > 0;
  $('kOn').value = s?.cycleOn || 28;
  $('kOff').value = s?.cycleOff ?? 28;
  $('kDelete').hidden = !s;
  $('kDelete').textContent = 'Delete';
  $('schedDialog').returnValue = '';
  schedForm();
  $('schedDialog').showModal();
}
function schedForm() {
  const r = $('kRepeat').value;
  $('kEveryWrap').hidden = r !== 'every';
  $('kDaysWrap').hidden = r !== 'weekly';
  $('kCycleWrap').hidden = r === 'once';
  $('kCycleRow').hidden = r === 'once' || !$('kCycle').checked;
  $('kStartLabel').textContent = r === 'once' ? 'Date' : $('kCycle').checked ? 'First day of the cycle' : 'Starting';
  $('kDays').innerHTML = DAY_NAMES.map((d, i) => `<button type="button" class="chip${kDays.includes(i) ? ' on' : ''}" data-d="${i}">${d}</button>`).join('');
  const p = state.peptides.find((x) => x.id === $('kPep').value);
  const v = plannedVolume(p, num($('kDose').value), $('kDoseUnit').value);
  $('kUnits').textContent = v.volume != null && num($('kDose').value) != null ? `Draw ${fmtNum(v.volume)} ${v.volumeUnit}` : '';
}
['kPep', 'kDose', 'kDoseUnit', 'kRepeat', 'kCycle'].forEach((id) => $(id).addEventListener('input', schedForm));
$('kDays').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  const d = +b.dataset.d;
  kDays = kDays.includes(d) ? kDays.filter((x) => x !== d) : [...kDays, d];
  schedForm();
});
function schedFromForm() {
  const r = $('kRepeat').value, cyc = r !== 'once' && $('kCycle').checked;
  return {
    ...(schedEditing || { active: true }),
    peptideId: $('kPep').value,
    dose: num($('kDose').value), doseUnit: $('kDoseUnit').value,
    time: $('kTime').value || '08:00', repeat: r,
    every: Math.max(2, Math.round(num($('kEvery').value) || 2)), days: [...kDays],
    start: $('kStart').value || todayKey(),
    cycleOn: cyc ? Math.max(1, Math.round(num($('kOn').value) || 0)) : null,
    cycleOff: cyc ? Math.max(0, Math.round(num($('kOff').value) || 0)) : null
  };
}
$('schedDialog').addEventListener('close', async () => {
  if ($('schedDialog').returnValue !== 'save') return;
  const rec = await DB.put('schedules', schedFromForm());
  const i = state.schedules.findIndex((x) => x.id === rec.id);
  if (i >= 0) state.schedules[i] = rec; else state.schedules.push(rec);
  toast(schedEditing ? 'Schedule updated' : 'Added to schedule');
  renderSchedList(); renderToday();
});
$('schedDialog').addEventListener('cancel', () => { $('schedDialog').returnValue = 'cancel'; });
$('kDelete').addEventListener('click', async () => {
  const b = $('kDelete');
  if (b.textContent === 'Delete') { b.textContent = 'Tap again to delete'; return; }
  await DB.del('schedules', schedEditing.id);
  state.schedules = state.schedules.filter((x) => x.id !== schedEditing.id);
  $('schedDialog').close('deleted');
  toast('Removed from schedule');
  renderSchedList(); renderToday();
});

// Calendar reminders: the phone's calendar alerts at dose time even with the app closed.
function calRule(s) {
  if (s.repeat === 'once') return '';
  if (s.repeat === 'every') return `FREQ=DAILY;INTERVAL=${s.every}`;
  if (s.repeat === 'weekly') return `FREQ=WEEKLY;BYDAY=${(s.days || []).map((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d]).join(',')}`;
  return 'FREQ=DAILY';
}
// A cycle becomes one calendar series per "on" block for the next year.
function calBlocks(s) {
  if (!(s.cycleOn > 0)) return [{ start: s.start, until: null }];
  const len = s.cycleOn + (s.cycleOff || 0), out = [];
  const k0 = todayKey() > s.start ? todayKey() : s.start;
  let b = addDays(s.start, Math.floor(daysBetween(s.start, k0) / len) * len);
  for (; out.length < Math.ceil(365 / len); b = addDays(b, len)) {
    const end = addDays(b, s.cycleOn - 1);
    if (end < k0) continue;
    const first = nextOccurrence({ ...s, cycleOn: null, start: s.start }, b > k0 ? b : k0, s.cycleOn);
    if (first && first <= end) out.push({ start: first, until: end });
  }
  return out;
}
const calStamp = (k, hm) => k.replace(/-/g, '') + 'T' + hm.replace(':', '') + '00';
function calTitle(s) { const p = state.peptides.find((x) => x.id === s.peptideId); return `${p?.name || 'Dose'} ${doseText(s, p)}`.trim(); }
$('kGcal').addEventListener('click', () => {
  const s = schedFromForm(), b = calBlocks(s)[0];
  if (!b) return toast('Nothing to add yet');
  const end = new Date(2000, 0, 1, ...s.time.split(':').map(Number)); end.setMinutes(end.getMinutes() + 10);
  let rule = calRule(s);
  if (rule && b.until) rule += `;UNTIL=${b.until.replace(/-/g, '')}T235959`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: calTitle(s), details: 'From Peptide Log',
    dates: `${calStamp(b.start, s.time)}/${calStamp(b.start, toLocalInput(end).slice(11))}` });
  if (rule) q.set('recur', 'RRULE:' + rule);
  window.open('https://calendar.google.com/calendar/render?' + q.toString(), '_blank');
  if (s.cycleOn > 0) toast('Adds the current block. Add again when the next block starts.');
});
$('kIcs').addEventListener('click', async () => {
  const s = schedFromForm(), rule = calRule(s), now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ev = calBlocks(s).map((b, i) => [
    'BEGIN:VEVENT', `UID:${s.id || 'new'}-${i}@peptide-log`, `DTSTAMP:${now}`, `DTSTART:${calStamp(b.start, s.time)}`, 'DURATION:PT10M',
    ...(rule ? [`RRULE:${rule}${b.until ? `;UNTIL=${b.until.replace(/-/g, '')}T235959` : ''}`] : []),
    `SUMMARY:${calTitle(s).replace(/[,;]/g, ' ')}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${calTitle(s).replace(/[,;]/g, ' ')}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT'
  ].join('\r\n'));
  const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Peptide Log//EN', ...ev, 'END:VCALENDAR'].join('\r\n');
  const p = state.peptides.find((x) => x.id === s.peptideId);
  await saveFile(`${normName(p?.name) || 'dose'}-reminder.ics`, text, 'text/calendar');
});

// ---------- start ----------
(async function init() {
  try {
    await DB.seedIfEmpty();
    await load();
    await seedInfo();
    state.weightUnit = (await DB.getMeta('weightUnit')) || 'kg';
    state.lastBackup = (await DB.getMeta('lastBackup')) || null;
    askPersist();
    renderAlerts();
  } catch (err) {
    document.querySelector('main').innerHTML = `<div class="empty">Could not open storage on this device.<br>${esc(err?.message || err)}</div>`;
    return;
  }
  resetForm(false);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
