// --- Inicjalizacja stanu ---
let state = JSON.parse(localStorage.getItem('trening_pro') || `{
  "username": "",
  "theme": "light",
  "plans": {"Dzisiaj": []},
  "logs": []
}`);

// --- Zmienne globalne ---
const panels = document.querySelectorAll('.panel');
const welcomeMsg = document.getElementById('welcomeMsg');
const exerciseList = document.getElementById('exerciseList');
const logArea = document.getElementById('logArea');
const timerDisplay = document.getElementById('timerDisplay');
let timer = 0, interval = null;
let statsChart = null; // Zmienna dla wykresu

// --- Nawigacja ---
document.querySelectorAll('.bottom-nav button').forEach(btn => {
  btn.onclick = () => {
    panels.forEach(p => p.classList.remove('active'));
    const panelId = btn.dataset.panel;
    document.getElementById(panelId).classList.add('active');

    // Inicjalizuj lub aktualizuj wykres TYLKO, gdy panel jest aktywny
    if (panelId === 'panel-stats') {
      if (!statsChart) {
        initStatsChart(); // Inicjalizuj, jeśli to pierwsze wejście
      }
      updateStatsChart(); // Zawsze aktualizuj dane po wejściu
    }
  }
});

// --- Ustawienia i Motyw ---
const usernameInput = document.getElementById('username');
usernameInput.value = state.username;
usernameInput.onchange = e => { state.username = e.target.value; saveState(); updateWelcome(); }
function updateWelcome() {
  welcomeMsg.textContent = state.username ? `, ${state.username}!` : '';
}

const themeSelect = document.getElementById('themeSelect');
themeSelect.value = state.theme;
applyTheme();
themeSelect.onchange = e => { state.theme = e.target.value; applyTheme(); saveState(); }
function applyTheme() { document.body.classList.toggle('dark', state.theme === 'dark'); }

// Przycisk Reset Danych
document.getElementById('resetData').onclick = () => {
  if (confirm('Czy na pewno chcesz usunąć wszystkie dane? Ta operacja jest nieodwracalna.')) {
    localStorage.removeItem('trening_pro');
    location.reload();
  }
}

// --- Plan treningowy ---
document.getElementById('addExercise').onclick = () => {
  const name = document.getElementById('exerciseName').value;
  const sets = +document.getElementById('sets').value || 1;
  const reps = +document.getElementById('reps').value || 10;
  const weight = +document.getElementById('weight').value || 0;
  if (!name) return alert('Podaj nazwę ćwiczenia!');
  state.plans["Dzisiaj"].push({ name, sets, reps, weight });
  document.getElementById('exerciseName').value = '';
  renderPlan();
  saveState();
}

function renderPlan() {
  exerciseList.innerHTML = '';
  state.plans["Dzisiaj"].forEach((ex, index) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div>
        <strong>${ex.name}</strong><br>
        <span>Serie: ${ex.sets} • Powt.: ${ex.reps} • Ciężar: ${ex.weight} kg</span>
      </div>
      <button data-index="${index}">Loguj</button>
    `;
    // Logika przycisku "Loguj"
    div.querySelector('button').onclick = () => {
      logExercise(index);
    };
    exerciseList.appendChild(div);
  });
}

// NOWA FUNKCJA: Logowanie ćwiczenia
function logExercise(planIndex) {
  // 1. Pobierz ćwiczenie z planu
  const exerciseToLog = state.plans["Dzisiaj"][planIndex];
  
  // 2. Dodaj je do logów z dzisiejszą datą (format RRRR-MM-DD)
  const logEntry = {
    ...exerciseToLog,
    date: new Date().toISOString().split('T')[0] 
  };
  state.logs.push(logEntry);

  // 3. Usuń ćwiczenie z planu "Dzisiaj"
  state.plans["Dzisiaj"].splice(planIndex, 1);

  // 4. Zapisz stan i odśwież UI
  saveState();
  renderPlan();
  renderLogs();
  // Jeśli panel statystyk jest aktywny, zaktualizuj wykres
  if (statsChart) {
    updateStatsChart();
  }
}

// --- Timer ---
document.getElementById('startRest').onclick = () => {
  if (interval) clearInterval(interval);
  timer = +document.getElementById('restSeconds').value || 60;
  updateTimerDisplay(); // Pokaż czas od razu
  interval = setInterval(() => {
    timer--;
    updateTimerDisplay();
    if (timer <= 0) {
      clearInterval(interval);
      interval = null;
      alert("Czas odpoczynku zakończony!");
      // Opcjonalnie: odtwórz dźwięk
    }
  }, 1000);
}
document.getElementById('stopRest').onclick = () => { clearInterval(interval); interval = null; }
document.getElementById('resetRest').onclick = () => {
  clearInterval(interval);
  interval = null;
  timer = 0;
  updateTimerDisplay();
}
function updateTimerDisplay() {
  timerDisplay.textContent = `${Math.floor(timer / 60).toString().padStart(2, '0')}:${(timer % 60).toString().padStart(2, '0')}`;
}

// --- Historia i logi ---
function renderLogs() {
  logArea.innerHTML = '';
  // Sortuj logi malejąco (najnowsze na górze) - slice() tworzy kopię
  state.logs.slice().reverse().forEach(l => {
    const div = document.createElement('div');
    div.className = 'card';
    // Wyświetl datę obok wpisu
    div.innerHTML = `
      <span>${l.name} (${l.sets}x${l.reps} @ ${l.weight}kg)</span>
      <span>${l.date}</span>
    `;
    logArea.appendChild(div);
  });
}
// Import / Eksport / Czyszczenie
document.getElementById('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state.logs)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'trening_logs.json';
  a.click();
}
document.getElementById('importBtn').onclick = () => { document.getElementById('fileInput').click(); }
document.getElementById('fileInput').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const importedLogs = JSON.parse(reader.result);
      if (Array.isArray(importedLogs)) {
        state.logs = importedLogs;
        saveState();
        renderLogs();
        updateStatsChart();
        alert('Zaimportowano dane');
      } else {
        alert('Nieprawidłowy format pliku JSON.');
      }
    } catch (err) {
      alert('Błąd podczas odczytu pliku: ' + err.message);
    }
  }
  reader.readAsText(file);
}
document.getElementById('clearHistory').onclick = () => {
  if (confirm('Czy na pewno chcesz wyczyścić całą historię?')) {
    state.logs = [];
    saveState();
    renderLogs();
    updateStatsChart();
  }
}

// --- Statystyki (Wykres) ---
function initStatsChart() {
  const ctx = document.getElementById('statsChart').getContext('2d');
  statsChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Objętość treningowa (kg)', data: [], backgroundColor: '#ff5722' }] },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

function updateStatsChart() {
  if (!statsChart) return; // Nie rób nic, jeśli wykres nie jest zainicjowany

  // 1. Przetwórz logi, aby obliczyć objętość (sets * reps * weight) dla każdego dnia
  const volumeByDate = state.logs.reduce((acc, log) => {
    const date = log.date; // np. "2025-11-16"
    const volume = (log.sets || 0) * (log.reps || 0) * (log.weight || 0);
    
    if (!acc[date]) {
      acc[date] = 0;
    }
    acc[date] += volume;
    return acc;
  }, {}); // Np. { "2025-11-15": 1500, "2025-11-16": 2200 }

  // 2. Przygotuj dane dla Chart.js
  // Sortuj klucze (daty), aby wykres był chronologiczny
  const sortedDates = Object.keys(volumeByDate).sort();
  const labels = sortedDates;
  const data = sortedDates.map(date => volumeByDate[date]);

  // 3. Zaktualizuj dane wykresu
  statsChart.data.labels = labels;
  statsChart.data.datasets[0].data = data;
  statsChart.update();
}

// --- Zapis stanu ---
function saveState() {
  localStorage.setItem('trening_pro', JSON.stringify(state));
}

// --- Pierwsze renderowanie przy starcie ---
updateWelcome();
renderPlan();
renderLogs();
updateTimerDisplay(); // Ustaw timer na 00:00
