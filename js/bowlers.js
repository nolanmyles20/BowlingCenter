// js/bowlers.js
import {
  initStateFromCsv,
  listBowlers,
  createBowler,
  updateBowler,
  deleteBowler,
  listLeagues
} from './state.js';

/* ---------- helpers ---------- */

function buildLeagueOptions(selected) {
  const leagues = listLeagues().map(l => l.name);
  let html = '<option value="">-- None --</option>';
  leagues.forEach(name => {
    const sel = name === selected ? ' selected' : '';
    html += `<option value="${name}"${sel}>${name}</option>`;
  });
  return html;
}

/* ---------- table render ---------- */

function renderBowlerTable() {
  const tbody = document.getElementById('bowler-table-body');
  if (!tbody) return;

  // Always get current list from state (which is fed by CSV via initStateFromCsv)
  const bowlers = listBowlers().slice().sort((a, b) => {
    const nameA = (a.name || `${a.first_name || ''} ${a.last_name || ''}`).trim();
    const nameB = (b.name || `${b.first_name || ''} ${b.last_name || ''}`).trim();
    return nameA.localeCompare(nameB);
  });

  tbody.innerHTML = '';

  bowlers.forEach(b => {
    const tr = document.createElement('tr');
    tr.dataset.id = b.id;

    // Name: prefer single field, else build from first/last in CSV
    const name =
      (b.name || `${b.first_name || ''} ${b.last_name || ''}`.trim()) || 'Unknown';

    const gender      = b.gender || '';
    const hcp         = b.hcp ?? b.handicap ?? '';
    const league      = b.league || b.league_name || '';
    const teamNumber  = b.team_number ?? b.teamNumber ?? '';
    const posNumber   = b.pos_number ?? b.posNumber ?? '';
    const pins        = b.pins ?? '';
    const games       = b.games ?? '';
    const avg         = b.avg ?? b.average ?? '';
    const enteringAvg = b.entering_avg ?? b.enteringAverage ?? '';
    const hhg         = b.hhg ?? '';
    const hhs         = b.hhs ?? '';
    const hsg         = b.hsg ?? '';
    const hss         = b.hss ?? '';
    const mib         = b.mib ?? '';

    tr.innerHTML = `
      <td>${name}</td>
      <td>${gender}</td>
      <td>${hcp}</td>
      <td>${league}</td>
      <td>${teamNumber}</td>
      <td>${posNumber}</td>
      <td>${pins}</td>
      <td>${games}</td>
      <td>${avg}</td>
      <td>${enteringAvg}</td>
      <td>${hhg}</td>
      <td>${hhs}</td>
      <td>${hsg}</td>
      <td>${hss}</td>
      <td>${mib}</td>
      <td>
        <button class="btn-small btn-edit">Edit</button>
        <button class="btn-small btn-delete">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  attachBowlerRowHandlers();
}

/* ---------- row actions ---------- */

function attachBowlerRowHandlers() {
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      const b = listBowlers().find(x => String(x.id) === String(id));
      if (!b) return;

      document.getElementById('bowler-id').value = b.id;
      document.getElementById('bowler-name').value =
        b.name || `${b.first_name || ''} ${b.last_name || ''}`.trim();
      document.getElementById('bowler-gender').value = b.gender || '';

      // Use either hcp or handicap field for the form
      const handicap = b.hcp ?? b.handicap ?? 0;
      document.getElementById('bowler-handicap').value = handicap;

      const leagueSelect = document.getElementById('bowler-league');
      leagueSelect.innerHTML = buildLeagueOptions(b.league || b.league_name || '');

      document.getElementById('bowler-form-title').textContent = 'Edit Bowler';
      document.getElementById('btn-save-bowler').textContent = 'Update Bowler';
      document.getElementById('btn-cancel-edit').style.display = 'inline-block';
    };
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('tr');
      const id = row.dataset.id;
      if (!confirm('Delete this bowler?')) return;
      deleteBowler(id);
      renderBowlerTable();
    };
  });
}

/* ---------- init ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  // Load all CSV data into shared state (bowlers, teams, leagues, etc.)
  await initStateFromCsv();

  const leagueSelect = document.getElementById('bowler-league');
  if (leagueSelect) {
    leagueSelect.innerHTML = buildLeagueOptions('');
  }

  renderBowlerTable();

  const form = document.getElementById('bowler-form');
  const cancelBtn = document.getElementById('btn-cancel-edit');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const idVal = document.getElementById('bowler-id').value;
    const name = document.getElementById('bowler-name').value.trim();
    const gender = document.getElementById('bowler-gender').value;
    const handicap = parseInt(
      document.getElementById('bowler-handicap').value,
      10
    ) || 0;
    const league = document.getElementById('bowler-league').value;

    if (!name) {
      alert('Name is required');
      return;
    }

    const payload = {
      name,
      gender,
      // Normalize back to the property state.js expects
      handicap,
      league
    };

    if (idVal) {
      updateBowler(idVal, payload);
    } else {
      createBowler(payload);
    }

    form.reset();
    document.getElementById('bowler-id').value = '';
    document.getElementById('bowler-form-title').textContent = 'Add Bowler';
    document.getElementById('btn-save-bowler').textContent = 'Save Bowler';
    cancelBtn.style.display = 'none';

    renderBowlerTable();
  });

  cancelBtn.addEventListener('click', () => {
    form.reset();
    document.getElementById('bowler-id').value = '';
    document.getElementById('bowler-form-title').textContent = 'Add Bowler';
    document.getElementById('btn-save-bowler').textContent = 'Save Bowler';
    cancelBtn.style.display = 'none';

    renderBowlerTable();
  });
});
