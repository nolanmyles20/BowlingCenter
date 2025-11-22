// js/leagues.js
import { loadAllCsv } from './csvLoader.js';

/* ------------------ Render Table ------------------ */

function renderLeaguesTable(leagues) {
  const tbody = document.querySelector('#leagues-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  leagues.forEach(lg => {
    const tr = document.createElement('tr');

    const leagueId  = lg.league_id || '';
    const name      = lg.name || '';
    const season    = lg.season || '';
    const centerId  = lg.center_id || '';

    tr.innerHTML = `
      <td>${leagueId}</td>
      <td>${name}</td>
      <td>${season}</td>
      <td>${centerId}</td>
      <td>
        <button class="btn-small" data-action="view-teams">View Teams</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/* ------------------ Init ------------------ */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const all = await loadAllCsv();
    const leagues = all.leagues || [];

    console.log(`Loaded ${leagues.length} leagues from leagues.csv`);
    renderLeaguesTable(leagues);
  } catch (err) {
    console.error('Failed to load leagues from CSV:', err);
  }
});
