// Modularne importy funkcji Firebase (dzięki type="module" w index.html)
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, onSnapshot, updateDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// Wymagane globalne zmienne z index.html:
// window.auth, window.db, window.appId, window.IS_FIREBASE_CONFIGURED
const auth = window.auth;
const db = window.db;
const appId = window.appId;

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
let firestoreUnsubscribe = null; // Przechowuje funkcję do anulowania subskrypcji Firestore

let masterTimerInterval = null; 
let restTimerInterval = null; 
let currentRestDisplay = null; 

// --- GŁÓWNA POPRAWKA: ---
// Czekamy, aż cały HTML będzie gotowy, zanim spróbujemy znaleźć jakikolwiek element
document.addEventListener('DOMContentLoaded', () => {

    // --- Zmienne globalne DOM ---
    // Teraz mamy pewność, że te elementy istnieją, gdy skrypt je wyszukuje
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
    const bottomNav = document.getElementById('bottomNav');
    const configWarning = document.getElementById('configWarning');
    const currentUserIdDisplay = document.getElementById('currentUserIdDisplay');
    const themeSelect = document.getElementById('themeSelect'); // Przeniesione tutaj

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


    // --- Obsługa Zapisywania Danych (Firestore) ---

    /** Zwraca referencję do dokumentu użytkownika w Firestore. */
    function getUserDocRef() {
        if (!currentUserId || !db) return null;
        return doc(db, `users/${currentUserId}/data/user_state`);
    }

    /** Zapisuje cały stan 'state' do Firestore. */
    async function saveState() {
        if (!currentUserId || !db) {
            console.warn("Save skipped: User not logged in or Firestore not available.");
            showErrorModal("Błąd: Brak połączenia z chmurą. Zapis niemożliwy.", 'error');
            return;
        }
        
        try {
            const docRef = getUserDocRef();
            await setDoc(docRef, state); 
            console.log("Stan zapisany pomyślnie do Firestore.");
        } catch (error) {
            console.error("Błąd zapisu danych do Firestore:", error);
            showErrorModal("Błąd zapisu danych do chmury.", 'error');
        }
    }

    /** Ustawia subskrypcję na dane użytkownika w Firestore. */
    function setupFirestoreListener() {
        if (firestoreUnsubscribe) firestoreUnsubscribe(); 

        const docRef = getUserDocRef();
        if (!docRef) return;

        firestoreUnsubscribe = onSnapshot(docRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const userData = docSnapshot.data();
                state = { 
                    ...defaultUserState, 
                    ...userData,
                    plans: { ...defaultUserState.plans, ...(userData.plans || {}) }
                };
                console.log("Dane wczytane pomyślnie z Firestore (Real-time).", state);
                initAppUI(); 
            } else {
                console.log("Dokument użytkownika nie istnieje. Tworzenie nowego.");
                state = JSON.parse(JSON.stringify(defaultUserState));
                saveState(); 
                initAppUI();
            }
        }, (error) => {
            console.error("Błąd subskrypcji Firestore:", error);
            showErrorModal("Błąd połączenia z chmurą.", 'error');
        });
    }

    /** Anuluje subskrypcję Firestore i resetuje stan. */
    function clearUserState() {
        if (firestoreUnsubscribe) firestoreUnsubscribe();
        firestoreUnsubscribe = null;
        currentUserId = null;
        currentUserEmail = null;
        state = JSON.parse(JSON.stringify(defaultUserState)); 
    }


    // --- Autoryzacja i Logowanie (Firebase Auth) ---

    // Ten kod uruchamia się od razu, ponieważ jest wewnątrz 'DOMContentLoaded'
    
    // 1. Pokaż/Ukryj ostrzeżenie na podstawie flagi z index.html
    if (!window.IS_FIREBASE_CONFIGURED) {
        configWarning.style.display = 'block';
        authForm.style.display = 'none';
        currentAuthStatus.textContent = 'Status: Oczekiwanie na Konfigurację Chmury.';
        currentUserIdDisplay.textContent = 'Brak ID';
        showPanel('panel-auth');
        return; // Zakończ działanie, jeśli konfiguracja nie istnieje
    } else {
        configWarning.style.display = 'none';
    }

    // 2. Główny listener do zarządzania stanem użytkownika
    onAuthStateChanged(auth, user => {
        authError.textContent = ''; 
        
        if (user) {
            // Użytkownik ZALOGOWANY
            currentUserId = user.uid;
            currentUserEmail = user.email;

            currentAuthStatus.textContent = `Zalogowano jako: ${currentUserEmail}`;
            loggedUserEmailDisplay.textContent = currentUserEmail;
            currentUserIdDisplay.textContent = currentUserId;

            authForm.style.display = 'none';
            logoutBtn.style.display = 'block'; 
            bottomNav.style.display = 'flex';
            
            setupFirestoreListener(); // Rozpocznij subskrypcję danych

        } else {
            // WYLOWGOWANY stan
            clearUserState();
            currentAuthStatus.textContent = 'Status: Wylogowany. Zaloguj się, aby kontynuować.';
            loggedUserEmailDisplay.textContent = 'Wylogowany';
            currentUserIdDisplay.textContent = 'Brak ID';
            
            authForm.style.display = 'block';
            logoutBtn.style.display = 'none';
            bottomNav.style.display = 'none';

            if (masterTimerInterval) clearInterval(masterTimerInterval);
            if (restTimerInterval) clearInterval(restTimerInterval);
            masterTimerDisplay.style.display = 'none';
            
            showPanel('panel-auth'); 
        }
    });


    loginBtn.onclick = async () => {
        if (!window.IS_FIREBASE_CONFIGURED) { showErrorModal("Logowanie jest niemożliwe. Brak konfiguracji chmury.", 'info'); return; }
        
        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        authError.textContent = '';
        
        const isFormVisible = loginBtn.offsetParent !== null; 
        if (!isFormVisible) return;

        if (!email || !password) { return authError.textContent = "Wprowadź e-mail i hasło."; }
        try {
            loginBtn.disabled = true;
            registerBtn.disabled = true;
            await signInWithEmailAndPassword(auth, email, password);
            showErrorModal("Zalogowano pomyślnie!", 'success');
        } catch (error) {
            let message = "Wystąpił błąd logowania. Spróbuj ponownie.";
            if (error.code === 'auth/invalid-credential') {
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
        if (!window.IS_FIREBASE_CONFIGURED) { showErrorModal("Rejestracja jest niemożliwa. Brak konfiguracji chmury.", 'info'); return; }

        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        authError.textContent = '';
        
        const isFormVisible = registerBtn.offsetParent !== null; 
        if (!isFormVisible) return;

        if (!email || password.length < 6) { return authError.textContent = "E-mail jest wymagany, a hasło musi mieć min. 6 znaków."; }

        try {
            loginBtn.disabled = true;
            registerBtn.disabled = true;
            
            await createUserWithEmailAndPassword(auth, email, password);
            
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
            if (firestoreUnsubscribe) firestoreUnsubscribe(); 
            
            if (auth) {
                await signOut(auth);
                showErrorModal("Wylogowano pomyślnie.", 'success');
            } else {
                clearUserState();
                showPanel('panel-auth');
            }
        });
    };

    // --- Funkcja inicjalizująca interfejs (po zalogowaniu/wczytaniu) ---
    function initAppUI() {
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

        updateWelcome();
        applyTheme(); 
        
        // POPRAWKA 2: To jest kluczowy moment.
        // Teraz, gdy 'dayList' i 'logArea' na pewno nie są 'null',
        // te funkcje zadziałają poprawnie za pierwszym razem.
        renderDayList(); 
        renderLogs();
    }

    // --- Nawigacja ---

    function showPanel(panelId) {
      if (!currentUserId && panelId !== 'panel-auth') {
        if (document.getElementById('panel-auth').classList.contains('active')) {
            return;
        }
        showErrorModal("Musisz być zalogowany, aby korzystać z tej sekcji.", 'info');
        return showPanel('panel-auth'); 
      }

      if (state.activeWorkout.isActive && panelId !== 'panel-active-workout' && panelId !== 'panel-auth') {
        showErrorModal('Najpierw zakończ aktywny trening!', 'info');
        return;
      }
      
      panels.forEach(p => p.classList.remove('active'));
      document.getElementById(panelId).classList.add('active');

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
        const emailPart = currentUserEmail ? currentUserEmail.split('@')[0] : '';
        welcomeMsg.textContent = emailPart && emailPart !== 'Anonimowy' ? `, ${emailPart}!` : '';
    }

    function applyTheme() { 
      document.body.classList.toggle('dark', state.theme === 'dark'); 
      themeSelect.value = state.theme;
    }

    themeSelect.onchange = e => { 
        state.theme = e.target.value; 
        applyTheme(); 
        saveState();
        renderDayList(); 
        renderLogs();
    }

    // --- Logika Planów Treningowych ---

    function renderDayList() {
      // Sprawdzenie, czy dayList nie jest null (choć po poprawce nie powinien być)
      if (!dayList) {
          console.error("Błąd krytyczny: Element 'dayList' nie został znaleziony.");
          return;
      }
      dayList.innerHTML = '';
      Object.keys(defaultUserState.plans).forEach(dayName => {
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
            repsInput.value = ''; 
            startRestTimer(exIndex, 60); 
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
      if (restTimerInterval) {
        clearInterval(restTimerInterval);
        if (currentRestDisplay) {
           currentRestDisplay.style.color = 'var(--accent)'; 
        }
      }

      const displayElement = document.getElementById(`rest-timer-${exIndex}`);
      currentRestDisplay = displayElement;
      let secondsLeft = seconds;
      displayElement.style.color = 'var(--danger)'; 

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
          displayElement.style.color = 'var(--success)'; 
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
            if (masterTimerInterval) clearInterval(masterTimerInterval);
            if (restTimerInterval) clearInterval(restTimerInterval);
            
            const finalDuration = masterTimerDisplay.textContent;
            masterTimerDisplay.style.display = 'none';

            const logEntry = {
                date: new Date().toISOString().split('T')[0],
                dayName: state.activeWorkout.dayName,
                duration: finalDuration,
                exercises: state.activeWorkout.exercises.filter(ex => ex.loggedSets.length > 0)
            };
            state.logs.push(logEntry);

            state.activeWorkout = defaultUserState.activeWorkout;

            saveState();
            renderLogs();
            renderDayList();
            showPanel('panel-logs'); 
        });
    };

    // --- Historia i Logi ---

    function renderLogs() {
      if (!logArea) {
          console.error("Błąd krytyczny: Element 'logArea' nie został znaleziony.");
          return;
      }
      logArea.innerHTML = '';
      if (state.logs.length === 0) {
         logArea.innerHTML = '<p style="color:var(--muted); text-align: center;">Brak zapisanych treningów w historii.</p>';
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
        
        const exportName = currentUserEmail ? currentUserEmail.split('@')[0] : 'trening';
        const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `${exportName}_trening_logs.json`; a.click();
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
            showErrorModal("Zaimportowano dane.", 'success');
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
        
        const totalVolume = log.exercises.reduce((exAcc, ex) => {
          const exerciseVolume = ex.loggedSets.reduce((setAcc, set) => {
            return setAcc + (set.weight * set.reps);
          }, 0);
          return exAcc + exerciseVolume;
        }, 0);

        if (totalVolume > 0) { 
            if (!acc[date]) {
              acc[date] = 0;
            }
            acc[date] += totalVolume;
        }
        return acc;
      }, {});

      const sortedDates = Object.keys(volumeByDate).sort();
      statsChart.data.labels = sortedDates;
      statsChart.data.datasets[0].data = sortedDates.map(date => volumeByDate[date]);
      
      const accentColor = getComputedStyle(document.body).getPropertyValue('--accent');
      statsChart.data.datasets[0].backgroundColor = accentColor;
      
      statsChart.update();
    }

}); // --- KONIEC GŁÓWNEGO BLOKU 'DOMContentLoaded' ---
