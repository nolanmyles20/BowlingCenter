// js/bowlers.js
import {
  listBowlers,
  createBowler,
  updateBowler,
  deleteBowler
} from './state.js';

// ---- CSV config ----
const LEAGUES_CSV_URL = 'data/leagues.csv';   // columns: name,hcpBase (at minimum)
const BOWLERS_CSV_URL = 'data/bowlers.csv';   // columns: name,gender,handicap,league

let LEAGUES = []; // populated from leagues.csv

// ---- CSV helpers ----

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (!cols.length || cols[0] === '') continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    rows.push(obj);
  }

  return rows;
}

async function loadLeaguesFromCsv() {
  try {
    const res = await fetch(LEAGUES_CSV_URL);
    if (!res.ok) return;
    const text = await res.text();
    const rows = parseCsv(text);
    LEAGUES = rows.map(r => r.name).filter(Boolean);
  } catch (err) {
    console.warn('Failed to load leagues.csv, falling back to none:', err);
    LEAGUES = [];
  }
}

async function loadInitialBowlersFromCsv() {
  try {
    const res = await fetch(BOWLERS_CSV_URL);
    if (!res.ok) return;
    const text = await res.text();
    const rows = parseCsv(text);

    const existing = listBowlers();
    for (const row of rows) {
      const name = (row.name || '').trim();
      if (!name) continue;

      const league = (row.league || '').trim();
      const gender = (row.gender || '').trim();
      const handicap = parseInt(row.handicap || '0', 10) || 0;

      const already = existing.find(
        b =>
          b.name.trim().toLowerCase() === name.toLowerCase() &&
          (b.league || '').trim().toLowerCase() === league.toLowerCase()
      );
      if (!already) {
        createBowler({ name, gender, handicap, league });
      }
    }
  } catch (err) {
    console.warn('Failed to load bowlers.csv:', err);
  }
}

// ---- UI helpers ----

function populateLeagueSelect() {
  const select = document.getElementById('bowler-league');
  const options =
    '<option value="">-- None --</option>' +
    LEAGUES.map(l => `<option value="${l}">${l}</option>`).join('');
  select.innerHTML = options;
}

function renderTable() {
  const tbody = document.getElementById('bowler-table-body');
  tbody.innerHTML = '';
  const bowlers = listBowlers();

  bowlers.forEach(b => {
    const tr = document.createElement('tr');
    tr.dataset.id = b.id;
    tr.innerHTML = `
      <td>${b.name}</td>
      <td>${b.gender || ''}</td>
      <td>${b.handicap ?? 0}</td>
      <td>${b.league || ''}</td>
      <td>
        <button class="btn-small btn-edit">Edit</button>
        <button class="btn-small btn-delete">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  attachRowHandlers();
}

function attachRowHandlers() {
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      loadBowlerIntoForm(row, id);
    };
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      if (confirm('Delete this bowler?')) {
        deleteBowler(id);
        renderTable();
      }
    };
  });
}

function loadBowlerIntoForm(row, id) {
  const cells = row.children;
  document.getElementById('bowler-id').value = id;
  document.getElementById('bowler-name').value = cells[0].textContent;
  document.getElementById('bowler-gender').value = cells[1].textContent || '';
  document.getElementById('bowler-handicap').value = cells[2].textContent || 0;
  document.getElementById('bowler-league').value = cells[3].textContent || '';

  document.getElementById('bowler-form-title').textContent = 'Edit Bowler';
  document.getElementById('btn-save-bowler').textContent = 'Update Bowler';
  document.getElementById('btn-cancel-edit').style.display = 'inline-block';
}

function resetForm() {
  document.getElementById('bowler-id').value = '';
  document.getElementById('bowler-name').value = '';
  document.getElementById('bowler-gender').value = '';
  document.getElementById('bowler-handicap').value = 0;
  document.getElementById('bowler-league').value = '';

  document.getElementById('bowler-form-title').textContent = 'Add Bowler';
  document.getElementById('btn-save-bowler').textContent = 'Save Bowler';
  document.getElementById('btn-cancel-edit').style.display = 'none';
}

function onSubmit(event) {
  event.preventDefault();

  const id = document.getElementById('bowler-id').value;
  const name = document.getElementById('bowler-name').value.trim();
  const gender = document.getElementById('bowler-gender').value;
  const handicap = parseInt(
    document.getElementById('bowler-handicap').value || '0',
    10
  );
  const league = document.getElementById('bowler-league').value;

  if (!name) {
    alert('Name is required');
    return;
  }

  if (id) {
    updateBowler(id, { name, gender, handicap, league });
  } else {
    createBowler({ name, gender, handicap, league });
  }

  resetForm();
  renderTable();
}

// ---- init ----

document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    await loadLeaguesFromCsv();
    await loadInitialBowlersFromCsv();

    populateLeagueSelect();
    renderTable();

    document
      .getElementById('bowler-form')
      .addEventListener('submit', onSubmit);
    document
      .getElementById('btn-cancel-edit')
      .addEventListener('click', resetForm);
  })();
});
