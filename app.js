// Używa globalnych zmiennych 'auth', 'db', 'app', 'IS_FIREBASE_CONFIGURED' zainicjowanych w index.html

// --- Struktury Danych i Stany ---

const STORAGE_KEY = 'trening_pro_state';

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
let masterTimerInterval = null; 
let restTimerInterval = null; 
let currentRestDisplay = null; 

// --- Zmienne globalne DOM ---
const panels = document.querySelectorAll('.panel');
const welcomeMsg = document.getElementById('welcomeMsg');
const dayList = document.getElementById('dayList');
const logArea = document.getElementById('logArea');
const masterTimerDisplay = document.getElementById('masterTimerDisplay');
const authError = document.getElementById('authError');
const loggedUserEmailDisplay = document.getElementById('loggedUserEmailDisplay');
const currentAuthStatus = document.getElementById('currentAuthStatus');
const authForm = document.getElementById('authForm');
const logoutBtn = document.getElementById('logoutBtn');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');


let statsChart = null;
let currentDay = null;


// --- Funkcje pomocnicze UI (Modale) ---

function showErrorModal(message, type = 'error') {
    const modal = document.createElement('div');
    modal.className = 'modal-message';
    
    const bgColor = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--accent)';
    modal.style.background = bgColor;
    modal.innerHTML = `<strong>${message}</strong>`;
    
    document.body.appendChild(modal);
    setTimeout(() => modal.remove(), 3000);
}

function showConfirmModal(message, onConfirm, onCancel = () => {}) {
    const modal = document.createElement('div');
    modal.className = 'modal-confirm';
    modal.innerHTML = `
        <p>${message}</p>
        <div class="button-row" style="margin-bottom: 0;">
            <button id="modalConfirmYes" class="btn-success" style="margin-right: 10px;">Tak</button>
            <button id="modalConfirmNo" class="btn-secondary">Nie</button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('modalConfirmYes').onclick = () => {
        modal.remove();
        onConfirm();
    };
    document.getElementById('modalConfirmNo').onclick = () => {
        modal.remove();
        onCancel();
    };
}


// --- Obsługa Zapisywania Danych (Firebase lub LocalStorage) ---

/** Zwraca referencję do danych zalogowanego użytkownika w bazie Firebase. */
function getDbRef() {
    if (!currentUserId || !db) return null;
    // Ścieżka: /artifacts/{appId}/users/{userId}/data
    return db.ref(`artifacts/${appId}/users/${currentUserId}/data`);
}

/** Zapisuje aktualny stan 'state' do Firebase lub LocalStorage. */
async function saveState() {
    // Tryb Firebase
    if (window.IS_FIREBASE_CONFIGURED) {
        const dbRef = getDbRef();
        if (!dbRef) return; 

        const stateToSave = JSON.parse(JSON.stringify(state)); 

        try {
            await dbRef.set(stateToSave);
            console.log("Stan zapisany pomyślnie do Firebase.");
        } catch (error) {
            console.error("Błąd zapisu danych do Firebase:", error);
            showErrorModal("Błąd zapisu danych do chmury.", 'error');
        }
    // Tryb LocalStorage (Fallback)
    } else {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            console.log("Stan zapisany pomyślnie do LocalStorage.");
        } catch (error) {
            console.error("Błąd zapisu danych do LocalStorage:", error);
        }
    }
}

/** Wczytuje stan po zalogowaniu (Firebase) lub z pamięci lokalnej (Local). */
async function loadState(userId, email) {
    currentUserId = userId;
    currentUserEmail = email;
    loggedUserEmailDisplay.textContent = email; 
    
    // Uaktualnij status w panelu auth
    currentAuthStatus.textContent = `Jesteś zalogowany jako: ${email}`;
    authForm.style.display = 'none';
    logoutBtn.style.display = 'block';

    // Wczytywanie z Firebase
    if (window.IS_FIREBASE_CONFIGURED) {
        const dbRef = getDbRef();
        if (!dbRef) { initAppUI(); return; }

        try {
            const snapshot = await dbRef.once('value');
            const userData = snapshot.val();
            
            if (userData) {
                state = { ...defaultUserState, ...userData };
                state.plans = { ...defaultUserState.plans, ...(userData.plans || {}) };
            } else {
                state = JSON.parse(JSON.stringify(defaultUserState));
                await saveState(); 
            }
        } catch (error) {
            console.error("Błąd wczytywania danych z Firebase:", error);
            showErrorModal("Błąd wczytywania danych z chmury.", 'error');
        }
    // Wczytywanie z LocalStorage
    } else {
        try {
            const localData = localStorage.getItem(STORAGE_KEY);
            if (localData) {
                const userData = JSON.parse(localData);
                state = { ...defaultUserState, ...userData };
                state.plans = { ...defaultUserState.plans, ...(userData.plans || {}) };
            } else {
                state = JSON.parse(JSON.stringify(defaultUserState));
                saveState();
            }
            // Zablokuj przyciski logowania/rejestracji w trybie lokalnym
            loginBtn.style.display = 'none';
            registerBtn.style.display = 'none';
            logoutBtn.style.display = 'none';
            authForm.style.display = 'none';
            currentAuthStatus.textContent = 'Status: Tryb Lokalny (Dane zapisane w przeglądarce)';
            loggedUserEmailDisplay.textContent = 'Tryb Lokalny';

        } catch (error) {
            console.error("Błąd wczytywania danych z LocalStorage:", error);
        }
    }
    
    // Kontynuuj inicjalizację aplikacji po wczytaniu danych
    initAppUI();
}

// --- Autoryzacja i Logowanie (Firebase Auth) ---

loginBtn.onclick = async () => {
    if (!window.IS_FIREBASE_CONFIGURED) { showErrorModal("Logowanie jest niedostępne w trybie lokalnym.", 'info'); return; }
    
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    authError.textContent = '';
    // ... (pozostała logika logowania Firebase jest taka sama)
    if (!email || !password) { return authError.textContent = "Wprowadź e-mail i hasło."; }
    try {
        loginBtn.disabled = true;
        registerBtn.disabled = true;
        await auth.signInWithEmailAndPassword(email, password);
        showErrorModal("Zalogowano pomyślnie!", 'success');
    } catch (error) {
        let message = "Wystąpił błąd logowania. Spróbuj ponownie.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            message = "Nieprawidłowy e-mail lub hasło.";
        } else if (error.code === 'auth/too-many-requests') {
            message = "Zbyt wiele prób. Spróbuj później.";
        } else {
             message = `Błąd: ${error.message}`;
        }
        authError.textContent = message;
    } finally {
        loginBtn.disabled = false;
        registerBtn.disabled = false;
    }
};

registerBtn.onclick = async () => {
    if (!window.IS_FIREBASE_CONFIGURED) { showErrorModal("Rejestracja jest niedostępna w trybie lokalnym.", 'info'); return; }

    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    authError.textContent = '';

    if (!email || password.length < 6) { return authError.textContent = "E-mail jest wymagany, a hasło musi mieć min. 6 znaków."; }

    try {
        loginBtn.disabled = true;
        registerBtn.disabled = true;
        
        await auth.createUserWithEmailAndPassword(email, password);
        
        showErrorModal("Rejestracja udana! Zostałeś automatycznie zalogowany.", 'success');
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
         loginBtn.disabled = false;
         registerBtn.disabled = false;
    }
};

logoutBtn.onclick = async () => {
    showConfirmModal("Czy na pewno chcesz się wylogować?", async () => {
        if (masterTimerInterval) clearInterval(masterTimerInterval);
        if (restTimerInterval) clearInterval(restTimerInterval);
        masterTimerDisplay.style.display = 'none';
        
        if (window.IS_FIREBASE_CONFIGURED && auth) {
            await auth.signOut();
        }
    });
};

// --- Główny Listener Firebase (Uruchomienie Aplikacji) ---

document.addEventListener('DOMContentLoaded', () => {
  if (window.IS_FIREBASE_CONFIGURED) {
    // TRYB FIREBASE: Logika uwierzytelniania email/hasło
    
    // 1. Spróbuj zalogować custom tokenem (wymóg środowiska Canvas)
    if (__initial_auth_token) {
        auth.signInWithCustomToken(__initial_auth_token)
            .then(userCredential => console.log("Canvas initial sign-in successful:", userCredential.user.uid))
            .catch(error => {
                console.warn("Canvas custom token sign-in failed. Signing in anonymously.", error.message);
                auth.signInAnonymously().catch(anonError => console.error("Anonymous sign-in failed:", anonError));
            });
    } else {
        // 2. Jeśli brak tokena, zaloguj anonimowo, aby mieć ID do bazy
        auth.signInAnonymously().catch(anonError => console.error("Anonymous sign-in failed:", anonError));
    }

    // 3. Główny listener do zarządzania stanem użytkownika
    auth.onAuthStateChanged(user => {
        authError.textContent = ''; 
        
        // Jeśli jest email, to jest to zalogowany użytkownik (w przeciwieństwie do anonimowego)
        if (user && user.email) {
            // Zalogowany użytkownik
            loadState(user.uid, user.email);
            showPanel('panel-main');
        } else if (user && user.isAnonymous) {
            // Anonimowy użytkownik (tylko w celu utrzymania sesji i dostępu do DB w Firebase)
            currentAuthStatus.textContent = 'Status: Zalogowany Anonimowo. Zaloguj się, aby zapisać dane na stałe.';
            loggedUserEmailDisplay.textContent = 'Anonimowy';
            authForm.style.display = 'block';
            logoutBtn.style.display = 'none';
            loadState(user.uid, 'Anonimowy'); // Wczytaj stan anonimowy
            showPanel('panel-auth');
        } else {
             // Wylogowany stan
            currentUserId = null;
            currentUserEmail = null;
            state = JSON.parse(JSON.stringify(defaultUserState)); 
            loggedUserEmailDisplay.textContent = 'Wylogowany';
            currentAuthStatus.textContent = 'Status: Wylogowany. Zaloguj się, aby kontynuować.';
            authForm.style.display = 'block';
            logoutBtn.style.display = 'none';
            if (masterTimerInterval) clearInterval(masterTimerInterval);
            if (restTimerInterval) clearInterval(restTimerInterval);
            masterTimerDisplay.style.display = 'none';
            showPanel('panel-auth'); 
        }
    });

  } else {
      // TRYB LOCAL STORAGE: Pomiń całą autoryzację i przejdź bezpośrednio do loadState
      currentAuthStatus.textContent = 'Brak konfiguracji Firebase.';
      authError.textContent = "Aplikacja przełącza się na tryb Lokalny. Dane będą zapisywane tylko w przeglądarce.";
      // W trybie lokalnym loadState jest wywoływany natychmiast
      loadState('local_user', 'Tryb Lokalny');
  }
});


// --- Funkcja inicjalizująca interfejs (po zalogowaniu/wczytaniu) ---

function initAppUI() {
    // 1. Sprawdzenie wznowienia treningu
    if (state.activeWorkout.isActive) {
        if (masterTimerInterval) clearInterval(masterTimerInterval); 
        
        showConfirmModal("Wykryto niezakończony trening. Chcesz go wznowić?", () => {
            masterTimerInterval = setInterval(updateMasterTimer, 1000);
            masterTimerDisplay.style.display = 'block';
            renderActiveWorkout();
            showPanel('panel-active-workout');
        }, () => {
            state.activeWorkout = defaultUserState.activeWorkout;
            saveState(); 
            showPanel('panel-main');
        });

    } else {
        showPanel('panel-main');
    }

    // 2. Renderowanie UI
    updateWelcome();
    applyTheme();
    renderDayList();
    renderLogs();
}

// --- Nawigacja ---

function showPanel(panelId) {
  // Wymuś logowanie, jeśli panel nie jest panelem autoryzacji
  // W trybie lokalnym nie wymuszamy logowania
  if (!currentUserId && panelId !== 'panel-auth' && window.IS_FIREBASE_CONFIGURED) {
    if (document.getElementById('panel-auth').classList.contains('active')) {
        return;
    }
    showErrorModal("Musisz być zalogowany, aby korzystać z tej sekcji.", 'info');
    return showPanel('panel-auth'); 
  }

  // Wymuś pozostanie w aktywnym treningu
  if (state.activeWorkout.isActive && panelId !== 'panel-active-workout' && panelId !== 'panel-auth') {
    showErrorModal('Najpierw zakończ aktywny trening!', 'info');
    return;
  }
  
  panels.forEach(p => p.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');

  // Podświetl aktywny przycisk nawigacji
  document.querySelectorAll('.bottom-nav button').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.panel === panelId) {
          btn.classList.add('active');
      }
  });


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
    // Wyświetla imię użytkownika (część e-maila przed @)
    const emailPart = currentUserEmail ? currentUserEmail.split('@')[0] : '';
    welcomeMsg.textContent = emailPart && emailPart !== 'local' && emailPart !== 'Anonimowy' ? `, ${emailPart}!` : '';
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
    btn.innerHTML = `<span>${dayName}</span><span>(${plan.length} ćw.)</span>`;
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
    list.innerHTML = '<p style="color:var(--muted); text-align: center;">Brak ćwiczeń w planie. Dodaj je w edytorze.</p>';
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
    const name = document.getElementById('exName').value.trim();
    const sets = +document.getElementById('exTargetSets').value;
    const reps = +document.getElementById('exTargetReps').value;

    if (!name || sets < 1 || reps < 1) {
        showErrorModal("Wypełnij wszystkie pola poprawnymi wartościami (min. 1).");
        return;
    }

    // Upewnienie się, że plan dla tego dnia istnieje
    if (!state.plans[dayName]) {
        state.plans[dayName] = [];
    }

    state.plans[dayName].push({ name: name, targetSets: sets, targetReps: reps });
    saveState();
    renderEditPlanList();
    document.getElementById('exName').value = '';
    document.getElementById('exTargetSets').value = '3';
    document.getElementById('exTargetReps').value = '10';
  };

  showPanel('panel-edit-plan');
}

function renderEditPlanList() {
  const list = document.getElementById('editPlanList');
  list.innerHTML = '';
  const plan = state.plans[currentDay] || [];

  plan.forEach((ex, index) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div>
        <strong>${ex.name}</strong><br>
        <span>Cel: ${ex.targetSets} x ${ex.targetReps}</span>
      </div>
      <button class="btn-danger" data-index="${index}" style="flex: 0 0 auto; width: 60px; padding: 5px;">Usuń</button>
    `;
    div.querySelector('.btn-danger').onclick = () => {
      showConfirmModal(`Usunąć "${ex.name}" z planu?`, () => {
        state.plans[currentDay].splice(index, 1);
        saveState();
        renderEditPlanList();
        renderDayList();
      });
    };
    list.appendChild(div);
  });
}

// --- Logika Aktywnego Treningu ---

function startWorkout(dayName) {
  const plan = state.plans[dayName] || [];

  if (plan.length === 0) {
    showErrorModal("Ten plan jest pusty. Najpierw dodaj ćwiczenia, aby zacząć.", 'info');
    return;
  }
  
  showConfirmModal(`Rozpocząć trening: ${dayName}?`, () => {
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
  });
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
        <button type="submit" class="btn-success" style="flex: 0 0 100px;">Zapisz</button>
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
        showErrorModal("Podaj poprawne wartości dla ciężaru (min. 0) i powtórzeń (min. 1).");
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
    showConfirmModal("Usunąć tę serię?", () => {
        state.activeWorkout.exercises[exIndex].loggedSets.splice(setIndex, 1);
        saveState();
        renderActiveWorkout();
    });
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
    showConfirmModal("Zakończyć i zapisać ten trening?", () => {
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
        showPanel('panel-logs'); // Przejdź do logów po zakończeniu
    });
};

// --- Historia i Logi ---

function renderLogs() {
  logArea.innerHTML = '';
  if (state.logs.length === 0) {
     logArea.innerHTML = '<p style="color:var(--muted); text-align: center;">Brak zapisanych treningów w historii.</p>';
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
        <p style="font-weight:bold; margin-bottom: 5px; margin-top: 10px; border-top: 1px dashed var(--muted); padding-top: 10px;">Ćwiczenia:</p>
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
    if (!state.logs || state.logs.length === 0) {
        showErrorModal("Brak danych do eksportu.", 'info');
        return;
    }
    
    const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${currentUserEmail.split('@')[0]}_trening_logs.json`; a.click();
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
        await saveState(); 
        renderLogs(); 
        showErrorModal("Zaimportowano dane do chmury/przeglądarki.", 'success');
        updateStatsChart();
      } else { 
        showErrorModal("Nieprawidłowy format pliku JSON.", 'error');
      }
    } catch (err) { 
        showErrorModal(`Błąd podczas odczytu pliku: ${err.message}`, 'error');
    }
  }
  reader.readAsText(file);
}
document.getElementById('clearHistory').onclick = () => {
    showConfirmModal("Wyczyścić całą historię treningów? Dane zostaną usunięte!", () => {
        state.logs = []; 
        saveState(); 
        renderLogs(); 
        updateStatsChart();
        showErrorModal("Historia wyczyszczona.", 'success');
    });
}

// --- Statystyki ---
function initStatsChart() {
  const ctx = document.getElementById('statsChart').getContext('2d');
  statsChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Objętość treningowa (kg)', data: [], backgroundColor: 'var(--accent)' }] },
    options: { 
        responsive: true, 
        maintainAspectRatio: false,
        scales: { 
            y: { beginAtZero: true, title: { display: true, text: 'Objętość (kg)' } },
            x: { title: { display: true, text: 'Data' } }
        },
        plugins: {
            legend: { display: false }
        }
    }
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

    if (totalVolume > 0) { // Zliczaj tylko, jeśli objętość jest większa niż 0
        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date] += totalVolume;
    }
    return acc;
  }, {});

  // Sortowanie dat i przygotowanie danych do wykresu
  const sortedDates = Object.keys(volumeByDate).sort();
  statsChart.data.labels = sortedDates;
  statsChart.data.datasets[0].data = sortedDates.map(date => volumeByDate[date]);
  
  // Zaktualizuj kolor tła na wykresie zgodnie z motywem
  const accentColor = getComputedStyle(document.body).getPropertyValue('--accent');
  statsChart.data.datasets[0].backgroundColor = accentColor;
  
  statsChart.update();
}
