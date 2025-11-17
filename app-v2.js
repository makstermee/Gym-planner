// Modularne importy funkcji Firebase
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, onSnapshot, updateDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const auth = window.auth;
const db = window.db;
const appId = window.appId;

// --- Struktury Danych ---
// Usunąłem pole "theme", bo jest teraz na stałe w CSS
const defaultUserState = {
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

let state = JSON.parse(JSON.stringify(defaultUserState)); 
let currentUserId = null;
let currentUserEmail = null; 
let firestoreUnsubscribe = null; 

let masterTimerInterval = null; 
let restTimerInterval = null; 
let currentRestDisplay = null; 

// --- START APLIKACJI (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => {

    // Zmienne globalne DOM
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
    // Usunąłem themeSelect

    let statsChart = null;
    let currentDay = null;


    // --- Funkcje pomocnicze UI ---

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
        document.getElementById('modalConfirmYes').onclick = () => { modal.remove(); onConfirm(); };
        document.getElementById('modalConfirmNo').onclick = () => { modal.remove(); onCancel(); };
    }


    // --- Obsługa Danych (Firestore) ---

    function getUserDocRef() {
        if (!currentUserId || !db) return null;
        return doc(db, `users/${currentUserId}/data/user_state`);
    }

    async function saveState() {
        if (!currentUserId || !db) return;
        try {
            const docRef = getUserDocRef();
            await setDoc(docRef, state); 
        } catch (error) {
            console.error("Błąd zapisu:", error);
        }
    }

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
                initAppUI(); 
            } else {
                state = JSON.parse(JSON.stringify(defaultUserState));
                saveState(); 
                initAppUI();
            }
        }, (error) => {
            console.error("Błąd subskrypcji:", error);
        });
    }

    function clearUserState() {
        if (firestoreUnsubscribe) firestoreUnsubscribe();
        firestoreUnsubscribe = null;
        currentUserId = null;
        currentUserEmail = null;
        state = JSON.parse(JSON.stringify(defaultUserState)); 
    }


    // --- Autoryzacja ---

    if (!window.IS_FIREBASE_CONFIGURED) {
        configWarning.style.display = 'block';
        authForm.style.display = 'none';
        showPanel('panel-auth');
        return;
    } else {
        configWarning.style.display = 'none';
    }

    onAuthStateChanged(auth, user => {
        authError.textContent = ''; 
        if (user) {
            currentUserId = user.uid;
            currentUserEmail = user.email;
            currentAuthStatus.textContent = `Zalogowano: ${currentUserEmail}`;
            loggedUserEmailDisplay.textContent = currentUserEmail;
            currentUserIdDisplay.textContent = currentUserId;

            authForm.style.display = 'none';
            logoutBtn.style.display = 'block'; 
            bottomNav.style.display = 'flex';
            setupFirestoreListener(); 

        } else {
            clearUserState();
            currentAuthStatus.textContent = 'Status: Wylogowany.';
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
        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        if (!email || !password) { return authError.textContent = "Podaj dane."; }
        try {
            await signInWithEmailAndPassword(auth, email, password);
            showErrorModal("Zalogowano!", 'success');
        } catch (error) {
            authError.textContent = "Błąd logowania.";
        }
    };

    registerBtn.onclick = async () => {
        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        if (!email || password.length < 6) { return authError.textContent = "Hasło min 6 znaków."; }
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            showErrorModal("Zarejestrowano!", 'success');
        } catch (error) {
            authError.textContent = "Błąd rejestracji: " + error.message;
        }
    };

    logoutBtn.onclick = async () => {
        showConfirmModal("Wylogować?", async () => {
            if (masterTimerInterval) clearInterval(masterTimerInterval);
            if (restTimerInterval) clearInterval(restTimerInterval);
            if (firestoreUnsubscribe) firestoreUnsubscribe(); 
            if (auth) await signOut(auth);
        });
    };

    // --- Inicjalizacja UI ---
    function initAppUI() {
        if (state.activeWorkout.isActive) {
            if (masterTimerInterval) clearInterval(masterTimerInterval); 
            
            showConfirmModal("Wznowić trening?", () => {
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
        // USUNIĘTO applyTheme() - kolor jest teraz stały w CSS
        
        // Renderowanie
        renderDayList(); 
        renderLogs();
    }

    // --- Nawigacja ---
    function showPanel(panelId) {
      if (!currentUserId && panelId !== 'panel-auth') return showPanel('panel-auth'); 
      if (state.activeWorkout.isActive && panelId !== 'panel-active-workout' && panelId !== 'panel-auth') {
        return showErrorModal('Zakończ trening!', 'info');
      }
      panels.forEach(p => p.classList.remove('active'));
      document.getElementById(panelId).classList.add('active');
      document.querySelectorAll('.bottom-nav button').forEach(btn => {
          btn.classList.remove('active');
          if (btn.dataset.panel === panelId) btn.classList.add('active');
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

    function updateWelcome() {
        const emailPart = currentUserEmail ? currentUserEmail.split('@')[0] : '';
        welcomeMsg.textContent = emailPart && emailPart !== 'Anonimowy' ? `, ${emailPart}!` : '';
    }

    // --- Logika Planów ---
    function renderDayList() {
      if (!dayList) return;
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
      if (plan.length === 0) list.innerHTML = '<p style="color:var(--muted); text-align: center;">Brak ćwiczeń.</p>';

      plan.forEach(ex => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `<div><strong>${ex.name}</strong><br><span>Cel: ${ex.targetSets} x ${ex.targetReps}</span></div>`;
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
        if (!name || sets < 1 || reps < 1) return showErrorModal("Błędne dane.");

        if (!state.plans[dayName]) state.plans[dayName] = [];
        state.plans[dayName].push({ name, targetSets: sets, targetReps: reps });
        saveState();
        renderEditPlanList();
        document.getElementById('exName').value = '';
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
          <div><strong>${ex.name}</strong><br><span>${ex.targetSets}x${ex.targetReps}</span></div>
          <button class="btn-danger" data-index="${index}" style="flex:0 0 auto;width:60px;padding:5px;">Usuń</button>
        `;
        div.querySelector('.btn-danger').onclick = () => {
          showConfirmModal(`Usunąć "${ex.name}"?`, () => {
            state.plans[currentDay].splice(index, 1);
            saveState();
            renderEditPlanList();
            renderDayList();
          });
        };
        list.appendChild(div);
      });
    }

    // --- Aktywny Trening ---
    function startWorkout(dayName) {
      const plan = state.plans[dayName] || [];
      if (plan.length === 0) return showErrorModal("Pusty plan.", 'info');
      
      showConfirmModal(`Start: ${dayName}?`, () => {
        state.activeWorkout.isActive = true;
        state.activeWorkout.dayName = dayName;
        state.activeWorkout.startTime = Date.now();
        state.activeWorkout.exercises = plan.map(ex => ({ ...ex, loggedSets: [] }));

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
          <div class="logged-set">
            <span>S${setIndex + 1}: ${set.weight}kg x ${set.reps}</span>
            <span class="set-remove" data-ex-index="${exIndex}" data-set-index="${setIndex}">[x]</span>
          </div>
        `).join('');

        const lastWeight = ex.loggedSets.slice(-1)[0]?.weight || '';
        card.innerHTML = `
          <h3>${ex.name}</h3>
          <small>${ex.targetSets} x ${ex.targetReps}</small>
          <div class="logged-sets-list">${setsHTML}</div>
          <form class="log-set-form" data-ex-index="${exIndex}">
            <input type="number" class="log-weight" placeholder="kg" value="${lastWeight}" required>
            <input type="number" class="log-reps" placeholder="powt" required>
            <button type="submit" class="btn-success" style="flex:0 0 80px;">OK</button>
          </form>
          <div class="rest-timer-section">
            <span class="rest-timer-display" id="rest-timer-${exIndex}">00:00</span>
            <button class="start-rest-btn btn-secondary" data-ex-index="${exIndex}" data-seconds="60">60s</button>
            <button class="start-rest-btn btn-secondary" data-ex-index="${exIndex}" data-seconds="90">90s</button>
          </div>
        `;
        list.appendChild(card);
      });

      list.querySelectorAll('.log-set-form').forEach(form => {
        form.onsubmit = (e) => {
          e.preventDefault();
          const exIndex = e.target.dataset.exIndex;
          const w = e.target.querySelector('.log-weight').value;
          const r = e.target.querySelector('.log-reps').value;
          if (w && r) {
            logSet(exIndex, +w, +r);
            e.target.querySelector('.log-reps').value = '';
            startRestTimer(exIndex, 60);
          }
        };
      });
      list.querySelectorAll('.start-rest-btn').forEach(btn => {
        btn.onclick = () => startRestTimer(btn.dataset.exIndex, +btn.dataset.seconds);
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
        showConfirmModal("Usunąć serię?", () => {
            state.activeWorkout.exercises[exIndex].loggedSets.splice(setIndex, 1);
            saveState();
            renderActiveWorkout();
        });
    }

    function startRestTimer(exIndex, seconds) {
      if (restTimerInterval) {
        clearInterval(restTimerInterval);
        if (currentRestDisplay) currentRestDisplay.style.color = 'var(--accent)'; 
      }
      const display = document.getElementById(`rest-timer-${exIndex}`);
      currentRestDisplay = display;
      let sec = seconds;
      display.style.color = 'var(--danger)'; 
      const update = () => {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        display.textContent = `${m}:${s}`;
      };
      update();
      restTimerInterval = setInterval(() => {
        sec--;
        update();
        if (sec <= 0) {
          clearInterval(restTimerInterval);
          display.textContent = "START!";
          display.style.color = 'var(--success)'; 
        }
      }, 1000);
    }

    function updateMasterTimer() {
      if (!state.activeWorkout.isActive) return;
      const ms = Date.now() - state.activeWorkout.startTime;
      const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
      const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
      masterTimerDisplay.textContent = `${h}:${m}:${s}`;
    }

    document.getElementById('finishWorkoutBtn').onclick = () => {
        showConfirmModal("Zakończyć?", () => {
            if (masterTimerInterval) clearInterval(masterTimerInterval);
            if (restTimerInterval) clearInterval(restTimerInterval);
            const finalTime = masterTimerDisplay.textContent;
            masterTimerDisplay.style.display = 'none';
            const entry = {
                date: new Date().toISOString().split('T')[0],
                dayName: state.activeWorkout.dayName,
                duration: finalTime,
                exercises: state.activeWorkout.exercises.filter(ex => ex.loggedSets.length > 0)
            };
            state.logs.push(entry);
            state.activeWorkout = defaultUserState.activeWorkout;
            saveState();
            renderLogs();
            renderDayList();
            showPanel('panel-logs'); 
        });
    };

    // --- Historia ---
    function renderLogs() {
      if (!logArea) return;
      logArea.innerHTML = '';
      if (state.logs.length === 0) return logArea.innerHTML = '<p style="color:var(--muted);text-align:center;">Brak wpisów.</p>';
      
      state.logs.slice().reverse().forEach((log) => {
        const div = document.createElement('div');
        div.className = 'card log-summary-card';
        div.innerHTML = `
          <div class="log-header"><span>${log.date} - ${log.dayName} (${log.duration})</span><span class="log-toggle">▶</span></div>
          <div class="log-details-hidden" style="display:none;margin-top:10px;border-top:1px dashed #555;padding-top:10px;">
            ${log.exercises.map(ex => `
              <div style="margin-bottom:5px;"><strong>${ex.name}</strong>
              <small style="display:block;color:#aaa;">${ex.loggedSets.map((s,i)=>`S${i+1}: ${s.weight}kg x ${s.reps}`).join(', ')}</small></div>
            `).join('')}
          </div>
        `;
        div.querySelector('.log-header').onclick = () => {
          const d = div.querySelector('.log-details-hidden');
          d.style.display = d.style.display === 'none' ? 'block' : 'none';
        };
        logArea.appendChild(div);
      });
    }

    // --- Import/Eksport ---
    document.getElementById('exportBtn').onclick = () => {
        if (!state.logs.length) return showErrorModal("Brak danych.");
        const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `trening_logs.json`; a.click();
    }
    document.getElementById('importBtn').onclick = () => document.getElementById('fileInput').click();
    document.getElementById('fileInput').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        try {
          state.logs = JSON.parse(r.result); await saveState(); renderLogs(); updateStatsChart();
          showErrorModal("Zaimportowano.", 'success');
        } catch { showErrorModal("Błąd pliku."); }
      }
      r.readAsText(f);
    }
    document.getElementById('clearHistory').onclick = () => {
        showConfirmModal("Usunąć historię?", () => {
            state.logs = []; saveState(); renderLogs(); updateStatsChart();
        });
    }

    // --- Statystyki ---
    function initStatsChart() {
      const ctx = document.getElementById('statsChart').getContext('2d');
      statsChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Kg', data: [], backgroundColor: '#ff5722' }] },
        options: { 
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: {color:'#fff'} }, x: { ticks: {color:'#fff'} } },
            plugins: { legend: {display:false} }
        }
      });
    }

    function updateStatsChart() {
      if (!statsChart || !state.logs) return;
      const vol = state.logs.reduce((acc, log) => {
        const tot = log.exercises.reduce((ea, ex) => ea + ex.loggedSets.reduce((sa, s) => sa + (s.weight*s.reps), 0), 0);
        if (tot > 0) acc[log.date] = (acc[log.date] || 0) + tot;
        return acc;
      }, {});
      const dates = Object.keys(vol).sort();
      statsChart.data.labels = dates;
      statsChart.data.datasets[0].data = dates.map(d => vol[d]);
      statsChart.update();
    }

});
