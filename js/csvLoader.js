// js/csvLoader.js
// Simple CSV fetch + parse for GitHub Pages

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length && !l.startsWith('#'));

  if (!lines.length) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // super simple split – OK if you don’t have commas inside values
    const parts = line.split(',').map(p => p.trim());
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = parts[idx] ?? '';
    });
    rows.push(obj);
  }
  return rows;
}

async function fetchCsv(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const text = await res.text();
  return parseCsv(text);
}

// Main entry – load all four CSVs
export async function loadAllCsv() {
  const [bowlers, teams, team_roster, leagues] = await Promise.all([
    fetchCsv('data/bowlers.csv'),
    fetchCsv('data/teams.csv'),
    fetchCsv('data/team_roster.csv'),
    fetchCsv('data/leagues.csv')
  ]);

  return {
    bowlers,
    teams,
    leagues,
    team_roster
  };
}
