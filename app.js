// Konfiguracja Firebase jest w index.html (zmienne auth i db są globalne).

// --- Struktury Danych i Stany ---

const defaultUserState = {
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
    "exercises": []
  }
};

let state = JSON.parse(JSON.stringify(defaultUserState)); // Aktualny stan użytkownika
let currentUserId = null;
let currentUserEmail = null;
let masterTimerInterval = null; // Interwał globalnego timera
let restTimerInterval = null; // Interwał timera odpoczynku
let currentRestDisplay = null; // Element DOM timera odpoczynku

// --- Zmienne globalne DOM ---
const panels = document.querySelectorAll('.panel');
const welcomeMsg = document.getElementById('welcomeMsg');
const dayList = document.getElementById('dayList');
const logArea = document.getElementById('logArea');
const masterTimerDisplay = document.getElementById('masterTimerDisplay');
const authError = document.getElementById('authError');
let statsChart = null;
let currentDay = null;

// --- Obsługa Bazy Danych (Firebase) ---

/** Zwraca referencję do danych zalogowanego użytkownika w bazie Firebase. */
function getDbRef() {
    if (!currentUserId) return null;
    // Ścieżka: users/[UID_Użytkownika]/data
    return db.ref('users/' + currentUserId + '/data');
}

/** * Zapisuje aktualny stan 'state' do Firebase. 
 * Używamy db.ref().set() zamiast update, aby nadpisać cały obiekt stanu.
 */
async function saveState() {
    const dbRef = getDbRef();
    if (!dbRef) {
        console.error("Błąd: Brak referencji do bazy danych. Użytkownik niezalogowany.");
        return;
    }

    // Klonowanie stanu
    const stateToSave = JSON.parse(JSON.stringify(state)); 

    try {
        await dbRef.set(stateToSave);
    } catch (error) {
        console.error("Błąd zapisu danych do Firebase:", error);
        // W produkcyjnej aplikacji można by pokazać modal z błędem zapisu
    }
}

/** * Wczytuje stan z Firebase po zalogowaniu i inicjuje aplikację. 
 */
async function loadState(userId, email) {
    currentUserId = userId;
    currentUserEmail = email;
    const dbRef = getDbRef();
    if (!dbRef) return;

    try {
        const snapshot = await dbRef.once('value');
        const userData = snapshot.val();
        
        if (userData) {
            // Użyj wczytanych danych
            state = userData;
        } else {
            // Pierwsze logowanie - ustaw domyślny stan i zapisz go
            state = JSON.parse(JSON.stringify(defaultUserState));
            await saveState(); 
        }

        // Kontynuuj inicjalizację aplikacji po wczytaniu danych
        initAppUI();
    } catch (error) {
        console.error("Błąd wczytywania danych z Firebase:", error);
        // Jeśli błąd wczytywania, nie wylogowujemy, ale używamy domyślnego stanu
        initAppUI(); 
    }
}

// --- Autoryzacja i Logowanie (Firebase Auth) ---

document.getElementById('loginBtn').onclick = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    authError.textContent = '';
    
    if (!email || !password) {
        return authError.textContent = "Wprowadź e-mail i hasło.";
    }

    try {
        document.getElementById('loginBtn').disabled = true;
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        // Listener onAuthStateChanged przejmie kontrolę
    } catch (error) {
        let message = "Wystąpił błąd logowania.";
        if (error.code === 'auth/user-not-found') {
            message = "Brak konta z tym e-mailem. Zarejestruj się.";
        } else if (error.code === 'auth/wrong-password') {
            message = "Nieprawidłowe hasło.";
        } else if (error.code === 'auth/too-many-requests') {
            message = "Zbyt wiele prób. Spróbuj później.";
        } else {
             message = `Błąd: ${error.message}`;
        }
        authError.textContent = message;
    } finally {
        document.getElementById('loginBtn').disabled = false;
    }
};

document.getElementById('registerBtn').onclick = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    authError.textContent = '';

    if (!email || password.length < 6) {
        return authError.textContent = "E-mail jest wymagany, a hasło musi mieć min. 6 znaków.";
    }

    try {
        document.getElementById('registerBtn').disabled = true;
        // Rejestracja i automatyczne logowanie
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        // Listener onAuthStateChanged przejmie kontrolę
    } catch (error) {
        let message = "Błąd rejestracji.";
        if (error.code === 'auth/email-already-in-use') {
            message = "Ten e-mail jest już zajęty. Spróbuj się zalogować.";
        } else if (error.code === 'auth/weak-password') {
             message = "Hasło jest za słabe (min. 6 znaków).";
        } else {
             message = `Błąd: ${error.message}`;
        }
        authError.textContent = message;
    } finally {
         document.getElementById('registerBtn').disabled = false;
    }
};

document.getElementById('logoutBtn').onclick = async () => {
    // Używamy alert zamiast confirm, by nie blokować iframa
    const modal = document.createElement('div');
    modal.className = 'modal-confirm';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100; text-align: center;';
    modal.innerHTML = `
        <p>Czy na pewno chcesz się wylogować?</p>
        <button id="modalConfirmYes" class="btn-danger" style="margin-right: 10px;">Tak</button>
        <button id="modalConfirmNo" class="btn-secondary">Nie</button>
    `;
    document.body.appendChild(modal);

    document.getElementById('modalConfirmYes').onclick = async () => {
        modal.remove();
        // Zakończenie timerów
        if (masterTimerInterval) clearInterval(masterTimerInterval);
        if (restTimerInterval) clearInterval(restTimerInterval);
        
        masterTimerDisplay.style.display = 'none';
        
        await auth.signOut();
    };
    document.getElementById('modalConfirmNo').onclick = () => {
        modal.remove();
    };
};

// --- Główny Listener Firebase (Uruchomienie Aplikacji) ---

auth.onAuthStateChanged(user => {
    if (user) {
        // Użytkownik ZALOGOWANY
        document.getElementById('loggedUserEmail').textContent = user.email;
        document.getElementById('authEmail').value = ''; // Wyczyść formularz
        document.getElementById('authPassword').value = ''; 
        loadState(user.uid, user.email);
    } else {
        // Użytkownik WYLOWOGANY
        currentUserId = null;
        currentUserEmail = null;
        state = JSON.parse(JSON.stringify(defaultUserState)); // Wyczyść stan lokalny
        showPanel('panel-auth'); // Pokaż panel logowania
        updateWelcome();
        // Wyłącz timer, jeśli został
        if (masterTimerInterval) clearInterval(masterTimerInterval);
        if (restTimerInterval) clearInterval(restTimerInterval);
    }
});

// --- Funkcja inicjalizująca interfejs (po zalogowaniu) ---

function initAppUI() {
    // 1. Sprawdzenie wznowienia treningu
    if (state.activeWorkout.isActive) {
        // Upewnij się, że stary interwał nie działa
        if (masterTimerInterval) clearInterval(masterTimerInterval); 
        
        // Zastąpienie window.confirm() modalem
        const modal = document.createElement('div');
        modal.className = 'modal-confirm';
        modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100; text-align: center;';
        modal.innerHTML = `
            <p>Wykryto niezakończony trening. Chcesz go wznowić?</p>
            <button id="modalConfirmYes" class="btn-success" style="margin-right: 10px;">Wznów</button>
            <button id="modalConfirmNo" class="btn-secondary">Anuluj</button>
        `;
        document.body.appendChild(modal);

        document.getElementById('modalConfirmYes').onclick = () => {
            modal.remove();
            masterTimerInterval = setInterval(updateMasterTimer, 1000);
            masterTimerDisplay.style.display = 'block';
            renderActiveWorkout();
            showPanel('panel-active-workout');
        };

        document.getElementById('modalConfirmNo').onclick = async () => {
            modal.remove();
            // Anuluj trening (zresetuj, zapisz do chmury i zacznij normalnie)
            state.activeWorkout = defaultUserState.activeWorkout;
            await saveState(); 
            showPanel('panel-main');
        };

    } else {
        // Jeśli nie ma aktywnego treningu, pokaż główny panel
        showPanel('panel-main');
    }

    // 2. Renderowanie UI
    updateWelcome();
    applyTheme();
    renderDayList();
    renderLogs();
    // Chart zostanie zainicjowany przy pierwszym wejściu do panel-stats
}

// --- Nawigacja ---

function showPanel(panelId) {
  // Wymuś logowanie, jeśli panel nie jest panelem autoryzacji
  if (!currentUserId && panelId !== 'panel-auth') {
    return showPanel('panel-auth');
  }

  // Wymuś pozostanie w aktywnym treningu
  if (state.activeWorkout.isActive && panelId !== 'panel-active-workout') {
    // Używamy własnego komunikatu zamiast alert()
    const modal = document.createElement('div');
    modal.className = 'modal-message';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:var(--card);border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100; color: var(--text);';
    modal.innerHTML = '<strong>Najpierw zakończ aktywny trening!</strong>';
    document.body.appendChild(modal);
    setTimeout(() => modal.remove(), 2000);
    return;
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
  renderDayList();
  showPlanDetails(currentDay);
};


// --- Ustawienia i Motyw ---

function updateWelcome() {
    // Wyświetla imię użytkownika (część e-maila przed @) lub nic
    welcomeMsg.textContent = currentUserEmail ? `, ${currentUserEmail.split('@')[0]}!` : '';
}

const themeSelect = document.getElementById('themeSelect');
function applyTheme() { 
  document.body.classList.toggle('dark', state.theme === 'dark'); 
  themeSelect.value = state.theme;
}

themeSelect.onchange = e => { 
    state.theme = e.target.value; 
    applyTheme(); 
    saveState(); 
}

// --- Logika Planów Treningowych ---

function renderDayList() {
  dayList.innerHTML = '';
  // Iterujemy po domyślnych kluczach planów
  Object.keys(defaultUserState.plans).forEach(dayName => {
    // Upewniamy się, że plan dla danego dnia istnieje w bieżącym stanie
    const plan = state.plans[dayName] || [];

    const btn = document.createElement('button');
    btn.className = 'day-btn';
    btn.textContent = `${dayName} (${plan.length} ćw.)`;
    btn.onclick = () => showPlanDetails(dayName);
    dayList.appendChild(btn);
  });
}

function showPlanDetails(dayName) {
  currentDay = dayName;
  document.getElementById('planDetailsTitle').textContent = `Plan: ${dayName}`;
  const list = document.getElementById('planDetailsList');
  list.innerHTML = '';

  const plan = state.plans[dayName] || [];

  if (plan.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Brak ćwiczeń w planie. Dodaj je w edytorze.</p>';
  }

  plan.forEach(ex => {
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

    // Zastąpienie alert() modalem
    if (!name || sets < 1 || reps < 1) {
        const modal = document.createElement('div');
        modal.className = 'modal-message';
        modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100;';
        modal.innerHTML = '<strong>Wypełnij wszystkie pola poprawnymi wartościami (min. 1).</strong>';
        document.body.appendChild(modal);
        setTimeout(() => modal.remove(), 2000);
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
      // Zastąpienie confirm() modalem
      const modal = document.createElement('div');
      modal.className = 'modal-confirm';
      modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100; text-align: center;';
      modal.innerHTML = `
          <p>Usunąć "${ex.name}" z planu?</p>
          <button id="modalConfirmYes" class="btn-danger" style="margin-right: 10px;">Tak</button>
          <button id="modalConfirmNo" class="btn-secondary">Nie</button>
      `;
      document.body.appendChild(modal);

      document.getElementById('modalConfirmYes').onclick = () => {
        modal.remove();
        state.plans[currentDay].splice(index, 1);
        saveState();
        renderEditPlanList();
        renderDayList();
      };
      document.getElementById('modalConfirmNo').onclick = () => {
        modal.remove();
      };
    };
    list.appendChild(div);
  });
}

// --- Logika Aktywnego Treningu ---

function startWorkout(dayName) {
  const plan = state.plans[dayName] || [];

  // Zastąpienie alert() modalem
  if (plan.length === 0) {
    const modal = document.createElement('div');
    modal.className = 'modal-message';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100;';
    modal.innerHTML = '<strong>Ten plan jest pusty. Najpierw dodaj ćwiczenia, aby zacząć.</strong>';
    document.body.appendChild(modal);
    setTimeout(() => modal.remove(), 3000);
    return;
  }
  
  // Zastąpienie confirm() modalem
  const modal = document.createElement('div');
  modal.className = 'modal-confirm';
  modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100; text-align: center;';
  modal.innerHTML = `
      <p>Rozpocząć trening: ${dayName}?</p>
      <button id="modalConfirmYes" class="btn-success" style="margin-right: 10px;">Start</button>
      <button id="modalConfirmNo" class="btn-secondary">Anuluj</button>
  `;
  document.body.appendChild(modal);

  document.getElementById('modalConfirmYes').onclick = () => {
    modal.remove();
    state.activeWorkout.isActive = true;
    state.activeWorkout.dayName = dayName;
    state.activeWorkout.startTime = Date.now();
    state.activeWorkout.exercises = plan.map(ex => ({
        ...ex,
        loggedSets: []
    }));

    // Wystartuj główny timer
    if (masterTimerInterval) clearInterval(masterTimerInterval);
    masterTimerInterval = setInterval(updateMasterTimer, 1000);
    
    masterTimerDisplay.style.display = 'block';
    updateMasterTimer();
    renderActiveWorkout();
    showPanel('panel-active-workout');
    saveState();
  };
  document.getElementById('modalConfirmNo').onclick = () => {
    modal.remove();
  };
}

function renderActiveWorkout() {
  document.getElementById('activeWorkoutTitle').textContent = `Trening: ${state.activeWorkout.dayName}`;
  const list = document.getElementById('activeWorkoutList');
  list.innerHTML = '';

  state.activeWorkout.exercises.forEach((ex, exIndex) => {
    const card = document.createElement('div');
    card.className = 'workout-card';

    let setsHTML = ex.loggedSets.map((set, setIndex) => `
      <div class="logged-set" data-set-index="${setIndex}">
        <span class="set-number">Seria ${setIndex + 1}:</span>
        <span class="set-data">${set.weight} kg x ${set.reps} powt.</span>
        <span class="set-remove" data-ex-index="${exIndex}" data-set-index="${setIndex}">[x]</span>
      </div>
    `).join('');

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

  list.querySelectorAll('.log-set-form').forEach(form => {
    form.onsubmit = (e) => {
      e.preventDefault();
      const exIndex = e.target.dataset.exIndex;
      const weightInput = e.target.querySelector('.log-weight');
      const repsInput = e.target.querySelector('.log-reps');
      
      const weight = weightInput.value;
      const reps = repsInput.value;
      
      if (weight && reps && +weight >= 0 && +reps >= 1) {
        logSet(exIndex, +weight, +reps);
        repsInput.value = ''; // Wyczyść tylko pole powtórzeń
        startRestTimer(exIndex, 60); // Standardowy timer 60s
      } else {
        // Zastąpienie alert() modalem
        const modal = document.createElement('div');
        modal.className = 'modal-message';
        modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100;';
        modal.innerHTML = '<strong>Podaj poprawne wartości dla ciężaru (min. 0) i powtórzeń (min. 1).</strong>';
        document.body.appendChild(modal);
        setTimeout(() => modal.remove(), 3000);
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
    // Zastąpienie confirm() modalem
    const modal = document.createElement('div');
    modal.className = 'modal-confirm';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100; text-align: center;';
    modal.innerHTML = `
        <p>Usunąć tę serię?</p>
        <button id="modalConfirmYes" class="btn-danger" style="margin-right: 10px;">Tak</button>
        <button id="modalConfirmNo" class="btn-secondary">Nie</button>
    `;
    document.body.appendChild(modal);

    document.getElementById('modalConfirmYes').onclick = () => {
        modal.remove();
        state.activeWorkout.exercises[exIndex].loggedSets.splice(setIndex, 1);
        saveState();
        renderActiveWorkout();
    };
    document.getElementById('modalConfirmNo').onclick = () => {
        modal.remove();
    };
}

function startRestTimer(exIndex, seconds) {
  // 1. Zakończ poprzedni interwał
  if (restTimerInterval) {
    clearInterval(restTimerInterval);
    if (currentRestDisplay) {
       currentRestDisplay.style.color = 'var(--accent)'; // Reset koloru starego timera
    }
  }

  // 2. Ustaw nowy timer
  const displayElement = document.getElementById(`rest-timer-${exIndex}`);
  currentRestDisplay = displayElement;
  let secondsLeft = seconds;
  displayElement.style.color = 'var(--danger)'; // Kolor czerwony podczas odliczania

  const updateDisplay = () => {
    const mins = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
    const secs = (secondsLeft % 60).toString().padStart(2, '0');
    displayElement.textContent = `${mins}:${secs}`;
  };
  updateDisplay();

  restTimerInterval = setInterval(() => {
    secondsLeft--;
    updateDisplay();

    if (secondsLeft <= 0) {
      clearInterval(restTimerInterval);
      restTimerInterval = null;
      displayElement.textContent = "START!";
      displayElement.style.color = 'var(--success)'; // Kolor zielony po zakończeniu
    }
  }, 1000);
}

function updateMasterTimer() {
  if (!state.activeWorkout.isActive || !state.activeWorkout.startTime) {
    if (masterTimerInterval) clearInterval(masterTimerInterval);
    return;
  }
  
  const elapsedMs = Date.now() - state.activeWorkout.startTime;
  const hours = Math.floor(elapsedMs / 3600000).toString().padStart(2, '0');
  const minutes = Math.floor((elapsedMs % 3600000) / 60000).toString().padStart(2, '0');
  const seconds = Math.floor((elapsedMs % 60000) / 1000).toString().padStart(2, '0');
  
  masterTimerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
}

document.getElementById('finishWorkoutBtn').onclick = () => {
    // Zastąpienie confirm() modalem
    const modal = document.createElement('div');
    modal.className = 'modal-confirm';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100; text-align: center;';
    modal.innerHTML = `
        <p>Zakończyć i zapisać ten trening?</p>
        <button id="modalConfirmYes" class="btn-danger" style="margin-right: 10px;">Zapisz</button>
        <button id="modalConfirmNo" class="btn-secondary">Anuluj</button>
    `;
    document.body.appendChild(modal);

    document.getElementById('modalConfirmYes').onclick = () => {
        modal.remove();

        // 1. Zakończenie timerów
        if (masterTimerInterval) clearInterval(masterTimerInterval);
        if (restTimerInterval) clearInterval(restTimerInterval);
        
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
        state.activeWorkout = defaultUserState.activeWorkout;

        saveState();
        renderLogs();
        renderDayList();
        showPanel('panel-main');
    };
    document.getElementById('modalConfirmNo').onclick = () => {
        modal.remove();
    };
};

// --- Historia i Logi ---

function renderLogs() {
  logArea.innerHTML = '';
  if (state.logs.length === 0) {
     logArea.innerHTML = '<p style="color:var(--muted)">Brak zapisanych treningów w historii.</p>';
     return;
  }
  
  // Odwracanie kolejności, aby najnowsze były na górze
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
  
  // Obsługa rozwijania szczegółów
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

// --- Import/Eksport i czyszczenie danych ---

document.getElementById('exportBtn').onclick = () => {
    // Zastąpienie alert() modalem
    if (!state.logs || state.logs.length === 0) {
        const modal = document.createElement('div');
        modal.className = 'modal-message';
        modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100;';
        modal.innerHTML = '<strong>Brak danych do eksportu.</strong>';
        document.body.appendChild(modal);
        setTimeout(() => modal.remove(), 3000);
        return;
    }
    
    const blob = new Blob([JSON.stringify(state.logs)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${currentUserEmail.split('@')[0]}_trening_logs_v5.json`; a.click();
}
document.getElementById('importBtn').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const importedLogs = JSON.parse(reader.result);
      if (Array.isArray(importedLogs)) {
        state.logs = importedLogs; 
        await saveState(); // Zapisz zaimportowane dane do chmury
        renderLogs(); 
        // Zastąpienie alert() modalem
        const modal = document.createElement('div');
        modal.className = 'modal-message';
        modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100;';
        modal.innerHTML = '<strong>Zaimportowano dane do chmury.</strong>';
        document.body.appendChild(modal);
        setTimeout(() => modal.remove(), 3000);

        updateStatsChart();
      } else { 
        // Zastąpienie alert() modalem
        const modal = document.createElement('div');
        modal.className = 'modal-message';
        modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100;';
        modal.innerHTML = '<strong>Nieprawidłowy format pliku JSON.</strong>';
        document.body.appendChild(modal);
        setTimeout(() => modal.remove(), 3000);
      }
    } catch (err) { 
        // Zastąpienie alert() modalem
        const modal = document.createElement('div');
        modal.className = 'modal-message';
        modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100;';
        modal.innerHTML = `<strong>Błąd podczas odczytu pliku: ${err.message}</strong>`;
        document.body.appendChild(modal);
        setTimeout(() => modal.remove(), 3000);
    }
  }
  reader.readAsText(file);
}
document.getElementById('clearHistory').onclick = () => {
    // Zastąpienie confirm() modalem
    const modal = document.createElement('div');
    modal.className = 'modal-confirm';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;background:white;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);z-index:100; text-align: center;';
    modal.innerHTML = `
        <p>Wyczyścić całą historię treningów dla Twojego konta? Dane te zostaną usunięte z chmury!</p>
        <button id="modalConfirmYes" class="btn-danger" style="margin-right: 10px;">Tak, wyczyść</button>
        <button id="modalConfirmNo" class="btn-secondary">Nie</button>
    `;
    document.body.appendChild(modal);

    document.getElementById('modalConfirmYes').onclick = () => {
        modal.remove();
        state.logs = []; 
        saveState(); 
        renderLogs(); 
        updateStatsChart();
    };
    document.getElementById('modalConfirmNo').onclick = () => {
        modal.remove();
    };
}

// --- Statystyki ---
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
    
    // Obliczanie objętości (ciężar * powtórzenia) dla wszystkich serii w treningu
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

  // Sortowanie dat i przygotowanie danych do wykresu
  const sortedDates = Object.keys(volumeByDate).sort();
  statsChart.data.labels = sortedDates;
  statsChart.data.datasets[0].data = sortedDates.map(date => volumeByDate[date]);
  statsChart.update();
}

// --- Start Aplikacji ---
document.addEventListener('DOMContentLoaded', () => {
    // Na start, wymuś pokazanie panelu logowania
    showPanel('panel-auth');
});
