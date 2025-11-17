import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Pobranie referencji (z index.html)
const auth = window.auth;
const db = window.db;

// --- DOMYŚLNY STAN DANYCH ---
const defaultState = {
    plans: {
        "Poniedziałek": [], "Wtorek": [], "Środa": [], "Czwartek": [], 
        "Piątek": [], "Sobota": [], "Niedziela": []
    },
    logs: [],
    activeWorkout: { isActive: false, day: null, startTime: null, exercises: [] }
};

// --- STAN APLIKACJI (Lokalny) ---
let appState = JSON.parse(JSON.stringify(defaultState));
let currentUser = null;
let unsanctionedChanges = false; // Czy są zmiany do zapisania?
let saveTimeout = null; // ID timera do debounce
let masterTimer = null; // Timer treningu

// --- ELEMENTY DOM ---
const els = {
    loader: document.getElementById('appLoader'),
    views: document.querySelectorAll('.view'),
    navBtns: document.querySelectorAll('.bottom-nav button'),
    cloudIcon: document.getElementById('cloudStatus'),
    toasts: document.getElementById('toastContainer')
};

// --- 1. SYSTEM POWIADOMIEŃ (Toast) ---
function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerText = msg;
    els.toasts.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// --- 2. SYSTEM ZAPISU (Debounce) ---
// To jest klucz do sukcesu. Nie zapisujemy od razu. Czekamy 2 sekundy od ostatniej zmiany.
function triggerSave() {
    unsanctionedChanges = true;
    els.cloudIcon.className = 'cloud-status saving';
    
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(async () => {
        if (!currentUser) return;
        try {
            await setDoc(doc(db, `users/${currentUser.uid}/data/main`), appState);
            els.cloudIcon.className = 'cloud-status saved';
            unsanctionedChanges = false;
            setTimeout(() => els.cloudIcon.className = 'cloud-status', 2000);
        } catch (err) {
            console.error("Błąd zapisu:", err);
            els.cloudIcon.className = 'cloud-status error';
            showToast("Błąd zapisu! Sprawdź internet.", "error");
        }
    }, 2000); // Czekaj 2s
}

// --- 3. SYSTEM AUTORYZACJI I POBIERANIA DANYCH ---
function initAuth() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('userEmailDisplay').innerText = user.email;
            loadUserData();
        } else {
            currentUser = null;
            appState = JSON.parse(JSON.stringify(defaultState));
            showView('view-auth');
            els.loader.style.display = 'none';
        }
    });
}

function loadUserData() {
    // Nasłuchiwanie zmian w czasie rzeczywistym
    const docRef = doc(db, `users/${currentUser.uid}/data/main`);
    
    onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
            // Mamy dane z chmury!
            // Uwaga: Nadpisujemy stan lokalny tylko jeśli NIE mamy "wiszących" zmian
            // żeby nie nadpisać tego co użytkownik właśnie wpisuje.
            if (!unsanctionedChanges) {
                appState = { ...defaultState, ...snap.data() };
                refreshUI();
            }
        } else {
            // Nowy użytkownik - tworzymy strukturę w chmurze
            setDoc(docRef, defaultState);
        }
        els.loader.style.display = 'none';
        
        // Jeśli trening był aktywny po odświeżeniu - wznów timer
        if (appState.activeWorkout.isActive) {
            startMasterTimer();
            document.getElementById('navWorkoutBtn').style.display = 'flex';
        }
        
        // Domyślny widok po zalogowaniu
        if (document.getElementById('view-auth').classList.contains('active')) {
            showView('view-plans');
        }
    }, (err) => {
        console.error("Błąd Firebase:", err);
        els.loader.style.display = 'none';
        showToast("Błąd dostępu do danych. Sprawdź reguły bazy!", "error");
    });
}

// --- 4. OBSŁUGA UI I NAWIGACJI ---
function showView(viewId) {
    els.views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    // Update nav
    els.navBtns.forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.bottom-nav button[data-target="${viewId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Render specific views
    if (viewId === 'view-plans') renderPlansGrid();
    if (viewId === 'view-history') renderHistory();
    if (viewId === 'view-profile') renderStats();
}

// Router globalny dla HTML
window.app = {
    router: showView
};

// Event Listeners dla Nawigacji
els.navBtns.forEach(btn => {
    btn.onclick = () => showView(btn.dataset.target);
});

// --- 5. LOGIKA PLANÓW ---
function renderPlansGrid() {
    const grid = document.getElementById('daysGrid');
    grid.innerHTML = '';
    Object.keys(appState.plans).forEach(day => {
        const count = appState.plans[day].length;
        const div = document.createElement('div');
        div.className = 'day-card';
        div.innerHTML = `${day} <span>${count} ćw.</span>`;
        div.onclick = () => openDayEditor(day);
        grid.appendChild(div);
    });
}

let currentEditDay = null;

function openDayEditor(day) {
    currentEditDay = day;
    document.getElementById('editorTitle').innerText = day;
    renderEditorList();
    
    // Setup przycisku startu
    const btnStart = document.getElementById('btnStartWorkout');
    if (appState.plans[day].length > 0) {
        btnStart.style.display = 'block';
        btnStart.onclick = () => startWorkout(day);
    } else {
        btnStart.style.display = 'none';
    }
    
    showView('view-editor');
}

function renderEditorList() {
    const list = document.getElementById('editorList');
    list.innerHTML = '';
    appState.plans[currentEditDay].forEach((ex, idx) => {
        const el = document.createElement('div');
        el.className = 'exercise-item';
        el.innerHTML = `
            <div><strong>${ex.name}</strong><br><small>${ex.sets} x ${ex.reps}</small></div>
            <button class="btn-danger" style="width:30px;height:30px;padding:0">x</button>
        `;
        el.querySelector('button').onclick = () => {
            appState.plans[currentEditDay].splice(idx, 1);
            triggerSave();
            renderEditorList();
        };
        list.appendChild(el);
    });
}

// Dodawanie ćwiczenia
document.getElementById('btnAddEx').onclick = () => {
    const name = document.getElementById('newExName').value;
    const sets = document.getElementById('newExSets').value;
    const reps = document.getElementById('newExReps').value;
    if (name) {
        appState.plans[currentEditDay].push({ name, sets, reps });
        triggerSave();
        renderEditorList();
        document.getElementById('newExName').value = '';
        document.getElementById('btnStartWorkout').style.display = 'block';
        document.getElementById('btnStartWorkout').onclick = () => startWorkout(currentEditDay);
    }
};

// --- 6. LOGIKA TRENINGU ---
function startWorkout(day) {
    if (appState.activeWorkout.isActive) {
        if (!confirm("Masz już aktywny trening. Zastąpić go?")) return;
    }

    appState.activeWorkout = {
        isActive: true,
        day: day,
        startTime: Date.now(),
        exercises: appState.plans[day].map(ex => ({ ...ex, logs: [] }))
    };
    triggerSave();
    startMasterTimer();
    renderWorkoutView();
    document.getElementById('navWorkoutBtn').style.display = 'flex';
    showView('view-workout');
}

function renderWorkoutView() {
    const list = document.getElementById('workoutList');
    const data = appState.activeWorkout;
    document.getElementById('workoutDayTitle').innerText = data.day;
    list.innerHTML = '';

    data.exercises.forEach((ex, exIdx) => {
        const card = document.createElement('div');
        card.className = 'card';
        
        // Wyświetlanie wykonanych serii
        let logsHtml = ex.logs.map((l, i) => 
            `<div class="done-set"><span>Seria ${i+1}</span> <span>${l.kg}kg x ${l.reps}</span></div>`
        ).join('');

        card.innerHTML = `
            <h3>${ex.name} <small style="color:#666">(${ex.sets}x${ex.reps})</small></h3>
            <div id="logs-${exIdx}">${logsHtml}</div>
            <div class="set-row">
                <input type="number" placeholder="kg" id="w-${exIdx}" style="width:70px">
                <input type="number" placeholder="pow" id="r-${exIdx}" style="width:60px" value="${ex.reps}">
                <button class="btn-small" id="add-${exIdx}"><i class="fa-solid fa-check"></i></button>
            </div>
        `;
        list.appendChild(card);

        card.querySelector(`#add-${exIdx}`).onclick = () => {
            const kg = document.getElementById(`w-${exIdx}`).value;
            const r = document.getElementById(`r-${exIdx}`).value;
            if (kg && r) {
                ex.logs.push({ kg, reps: r });
                triggerSave();
                renderWorkoutView(); // Przeładuj widok
            }
        };
    });
}

function startMasterTimer() {
    if (masterTimer) clearInterval(masterTimer);
    const display = document.getElementById('workoutTimer');
    
    masterTimer = setInterval(() => {
        if (!appState.activeWorkout.isActive) return;
        const diff = Date.now() - appState.activeWorkout.startTime;
        const d = new Date(diff);
        display.innerText = d.toISOString().substr(11, 8);
    }, 1000);
}

document.getElementById('btnFinishWorkout').onclick = () => {
    if (confirm("Zakończyć trening?")) {
        const w = appState.activeWorkout;
        const duration = document.getElementById('workoutTimer').innerText;
        
        // Zapisz do historii tylko jeśli coś zrobiono
        const doneEx = w.exercises.filter(e => e.logs.length > 0);
        if (doneEx.length > 0) {
            appState.logs.push({
                date: new Date().toISOString().split('T')[0],
                day: w.day,
                duration: duration,
                details: doneEx
            });
        }

        // Reset
        appState.activeWorkout = { isActive: false, day: null, startTime: null, exercises: [] };
        clearInterval(masterTimer);
        document.getElementById('navWorkoutBtn').style.display = 'none';
        triggerSave();
        showView('view-history');
        showToast("Trening zapisany!", "success");
    }
};

// --- 7. HISTORIA I STATYSTYKI ---
function renderHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = appState.logs.slice().reverse().map(l => `
        <div class="card" style="border-left:4px solid var(--success)">
            <div style="display:flex;justify-content:space-between">
                <strong>${l.date}</strong>
                <span>${l.day}</span>
            </div>
            <small style="color:#888">Czas: ${l.duration} | Ćwiczeń: ${l.details.length}</small>
        </div>
    `).join('') || '<p style="text-align:center;color:#666">Brak historii.</p>';
}

function renderStats() {
    const ctx = document.getElementById('statsChart');
    // Prosta logika: suma tonażu (kg * reps) per data
    const dataMap = {};
    appState.logs.forEach(l => {
        let totalVol = 0;
        l.details.forEach(ex => {
            ex.logs.forEach(s => totalVol += (Number(s.kg) * Number(s.reps)));
        });
        dataMap[l.date] = (dataMap[l.date] || 0) + totalVol;
    });

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(dataMap),
            datasets: [{
                label: 'Objętość (kg)',
                data: Object.values(dataMap),
                borderColor: '#3b82f6',
                tension: 0.4
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
}

function refreshUI() {
    // Odśwież aktualnie otwarty widok, jeśli trzeba
    const active = document.querySelector('.view.active');
    if (active.id === 'view-plans') renderPlansGrid();
    if (active.id === 'view-active-workout' && appState.activeWorkout.isActive) renderWorkoutView();
}

// --- 8. HANDLERY FORMULARZY ---
document.getElementById('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const mail = document.getElementById('authEmail').value;
    const pass = document.getElementById('authPass').value;
    const errBox = document.getElementById('authError');
    els.loader.style.display = 'flex';
    
    try {
        await signInWithEmailAndPassword(auth, mail, pass);
    } catch (err) {
        // Jeśli nie znaleziono użytkownika, spróbuj zarejestrować
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
             try {
                 await createUserWithEmailAndPassword(auth, mail, pass);
             } catch (regErr) {
                 errBox.innerText = "Błąd: " + regErr.message;
                 els.loader.style.display = 'none';
             }
        } else {
            errBox.innerText = "Błąd: " + err.message;
            els.loader.style.display = 'none';
        }
    }
};

document.getElementById('btnLogout').onclick = () => signOut(auth);

// START
initAuth();
