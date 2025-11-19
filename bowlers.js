// js/bowlers.js
import { listBowlers, createBowler, updateBowler, deleteBowler } from './state.js';

const LEAGUES = [
  'Open Bowling',
  'Tuesday Mixed',
  'Men\'s League',
  'Women\'s League',
  'Youth League'
];

function populateLeagueSelect() {
  const select = document.getElementById('bowler-league');
  select.innerHTML = '<option value="">-- None --</option>' +
    LEAGUES.map(l => `<option value="${l}">${l}</option>`).join('');
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
  const handicap = parseInt(document.getElementById('bowler-handicap').value || '0', 10);
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

document.addEventListener('DOMContentLoaded', () => {
  populateLeagueSelect();
  renderTable();

  document.getElementById('bowler-form').addEventListener('submit', onSubmit);
  document.getElementById('btn-cancel-edit').addEventListener('click', resetForm);
});
