// js/bowlers.js
import {
  listBowlers,
  createBowler,
  updateBowler,
  deleteBowler,
  getState
} from "./state.js";

const BOWLERS_CSV_URL = "data/bowlers.csv"; // full CSV with all fields

/* ============================================
   CSV PARSER
============================================ */
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];

  const header = lines[0].split(",").map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = (cols[idx] || "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

/* ============================================
   INITIAL CSV SEED
============================================ */
async function seedBowlersFromCsvIfEmpty() {
  const existing = listBowlers();
  if (existing.length > 0) return;

  try {
    const resp = await fetch(BOWLERS_CSV_URL);
    if (!resp.ok) return;

    const text = await resp.text();
    const rows = parseCsv(text);

    rows.forEach((r, index) => {
      const name = `${r.first_name || ""} ${r.last_name || ""}`.trim();

      createBowler({
        id: index + 1,
        name,
        gender: r.gender || "",
        handicap: Number(r.HCP || 0),
        league: r.Team || "",
        // all extra fields stored:
        teamNumber: r.Team# || "",
        posNumber: r.Pos# || "",
        pins: r.Pins || "",
        games: r.Games || "",
        avg: r.Avg || "",
        enteringAvg: r.EnteringAvg || "",
        hhg: r.HHG || "",
        hhs: r.HHS || "",
        hsg: r.HSG || "",
        hss: r.HSS || "",
        mib: r.MIB || ""
      });
    });
  } catch (e) {
    console.warn("Could not load bowlers CSV:", e);
  }
}

/* ============================================
   Render League Dropdown
============================================ */
function populateLeagueSelect(selected = "") {
  const state = getState();
  const leagues = Object.keys(state.leagues || {});
  const LEAGUES_DEFAULT = ["Open Bowling", "Tuesday Mixed", "Men's League", "Women's League", "Youth League"];

  const all = Array.from(new Set([...LEAGUES_DEFAULT, ...leagues]));

  const sel = document.getElementById("bowler-league");
  sel.innerHTML = `<option value="">-- None --</option>`;

  all.forEach(lg => {
    const opt = document.createElement("option");
    opt.value = lg;
    opt.textContent = lg;
    if (lg === selected) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* ============================================
   Render Table of All Bowlers
============================================ */
function renderTable() {
  const tbody = document.getElementById("bowler-table-body");
  tbody.innerHTML = "";

  const bowlers = listBowlers();

  bowlers.forEach(b => {
    const tr = document.createElement("tr");
    tr.dataset.id = b.id;

    tr.innerHTML = `
      <td>${b.name}</td>
      <td>${b.gender || ""}</td>
      <td>${b.handicap || 0}</td>
      <td>${b.league || ""}</td>

      <td>${b.teamNumber || ""}</td>
      <td>${b.posNumber || ""}</td>
      <td>${b.pins || ""}</td>
      <td>${b.games || ""}</td>
      <td>${b.avg || ""}</td>
      <td>${b.enteringAvg || ""}</td>
      <td>${b.hhg || ""}</td>
      <td>${b.hhs || ""}</td>
      <td>${b.hsg || ""}</td>
      <td>${b.hss || ""}</td>
      <td>${b.mib || ""}</td>

      <td>
        <button class="btn-small btn-edit">Edit</button>
        <button class="btn-small btn-secondary btn-delete">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  attachRowHandlers();
}

/* ============================================
   Row Button Handlers
============================================ */
function attachRowHandlers() {
  const tbody = document.getElementById("bowler-table-body");

  tbody.querySelectorAll("tr").forEach(tr => {
    const id = Number(tr.dataset.id);
    const bowler = listBowlers().find(b => b.id === id);

    const editBtn = tr.querySelector(".btn-edit");
    const deleteBtn = tr.querySelector(".btn-delete");

    editBtn.onclick = (e) => {
      e.stopPropagation();
      openFormForEdit(bowler);
    };

    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete ${bowler.name}?`)) {
        deleteBowler(id);
        renderTable();
        resetForm();
      }
    };
  });
}

/* ============================================
   Form Handling
============================================ */
function resetForm() {
  document.getElementById("bowler-id").value = "";
  document.getElementById("bowler-name").value = "";
  document.getElementById("bowler-gender").value = "";
  document.getElementById("bowler-handicap").value = 0;

  populateLeagueSelect("");

  document.getElementById("bowler-form-title").textContent = "Add Bowler";
  document.getElementById("btn-cancel-edit").style.display = "none";
}

function openFormForEdit(b) {
  document.getElementById("bowler-id").value = b.id;
  document.getElementById("bowler-name").value = b.name;
  document.getElementById("bowler-gender").value = b.gender || "";
  document.getElementById("bowler-handicap").value = b.handicap || 0;

  populateLeagueSelect(b.league || "");

  document.getElementById("bowler-form-title").textContent = "Edit Bowler";
  document.getElementById("btn-cancel-edit").style.display = "inline-block";
}

function onSave(e) {
  e.preventDefault();

  const id = document.getElementById("bowler-id").value;
  const name = document.getElementById("bowler-name").value.trim();
  const gender = document.getElementById("bowler-gender").value;
  const handicap = Number(document.getElementById("bowler-handicap").value);
  const league = document.getElementById("bowler-league").value;

  if (!name) {
    alert("Name is required.");
    return;
  }

  if (id) {
    updateBowler(Number(id), { name, gender, handicap, league });
  } else {
    createBowler({ name, gender, handicap, league });
  }

  resetForm();
  renderTable();
}

/* ============================================
   Init
============================================ */
document.addEventListener("DOMContentLoaded", async () => {
  await seedBowlersFromCsvIfEmpty();

  populateLeagueSelect();
  renderTable();

  document.getElementById("bowler-form").addEventListener("submit", onSave);
  document.getElementById("btn-cancel-edit").addEventListener("click", resetForm);
});
