// --- Inicjalizacja stanu ---
// ZUPEŁNIE NOWA STRUKTURA STANU
let state = JSON.parse(localStorage.getItem('trening_pro_v2') || `{
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
    "totalTimerInterval": null,
    "exercises": []
  },
  "restTimer": {
    "interval": null,
    "displayElement": null,
    "secondsLeft": 0
  }
}`);

// --- Zmienne globalne ---
const panels = document.querySelectorAll('.panel');
const welcomeMsg = document.getElementById('welcomeMsg');
const dayList = document.getElementById('dayList');
const logArea = document.getElementById('logArea');
const masterTimerDisplay = document.getElementById('masterTimerDisplay');
let statsChart = null; // Zmienna dla wykresu
let currentDay = null; // Przechowuje dzień wybrany do edycji/treningu

// --- Główny System Nawigacji ---

// Pokaż panel i ukryj resztę
function showPanel(panelId) {
  // Jeśli trening jest aktywny, nie pozwól na nawigację poza panel treningu
  if (state.activeWorkout.isActive && panelId !== 'panel-active-workout') {
    alert("Najpierw zakończ aktywny trening!");
    return;
  }
  panels.forEach(p => p.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');

  // Specjalna logika dla panelu statystyk (inicjalizacja/aktualizacja)
  if (panelId === 'panel-stats') {
    if (!statsChart) {
      initStatsChart();
    }
    updateStatsChart();
  }
}

// Dolne menu nawigacyjne
document.querySelectorAll('.bottom-nav button').forEach(btn => {
  btn.onclick = () => {
    showPanel(btn.dataset.panel);
  }
});

// Przyciski "Wróć"
document.getElementById('backToMainBtn').onclick = () => showPanel('panel-main');
document.getElementById('savePlanChangesBtn').onclick = () => {
  saveState(); // Zapisz zmiany w planie
  showPlanDetails(currentDay); // Wróć do podglądu planu
};

// --- Ustawienia i Motyw (bez zmian) ---
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

document.getElementById('resetData').onclick = () => {
  if (confirm('JESTEŚ PEWIEN? Spowoduje to usunięcie WSZYSTKICH planów, historii i ustawień.')) {
    localStorage.removeItem('trening_pro_v2');
    location.reload();
  }
}

// --- Logika Planów Treningowych (REQ 1, 2) ---

// 1. Renderowanie Głównego Panelu (Lista Dni)
function renderDayList() {
  dayList.innerHTML = '';
  Object.keys(state.plans).forEach(dayName => {
    const btn = document.createElement('button');
    btn.className = 'day-btn';
    btn.textContent = dayName;
    btn.onclick = () => showPlanDetails(dayName);
    dayList.appendChild(btn);
  });
}

// 2. Pokazywanie Szczegółów Planu (Podgląd)
function showPlanDetails(dayName) {
  currentDay = dayName;
  document.getElementById('planDetailsTitle').textContent = `Plan: ${dayName}`;
  const list = document.getElementById('planDetailsList');
  list.innerHTML = '';

  if (state.plans[dayName].length === 0) {
    list.innerHTML = '<p>Brak ćwiczeń w planie. Dodaj je w edytorze.</p>';
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

  // Ustawienie przycisków
  document.getElementById('editPlanBtn').onclick = () => showPlanEditor(dayName);
  document.getElementById('startWorkoutBtn').onclick = () => startWorkout(dayName);

  showPanel('panel-plan-details');
}

// 3. Pokazywanie Edytora Planu
function showPlanEditor(dayName) {
  currentDay = dayName;
  document.getElementById('editPlanTitle').textContent = `Edytuj: ${dayName}`;
  renderEditPlanList();
  
  // Logika dodawania ćwiczenia
  document.getElementById('addExerciseBtn').onclick = () => {
    const name = document.getElementById('exName').value;
    const sets = +document.getElementById('exTargetSets').value;
    const reps = +document.getElementById('exTargetReps').value;

    if (!name || !sets || !reps) {
      alert('Wypełnij wszystkie pola ćwiczenia!');
      return;
    }

    state.plans[dayName].push({ name: name, targetSets: sets, targetReps: reps });
    saveState();
    renderEditPlanList(); // Odśwież listę
    // Wyczyść formularz
    document.getElementById('exName').value = '';
    document.getElementById('exTargetSets').value = '';
    document.getElementById('exTargetReps').value = '';
  };

  showPanel('panel-edit-plan');
}

// 3a. Renderowanie listy w edytorze (z przyciskami 'Usuń')
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
        renderEditPlanList(); // Odśwież
      }
    };
    list.appendChild(div);
  });
}

// --- Logika Aktywnego Treningu (REQ 3, 4, 5) ---

// 1. Start Treningu
function startWorkout(dayName) {
  if (!confirm(`Rozpocząć trening: ${dayName}?`)) return;

  state.activeWorkout = {
    isActive: true,
    dayName: dayName,
    startTime: Date.now(),
    totalTimerInterval: setInterval(updateMasterTimer, 1000),
    // GŁĘBOKA KOPIA planu, aby dodać logi serii
    exercises: state.plans[dayName].map(ex => ({
      ...ex, // Kopiuje name, targetSets, targetReps
      loggedSets: [] // Dodaje nowe pole na wykonane serie
    }))
  };

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
        <span class="set-remove" data-ex-index="${exIndex}" data-set-index="${setIndex}">Usuń</span>
      </div>
    `).join('');

    card.innerHTML = `
      <h3>${ex.name}</h3>
      <small>Cel: ${ex.targetSets} x ${ex.targetReps}</small>
      
      <div class="logged-sets-list">${setsHTML}</div>
      
      <form class="log-set-form" data-ex-index="${exIndex}">
        <input type="number" class="log-weight" placeholder="kg" required>
        <input type="number" class="log-reps" placeholder="powt." required>
        <button type="submit" class="btn-success">Zapisz Serię</button>
      </form>
      
      <div class="rest-timer-section">
        <span class="rest-timer-display" id="rest-timer-${exIndex}">00:00</span>
        <button class="start-rest-btn" data-ex-index="${exIndex}">60s</button>
        <button class="start-rest-btn" data-ex-index="${exIndex}">90s</button>
      </div>
    `;
    list.appendChild(card);
  });

  // Dodanie event listenerów do formularzy i timerów
  list.querySelectorAll('.log-set-form').forEach(form => {
    form.onsubmit = (e) => {
      e.preventDefault();
      const exIndex = e.target.dataset.exIndex;
      const weight = e.target.querySelector('.log-weight').value;
      const reps = e.target.querySelector('.log-reps').value;
      if (weight && reps) {
        logSet(exIndex, +weight, +reps);
        // Wyczyść inputy
        e.target.querySelector('.log-weight').value = '';
        e.target.querySelector('.log-reps').value = '';
      }
    };
  });

  list.querySelectorAll('.start-rest-btn').forEach(btn => {
    btn.onclick = () => {
      const exIndex = btn.dataset.exIndex;
      const seconds = parseInt(btn.textContent); // 60 lub 90
      startRestTimer(exIndex, seconds);
    };
  });

  list.querySelectorAll('.set-remove').forEach(btn => {
    btn.onclick = () => {
      removeSet(btn.dataset.exIndex, btn.dataset.setIndex);
    };
  });
}

// 3. Logowanie Serii (REQ 4)
function logSet(exIndex, weight, reps) {
  state.activeWorkout.exercises[exIndex].loggedSets.push({ weight, reps });
  saveState();
  renderActiveWorkout(); // Odśwież widok
}

// 3a. Usuwanie Serii (dodatkowe)
function removeSet(exIndex, setIndex) {
  if (confirm('Usunąć tę serię?')) {
    state.activeWorkout.exercises[exIndex].loggedSets.splice(setIndex, 1);
    saveState();
    renderActiveWorkout();
  }
}

// 4. Timer Odpoczynku (REQ 5)
function startRestTimer(exIndex, seconds) {
  // Zatrzymaj poprzedni timer, jeśli działał
  if (state.restTimer.interval) {
    clearInterval(state.restTimer.interval);
    if (state.restTimer.displayElement) {
      state.restTimer.displayElement.textContent = '00:00';
    }
  }

  state.restTimer.displayElement = document.getElementById(`rest-timer-${exIndex}`);
  state.restTimer.secondsLeft = seconds;

  const updateDisplay = () => {
    const mins = Math.floor(state.restTimer.secondsLeft / 60).toString().padStart(2, '0');
    const secs = (state.restTimer.secondsLeft % 60).toString().padStart(2, '0');
    state.restTimer.displayElement.textContent = `${mins}:${secs}`;
  };
  updateDisplay();

  state.restTimer.interval = setInterval(() => {
    state.restTimer.secondsLeft--;
    updateDisplay();

    if (state.restTimer.secondsLeft <= 0) {
      clearInterval(state.restTimer.interval);
      state.restTimer.interval = null;
      state.restTimer.displayElement.textContent = "Start!";
      alert("Przerwa zakończona!");
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

  // Zatrzymaj timer
  clearInterval(state.activeWorkout.totalTimerInterval);
  const finalDuration = masterTimerDisplay.textContent;
  masterTimerDisplay.style.display = 'none';

  // Utwórz wpis w logu
  const logEntry = {
    date: new Date().toISOString().split('T')[0],
    dayName: state.activeWorkout.dayName,
    duration: finalDuration,
    exercises: state.activeWorkout.exercises.filter(ex => ex.loggedSets.length > 0) // Zapisz tylko te ćwiczenia, które miały serie
  };
  state.logs.push(logEntry);

  // Zresetuj stan aktywnego treningu
  state.activeWorkout = {
    isActive: false,
    dayName: null,
    startTime: null,
    totalTimerInterval: null,
    exercises: []
  };

  saveState();
  renderLogs(); // Zaktualizuj historię
  showPanel('panel-main'); // Wróć do ekranu głównego
};

// --- Historia i Logi ---
function renderLogs() {
  logArea.innerHTML = '';
  state.logs.slice().reverse().forEach(log => {
    const div = document.createElement('div');
    div.className = 'card';
    
    // Podsumowanie ćwiczeń
    const exercisesSummary = log.exercises.map(ex => 
      `<li>${ex.name}: ${ex.loggedSets.length} serii</li>`
    ).join('');

    div.innerHTML = `
      <div class="log-summary">
        ${log.date} - ${log.dayName} (Czas: ${log.duration})
      </div>
      <div class="log-details">
        <ul>${exercisesSummary}</ul>
      </div>
    `;
    logArea.appendChild(div);
  });
}

// Funkcje Import/Eksport/Wyczyść (bez zmian)
document.getElementById('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state.logs)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'trening_logs_v2.json'; a.click();
}
document.getElementById('importBtn').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const importedLogs = JSON.parse(reader.result);
      if (Array.isArray(importedLogs)) {
        state.logs = importedLogs; saveState(); renderLogs(); alert('Zaimportowano dane');
      } else { alert('Nieprawidłowy format pliku JSON.'); }
    } catch (err) { alert('Błąd podczas odczytu pliku: ' + err.message); }
  }
  reader.readAsText(file);
}
document.getElementById('clearHistory').onclick = () => {
  if (confirm('Wyczyścić całą historię treningów?')) {
    state.logs = []; saveState(); renderLogs();
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

// Zaktualizowana funkcja do obliczania objętości z nowej struktury logów
function updateStatsChart() {
  if (!statsChart) return;

  const volumeByDate = state.logs.reduce((acc, log) => {
    const date = log.date;
    
    // Oblicz całkowitą objętość dla danej sesji (logu)
    const totalVolume = log.exercises.reduce((exAcc, ex) => {
      // Zsumuj objętość dla każdej serii w ćwiczeniu
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

// --- Zapis stanu ---
function saveState() {
  localStorage.setItem('trening_pro_v2', JSON.stringify(state));
}

// --- Funkcja startowa ---
function initApp() {
  // Sprawdź, czy trening jest w toku (np. po odświeżeniu strony)
  if (state.activeWorkout.isActive) {
    if (confirm("Wykryto niezakończony trening. Chcesz go wznowić?")) {
      // Wznów timery i pokaż panel
      state.activeWorkout.totalTimerInterval = setInterval(updateMasterTimer, 1000);
      masterTimerDisplay.style.display = 'block';
      renderActiveWorkout();
      showPanel('panel-active-workout');
    } else {
      // Anuluj trening
      state.activeWorkout.isActive = false;
      saveState();
      showPanel('panel-main');
    }
  } else {
    // Normalny start
    showPanel('panel-main');
  }

  updateWelcome();
  applyTheme();
  renderDayList();
  renderLogs();
}

// --- Start Aplikacji ---
initApp();
