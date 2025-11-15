// KLUCZ DO LOCAL STORAGE - Zmieniony, aby uniknąć konfliktów
const STORAGE_KEY = 'trening_pro_v3';

// --- Inicjalizacja stanu ---
const defaultState = {
  "username": "",
  "theme": "light",
  "plans": {
    "Poniedziałek": [],
    "Wtorek": [],
    "Środa": [],
    "Czwartek": [],
    "Piątek": [],
    "Sobota": [],
    "Niedziela": []
  },
  "logs": [],
  "activeWorkout": {
    "isActive": false,
    "dayName": null,
    "startTime": null,
    "totalTimerInterval": null, // ID interwału JS
    "exercises": []
  },
  "restTimer": {
    "interval": null, // ID interwału JS
    "displayElement": null,
    "secondsLeft": 0
  }
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY) || JSON.stringify(defaultState));
// Użyj domyślnej struktury, jeśli wczytane dane są uszkodzone (np. stare wersje)
if (!state.plans || !state.activeWorkout) {
  state = defaultState;
  saveState();
}


// --- Zmienne globalne DOM ---
const panels = document.querySelectorAll('.panel');
const welcomeMsg = document.getElementById('welcomeMsg');
const dayList = document.getElementById('dayList');
const logArea = document.getElementById('logArea');
const masterTimerDisplay = document.getElementById('masterTimerDisplay');
let statsChart = null;
let currentDay = null; // Przechowuje dzień wybrany do edycji/treningu

// --- Zapis stanu ---
function saveState() {
  // Zapisz tylko dane, które można serializować (bez interwałów)
  const stateToSave = { ...state };
  if (stateToSave.activeWorkout) {
    stateToSave.activeWorkout.totalTimerInterval = null;
  }
  if (stateToSave.restTimer) {
    stateToSave.restTimer.interval = null;
    stateToSave.restTimer.displayElement = null; // Nie można serializować elementu DOM
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
}

// --- Główny System Nawigacji ---

function showPanel(panelId) {
  // Jeśli trening jest aktywny, wymuś pozostanie w panelu treningu
  if (state.activeWorkout.isActive && panelId !== 'panel-active-workout') {
    alert("Najpierw zakończ aktywny trening!");
    return;
  }
  panels.forEach(p => p.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');

  if (panelId === 'panel-stats') {
    if (!statsChart) {
      initStatsChart();
    }
    updateStatsChart();
  }
}

document.querySelectorAll('.bottom-nav button').forEach(btn => {
  btn.onclick = () => showPanel(btn.dataset.panel);
});

document.getElementById('backToMainBtn').onclick = () => showPanel('panel-main');
document.getElementById('savePlanChangesBtn').onclick = () => {
  saveState();
  showPlanDetails(currentDay);
};

// --- Ustawienia i Motyw ---
const usernameInput = document.getElementById('username');
usernameInput.value = state.username;
usernameInput.onchange = e => { state.username = e.target.value; saveState(); updateWelcome(); }
function updateWelcome() {
  welcomeMsg.textContent = state.username ? `, ${state.username}!` : '';
}

const themeSelect = document.getElementById('themeSelect');
themeSelect.value = state.theme;
function applyTheme() { document.body.classList.toggle('dark', state.theme === 'dark'); }
applyTheme();
themeSelect.onchange = e => { state.theme = e.target.value; applyTheme(); saveState(); }

document.getElementById('resetData').onclick = () => {
  if (confirm('JESTEŚ PEWIEN? Spowoduje to usunięcie WSZYSTKICH planów, historii i ustawień.')) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
}

// --- Logika Planów Treningowych (REQ 1, 2) ---

function renderDayList() {
  dayList.innerHTML = '';
  Object.keys(state.plans).forEach(dayName => {
    const btn = document.createElement('button');
    btn.className = 'day-btn';
    btn.textContent = `${dayName} (${state.plans[dayName].length} ćw.)`;
    btn.onclick = () => showPlanDetails(dayName);
    dayList.appendChild(btn);
  });
}

function showPlanDetails(dayName) {
  currentDay = dayName;
  document.getElementById('planDetailsTitle').textContent = `Plan: ${dayName}`;
  const list = document.getElementById('planDetailsList');
  list.innerHTML = '';

  if (state.plans[dayName].length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Brak ćwiczeń w planie. Kliknij "Edytuj Plan", aby je dodać.</p>';
  }

  state.plans[dayName].forEach(ex => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div>
        <strong>${ex.name}</strong><br>
        <span>Cel: ${ex.targetSets} serie x ${ex.targetReps} powt.</span>
      </div>
    `;
    list.appendChild(div);
  });

  document.getElementById('editPlanBtn').onclick = () => showPlanEditor(dayName);
  document.getElementById('startWorkoutBtn').onclick = () => startWorkout(dayName);

  showPanel('panel-plan-details');
}

function showPlanEditor(dayName) {
  currentDay = dayName;
  document.getElementById('editPlanTitle').textContent = `Edytuj: ${dayName}`;
  renderEditPlanList();
  
  // Przypisanie funkcji do przycisku dodawania
  document.getElementById('addExerciseBtn').onclick = () => {
    const name = document.getElementById('exName').value;
    const sets = +document.getElementById('exTargetSets').value;
    const reps = +document.getElementById('exTargetReps').value;

    if (!name || sets < 1 || reps < 1) {
      alert('Wypełnij wszystkie pola poprawnymi wartościami (min. 1).');
      return;
    }

    state.plans[dayName].push({ name: name, targetSets: sets, targetReps: reps });
    saveState();
    renderEditPlanList();
    document.getElementById('exName').value = '';
    document.getElementById('exTargetSets').value = '';
    document.getElementById('exTargetReps').value = '';
  };

  showPanel('panel-edit-plan');
}

function renderEditPlanList() {
  const list = document.getElementById('editPlanList');
  list.innerHTML = '';
  state.plans[currentDay].forEach((ex, index) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div>
        <strong>${ex.name}</strong><br>
        <span>Cel: ${ex.targetSets} x ${ex.targetReps}</span>
      </div>
      <button class="btn-delete" data-index="${index}">Usuń</button>
    `;
    div.querySelector('.btn-delete').onclick = () => {
      if (confirm(`Usunąć "${ex.name}" z planu?`)) {
        state.plans[currentDay].splice(index, 1);
        saveState();
        renderEditPlanList();
      }
    };
    list.appendChild(div);
  });
}

// --- Logika Aktywnego Treningu (REQ 3, 4, 5) ---

// 1. Start Treningu
function startWorkout(dayName) {
  if (state.plans[dayName].length === 0) {
    return alert("Ten plan jest pusty. Najpierw dodaj ćwiczenia, aby zacząć.");
  }

  if (!confirm(`Rozpocząć trening: ${dayName}?`)) return;

  state.activeWorkout.isActive = true;
  state.activeWorkout.dayName = dayName;
  state.activeWorkout.startTime = Date.now();
  state.activeWorkout.exercises = state.plans[dayName].map(ex => ({
    ...ex,
    loggedSets: [] // Dodaje nowe pole na wykonane serie
  }));

  // Wystartuj główny timer
  clearInterval(state.activeWorkout.totalTimerInterval); // Upewnij się, że nie ma starego
  state.activeWorkout.totalTimerInterval = setInterval(updateMasterTimer, 1000);
  
  masterTimerDisplay.style.display = 'block';
  updateMasterTimer();
  renderActiveWorkout();
  showPanel('panel-active-workout');
  saveState();
}

// 2. Renderowanie Panelu Aktywnego Treningu
function renderActiveWorkout() {
  document.getElementById('activeWorkoutTitle').textContent = `Trening: ${state.activeWorkout.dayName}`;
  const list = document.getElementById('activeWorkoutList');
  list.innerHTML = '';

  state.activeWorkout.exercises.forEach((ex, exIndex) => {
    const card = document.createElement('div');
    card.className = 'workout-card';

    // Lista zalogowanych serii
    let setsHTML = ex.loggedSets.map((set, setIndex) => `
      <div class="logged-set" data-set-index="${setIndex}">
        <span class="set-number">Seria ${setIndex + 1}:</span>
        <span class="set-data">${set.weight} kg x ${set.reps} powt.</span>
        <span class="set-remove" data-ex-index="${exIndex}" data-set-index="${setIndex}">[x]</span>
      </div>
    `).join('');

    card.innerHTML = `
      <h3>${ex.name}</h3>
      <small>Cel: ${ex.targetSets} serie x ${ex.targetReps} powt.</small>
      
      <div class="logged-sets-list">${setsHTML}</div>
      
      <form class="log-set-form" data-ex-index="${exIndex}">
        <input type="number" class="log-weight" placeholder="Ciężar (kg)" value="${ex.loggedSets.slice(-1)[0]?.weight || ''}" required>
        <input type="number" class="log-reps" placeholder="Powtórzenia" required>
        <button type="submit" class="btn-success">Zapisz Serię</button>
      </form>
      
      <div class="rest-timer-section">
        <span class="rest-timer-display" id="rest-timer-${exIndex}">00:00</span>
        <button class="start-rest-btn btn-secondary" data-ex-index="${exIndex}" data-seconds="60">60s</button>
        <button class="start-rest-btn btn-secondary" data-ex-index="${exIndex}" data-seconds="90">90s</button>
      </div>
    `;
    list.appendChild(card);
  });

  // Ustawienie event listenerów
  list.querySelectorAll('.log-set-form').forEach(form => {
    form.onsubmit = (e) => {
      e.preventDefault();
      const exIndex = e.target.dataset.exIndex;
      const weight = e.target.querySelector('.log-weight').value;
      const reps = e.target.querySelector('.log-reps').value;
      if (weight && reps && +weight >= 0 && +reps >= 1) {
        logSet(exIndex, +weight, +reps);
        e.target.querySelector('.log-reps').value = ''; // Wyczyść tylko powtórzenia
        // Opcjonalnie: Uruchom timer odpoczynku po zapisaniu serii
        startRestTimer(exIndex, 60); 
      } else {
        alert('Podaj poprawne wartości dla ciężaru (min. 0) i powtórzeń (min. 1).');
      }
    };
  });

  list.querySelectorAll('.start-rest-btn').forEach(btn => {
    btn.onclick = () => {
      const exIndex = btn.dataset.exIndex;
      const seconds = +btn.dataset.seconds;
      startRestTimer(exIndex, seconds);
    };
  });

  list.querySelectorAll('.set-remove').forEach(btn => {
    btn.onclick = () => removeSet(+btn.dataset.exIndex, +btn.dataset.setIndex);
  });
}

// 3. Logowanie Serii (REQ 4)
function logSet(exIndex, weight, reps) {
  state.activeWorkout.exercises[exIndex].loggedSets.push({ weight, reps });
  saveState();
  renderActiveWorkout(); // Odśwież widok
}

// 3a. Usuwanie Serii
function removeSet(exIndex, setIndex) {
  if (confirm('Usunąć tę serię?')) {
    state.activeWorkout.exercises[exIndex].loggedSets.splice(setIndex, 1);
    saveState();
    renderActiveWorkout();
  }
}

// 4. Timer Odpoczynku (REQ 5)
function startRestTimer(exIndex, seconds) {
  // Wyczyść ewentualny działający timer
  if (state.restTimer.interval) {
    clearInterval(state.restTimer.interval);
    if (state.restTimer.displayElement) {
       // Opcjonalnie przywróć poprzedniemu wyświetlaczowi standardowy kolor, jeśli to możliwe
       state.restTimer.displayElement.style.color = 'var(--accent)';
    }
  }

  // Ustaw nowy timer
  const displayElement = document.getElementById(`rest-timer-${exIndex}`);
  state.restTimer.displayElement = displayElement;
  state.restTimer.secondsLeft = seconds;
  displayElement.style.color = 'var(--danger)'; // Zmień kolor na czerwony podczas odliczania

  const updateDisplay = () => {
    const mins = Math.floor(state.restTimer.secondsLeft / 60).toString().padStart(2, '0');
    const secs = (state.restTimer.secondsLeft % 60).toString().padStart(2, '0');
    displayElement.textContent = `${mins}:${secs}`;
  };
  updateDisplay();

  state.restTimer.interval = setInterval(() => {
    state.restTimer.secondsLeft--;
    updateDisplay();

    if (state.restTimer.secondsLeft <= 0) {
      clearInterval(state.restTimer.interval);
      state.restTimer.interval = null;
      displayElement.textContent = "Start!";
      displayElement.style.color = 'var(--success)';
      // alert("Przerwa zakończona!"); // Opcjonalny alert
    }
  }, 1000);
}

// 5. Główny Stoper Sesji (REQ 3)
function updateMasterTimer() {
  if (!state.activeWorkout.isActive) return;
  
  const elapsedMs = Date.now() - state.activeWorkout.startTime;
  const hours = Math.floor(elapsedMs / 3600000).toString().padStart(2, '0');
  const minutes = Math.floor((elapsedMs % 3600000) / 60000).toString().padStart(2, '0');
  const seconds = Math.floor((elapsedMs % 60000) / 1000).toString().padStart(2, '0');
  
  masterTimerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
}

// 6. Zakończenie Treningu
document.getElementById('finishWorkoutBtn').onclick = () => {
  if (!confirm('Zakończyć i zapisać ten trening?')) return;

  // 1. Zakończenie timerów
  clearInterval(state.activeWorkout.totalTimerInterval);
  if (state.restTimer.interval) clearInterval(state.restTimer.interval);
  
  const finalDuration = masterTimerDisplay.textContent;
  masterTimerDisplay.style.display = 'none';

  // 2. Utwórz wpis w logu
  const logEntry = {
    date: new Date().toISOString().split('T')[0],
    dayName: state.activeWorkout.dayName,
    duration: finalDuration,
    exercises: state.activeWorkout.exercises.filter(ex => ex.loggedSets.length > 0) // Tylko ćwiczenia z seriami
  };
  state.logs.push(logEntry);

  // 3. Zresetuj stan aktywnego treningu
  state.activeWorkout = defaultState.activeWorkout; // Użyj czystego obiektu
  state.restTimer = defaultState.restTimer;

  saveState();
  renderLogs();
  renderDayList(); // Aktualizuj, bo to może zająć miejsce na głównej liście
  showPanel('panel-main');
};

// --- Historia i Logi ---
function renderLogs() {
  logArea.innerHTML = '';
  if (state.logs.length === 0) {
     logArea.innerHTML = '<p style="color:var(--muted)">Brak zapisanych treningów w historii.</p>';
     return;
  }
  
  state.logs.slice().reverse().forEach(log => {
    const div = document.createElement('div');
    div.className = 'card';
    
    const exercisesSummary = log.exercises.map(ex => 
      // Oblicz sumę serii dla każdego ćwiczenia w logu
      `<li style="margin-left: -20px;">${ex.name}: <strong>${ex.loggedSets.length}</strong> serii</li>`
    ).join('');

    div.innerHTML = `
      <div class="log-summary">
        ${log.date} - ${log.dayName}
      </div>
      <div class="log-details" style="font-size:0.9em; margin-top: 5px;">
        Czas: ${log.duration}<br>
        <ul style="list-style-type: disc;">${exercisesSummary}</ul>
      </div>
    `;
    logArea.appendChild(div);
  });
}

// --- Import/Eksport (zaktualizowany do v3) ---
document.getElementById('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state.logs)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'trening_logs_v3.json'; a.click();
}
document.getElementById('importBtn').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const importedLogs = JSON.parse(reader.result);
      if (Array.isArray(importedLogs)) {
        state.logs = importedLogs; saveState(); renderLogs(); alert('Zaimportowano dane.');
      } else { alert('Nieprawidłowy format pliku JSON.'); }
    } catch (err) { alert('Błąd podczas odczytu pliku: ' + err.message); }
  }
  reader.readAsText(file);
}
document.getElementById('clearHistory').onclick = () => {
  if (confirm('Wyczyścić całą historię treningów?')) {
    state.logs = []; saveState(); renderLogs(); updateStatsChart();
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
  if (!statsChart || !state.logs) return;

  const volumeByDate = state.logs.reduce((acc, log) => {
    const date = log.date;
    
    const totalVolume = log.exercises.reduce((exAcc, ex) => {
      const exerciseVolume = ex.loggedSets.reduce((setAcc, set) => {
        return setAcc + (set.weight * set.reps);
      }, 0);
      return exAcc + exerciseVolume;
    }, 0);

    if (!acc[date]) {
      acc[date] = 0;
    }
    acc[date] += totalVolume;
    return acc;
  }, {});

  const sortedDates = Object.keys(volumeByDate).sort();
  statsChart.data.labels = sortedDates;
  statsChart.data.datasets[0].data = sortedDates.map(date => volumeByDate[date]);
  statsChart.update();
}

// --- Funkcja startowa ---
function initApp() {
  // Sprawdź, czy trening jest w toku (np. po odświeżeniu strony)
  if (state.activeWorkout.isActive) {
    if (confirm("Wykryto niezakończony trening. Chcesz go wznowić?")) {
      // Ponownie przypisz interwał
      state.activeWorkout.totalTimerInterval = setInterval(updateMasterTimer, 1000);
      masterTimerDisplay.style.display = 'block';
      renderActiveWorkout();
      showPanel('panel-active-workout');
    } else {
      // Anuluj trening (reset do stanu początkowego)
      state.activeWorkout = defaultState.activeWorkout;
      state.restTimer = defaultState.restTimer;
      saveState();
      showPanel('panel-main');
    }
  } else {
    showPanel('panel-main');
  }

  updateWelcome();
  applyTheme();
  renderDayList();
  renderLogs();
}

// --- Start Aplikacji ---
initApp();
