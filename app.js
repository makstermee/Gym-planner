// KLUCZ DO LOCAL STORAGE - Utrzymany jako v3
const STORAGE_KEY = 'trening_pro_v3';

// --- Struktury Danych ---
const defaultUserData = {
  "theme": "light",
  "plans": {
    "Poniedziałek": [], "Wtorek": [], "Środa": [],
    "Czwartek": [], "Piątek": [], "Sobota": [], "Niedziela": []
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
};

const defaultState = {
  "currentUser": null, // ID aktualnie zalogowanego użytkownika
  "users": [], // Lista obiektów { id: '...', username: '...', data: defaultUserData }
};

let globalState = JSON.parse(localStorage.getItem(STORAGE_KEY) || JSON.stringify(defaultState));
// Weryfikacja i naprawa stanu
if (!globalState.users || !Array.isArray(globalState.users)) {
  globalState = defaultState;
  // Usuń stary, uszkodzony klucz
  localStorage.removeItem('trening_pro_v2'); 
  saveState();
}

// Skrót do aktualnie aktywnych danych (zwraca defaultUserData jeśli nikt nie jest zalogowany)
let state = globalState.currentUser ? globalState.users.find(u => u.id === globalState.currentUser)?.data || defaultUserData : defaultUserData;


// --- Zmienne globalne DOM ---
const panels = document.querySelectorAll('.panel');
const welcomeMsg = document.getElementById('welcomeMsg');
const dayList = document.getElementById('dayList');
const logArea = document.getElementById('logArea');
const masterTimerDisplay = document.getElementById('masterTimerDisplay');
let statsChart = null;
let currentDay = null;

// --- System Zapisywania Danych (Multi-User) ---

function saveState() {
  if (globalState.currentUser) {
    const userIndex = globalState.users.findIndex(u => u.id === globalState.currentUser);
    if (userIndex !== -1) {
      // Wyczyść interwały przed zapisem (nie mogą być serializowane)
      const dataToSave = JSON.parse(JSON.stringify(state)); 
      if (dataToSave.activeWorkout) dataToSave.activeWorkout.totalTimerInterval = null;
      if (dataToSave.restTimer) {
        dataToSave.restTimer.interval = null;
        dataToSave.restTimer.displayElement = null;
      }
      globalState.users[userIndex].data = dataToSave;
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(globalState));
}

// --- Logowanie i Użytkownicy (REQ 2) ---

function generateUserId() { return 'user_' + Date.now(); }

function renderUserList() {
  const userList = document.getElementById('userList');
  userList.innerHTML = '';
  
  if (globalState.users.length === 0) {
    userList.innerHTML = '<p style="color:var(--muted)">Brak kont. Utwórz nowe, by zacząć.</p>';
  }

  globalState.users.forEach(user => {
    const isActive = user.id === globalState.currentUser;
    const item = document.createElement('div');
    item.className = `user-item ${isActive ? 'active' : ''}`;
    item.innerHTML = `
      <span class="username-display">${user.username}</span>
      <div class="user-actions">
        <button class="btn-secondary" onclick="loginUser('${user.id}')" ${isActive ? 'disabled' : ''}>Wybierz</button>
        <button class="btn-danger btn-delete" onclick="deleteUser('${user.id}')">Usuń</button>
      </div>
    `;
    userList.appendChild(item);
  });
}

function loginUser(userId) {
  globalState.currentUser = userId;
  const user = globalState.users.find(u => u.id === userId);
  state = user.data; // Ustaw stan na dane nowego użytkownika
  saveState();
  initApp(true); // Ponowne uruchomienie aplikacji
}

function registerUser() {
  const username = document.getElementById('newUsername').value.trim();
  if (!username) { return alert('Wprowadź nazwę użytkownika.'); }
  if (globalState.users.some(u => u.username === username)) { return alert('Użytkownik o tej nazwie już istnieje.'); }

  const newUser = {
    id: generateUserId(),
    username: username,
    data: JSON.parse(JSON.stringify(defaultUserData)) // Głęboka kopia
  };

  globalState.users.push(newUser);
  document.getElementById('newUsername').value = '';
  loginUser(newUser.id);
  renderUserList();
}

function deleteUser(userId) {
  if (globalState.currentUser === userId) { return alert('Nie możesz usunąć aktualnie zalogowanego konta. Najpierw przełącz się na inne.'); }
  if (confirm(`Czy na pewno chcesz usunąć konto użytkownika "${globalState.users.find(u => u.id === userId).username}" i wszystkie jego dane?`)) {
    globalState.users = globalState.users.filter(u => u.id !== userId);
    saveState();
    renderUserList();
  }
}

document.getElementById('changeUser').onclick = () => showPanel('panel-login');
document.getElementById('resetData').onclick = () => {
  if (confirm('UWAGA: Spowoduje to usunięcie WSZYSTKICH DANYCH (wszystkich użytkowników, planów i historii) z przeglądarki. Czy kontynuować?')) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
}


// --- Główny System Nawigacji ---

function showPanel(panelId) {
  // Wymuś logowanie, jeśli nikt nie jest zalogowany
  if (!globalState.currentUser && panelId !== 'panel-login') {
    return showPanel('panel-login');
  }

  // Jeśli trening jest aktywny, wymuś pozostanie w panelu treningu
  if (state.activeWorkout.isActive && panelId !== 'panel-active-workout') {
    return alert("Najpierw zakończ aktywny trening!");
  }
  
  panels.forEach(p => p.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');

  if (panelId === 'panel-stats') {
    if (!statsChart) initStatsChart();
    updateStatsChart();
  }
}

document.querySelectorAll('.bottom-nav button').forEach(btn => {
  btn.onclick = () => showPanel(btn.dataset.panel);
});

document.getElementById('backToMainBtn').onclick = () => showPanel('panel-main');
document.getElementById('savePlanChangesBtn').onclick = () => {
  saveState();
  renderDayList(); // Aktualizacja liczby ćwiczeń na głównej liście
  showPlanDetails(currentDay);
};

// --- Ustawienia i Motyw ---

const usernameInput = document.getElementById('username');
function updateWelcome() {
  const user = globalState.users.find(u => u.id === globalState.currentUser);
  if (user) {
     usernameInput.value = user.username;
     welcomeMsg.textContent = `, ${user.username}!`;
  } else {
     usernameInput.value = '';
     welcomeMsg.textContent = '';
  }
}

usernameInput.onchange = e => { 
    const user = globalState.users.find(u => u.id === globalState.currentUser);
    if (user) {
        user.username = e.target.value;
        saveState(); 
        updateWelcome(); 
        renderUserList();
    }
}

const themeSelect = document.getElementById('themeSelect');
function applyTheme() { 
  if (globalState.currentUser) {
    document.body.classList.toggle('dark', state.theme === 'dark'); 
    themeSelect.value = state.theme;
  }
}
themeSelect.onchange = e => { state.theme = e.target.value; applyTheme(); saveState(); }


// --- Logika Planów Treningowych ---

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
    list.innerHTML = '<p style="color:var(--muted)">Brak ćwiczeń w planie. Dodaj je w edytorze.</p>';
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
        renderDayList();
      }
    };
    list.appendChild(div);
  });
}

// --- Logika Aktywnego Treningu (REQ 3, 4, 5) ---

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
    loggedSets: []
  }));

  // Wystartuj główny timer
  clearInterval(state.activeWorkout.totalTimerInterval);
  state.activeWorkout.totalTimerInterval = setInterval(updateMasterTimer, 1000);
  
  masterTimerDisplay.style.display = 'block';
  updateMasterTimer();
  renderActiveWorkout();
  showPanel('panel-active-workout');
  saveState();
}

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

    // Domyślna wartość ciężaru to ostatni użyty ciężar
    const lastWeight = ex.loggedSets.slice(-1)[0]?.weight || '';

    card.innerHTML = `
      <h3>${ex.name}</h3>
      <small>Cel: ${ex.targetSets} serie x ${ex.targetReps} powt.</small>
      
      <div class="logged-sets-list">${setsHTML}</div>
      
      <form class="log-set-form" data-ex-index="${exIndex}">
        <input type="number" class="log-weight" placeholder="Ciężar (kg)" value="${lastWeight}" required>
        <input type="number" class="log-reps" placeholder="Powtórzenia" required>
        <button type="submit" class="btn-success">Zapisz Serię</button>
      </form>
      
      <div class="rest-timer-section">
        <span class="rest-timer-display" id="rest-timer-${exIndex}">00:00</span>
        <button class="start-rest-btn btn-secondary" data-ex-index="${exIndex}" data-seconds="60">60s</button>
        <button class="start-rest-btn btn-secondary" data-ex-index="${exIndex}" data-seconds="90">90s</button>
        <button class="start-rest-btn btn-secondary" data-ex-index="${exIndex}" data-seconds="120">120s</button>
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
        e.target.querySelector('.log-reps').value = '';
        startRestTimer(exIndex, 60); // Auto-start 60s przerwy po zapisie
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

function logSet(exIndex, weight, reps) {
  state.activeWorkout.exercises[exIndex].loggedSets.push({ weight, reps });
  saveState();
  renderActiveWorkout();
}

function removeSet(exIndex, setIndex) {
  if (confirm('Usunąć tę serię?')) {
    state.activeWorkout.exercises[exIndex].loggedSets.splice(setIndex, 1);
    saveState();
    renderActiveWorkout();
  }
}

function startRestTimer(exIndex, seconds) {
  if (state.restTimer.interval) {
    clearInterval(state.restTimer.interval);
    if (state.restTimer.displayElement) {
       state.restTimer.displayElement.style.color = 'var(--accent)';
    }
  }

  const displayElement = document.getElementById(`rest-timer-${exIndex}`);
  state.restTimer.displayElement = displayElement;
  state.restTimer.secondsLeft = seconds;
  displayElement.style.color = 'var(--danger)';

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
      displayElement.textContent = "START!";
      displayElement.style.color = 'var(--success)';
    }
  }, 1000);
}

function updateMasterTimer() {
  if (!state.activeWorkout.isActive) return;
  
  const elapsedMs = Date.now() - state.activeWorkout.startTime;
  const hours = Math.floor(elapsedMs / 3600000).toString().padStart(2, '0');
  const minutes = Math.floor((elapsedMs % 3600000) / 60000).toString().padStart(2, '0');
  const seconds = Math.floor((elapsedMs % 60000) / 1000).toString().padStart(2, '0');
  
  masterTimerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
}

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
    exercises: state.activeWorkout.exercises.filter(ex => ex.loggedSets.length > 0)
  };
  state.logs.push(logEntry);

  // 3. Zresetuj stan aktywnego treningu
  state.activeWorkout = defaultUserData.activeWorkout;
  state.restTimer = defaultUserData.restTimer;

  saveState();
  renderLogs();
  renderDayList();
  showPanel('panel-main');
};

// --- Historia i Logi (REQ 1 - Szczegółowe Serie) ---

function renderLogs() {
  logArea.innerHTML = '';
  if (state.logs.length === 0) {
     logArea.innerHTML = '<p style="color:var(--muted)">Brak zapisanych treningów w historii dla tego użytkownika.</p>';
     return;
  }
  
  state.logs.slice().reverse().forEach((log) => {
    const div = document.createElement('div');
    div.className = 'card log-summary-card';

    div.innerHTML = `
      <div class="log-header">
        <span class="log-summary">
          ${log.date} - ${log.dayName} (Czas: ${log.duration})
        </span>
        <span class="log-toggle">▶</span>
      </div>
      <div class="log-details-hidden" style="display:none;">
        <p style="font-weight:bold; margin-bottom: 5px;">Ćwiczenia:</p>
        <ul style="list-style-type: none; padding-left: 0;">
          ${log.exercises.map(ex => `
            <li class="exercise-detail">
              <strong>${ex.name}</strong>
              <ul style="list-style-type: circle; margin-top: 5px; padding-left: 20px;">
                ${ex.loggedSets.map((set, setIndex) => `
                  <li>Seria ${setIndex + 1}: ${set.weight} kg x ${set.reps} powt.</li>
                `).join('')}
              </ul>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    logArea.appendChild(div);
  });
  
  // Logika rozwijania/zwijania
  document.querySelectorAll('.log-summary-card').forEach(card => {
    card.querySelector('.log-header').onclick = () => {
      const details = card.querySelector('.log-details-hidden');
      const toggle = card.querySelector('.log-toggle');
      const isHidden = details.style.display === 'none';
      
      details.style.display = isHidden ? 'block' : 'none';
      toggle.textContent = isHidden ? '▼' : '▶';
    };
  });
}

// --- Import/Eksport ---
document.getElementById('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state.logs)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${globalState.users.find(u => u.id === globalState.currentUser)?.username || 'user'}_trening_logs_v4.json`; a.click();
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
  if (confirm('Wyczyścić całą historię treningów dla bieżącego użytkownika?')) {
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
function initApp(isReload = false) {
  // Jeśli nikt nie jest zalogowany
  if (!globalState.currentUser) {
    renderUserList();
    applyTheme(); // Ustawienia motywu (domyślnie jasny)
    return showPanel('panel-login');
  } 

  // Użytkownik jest zalogowany
  const user = globalState.users.find(u => u.id === globalState.currentUser);
  state = user.data;
  
  // Wyczyść ewentualne pozostałe interwały JS
  if (state.activeWorkout.totalTimerInterval) clearInterval(state.activeWorkout.totalTimerInterval);
  if (state.restTimer.interval) clearInterval(state.restTimer.interval);

  // Sprawdzenie wznowienia treningu
  if (state.activeWorkout.isActive) {
    if (confirm("Wykryto niezakończony trening. Chcesz go wznowić?")) {
      state.activeWorkout.totalTimerInterval = setInterval(updateMasterTimer, 1000);
      masterTimerDisplay.style.display = 'block';
      renderActiveWorkout();
      showPanel('panel-active-workout');
    } else {
      state.activeWorkout = defaultUserData.activeWorkout;
      state.restTimer = defaultUserData.restTimer;
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
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('registerUserBtn').onclick = registerUser;
    
    initApp();
});
