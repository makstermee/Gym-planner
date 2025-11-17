import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Instancje z window (z index.html)
const auth = window.auth;
const db = window.db;

// --- STAN APLIKACJI ---
const defaultData = {
    plans: {
        "Poniedziałek": [], "Wtorek": [], "Środa": [], "Czwartek": [],
        "Piątek": [], "Sobota": [], "Niedziela": []
    },
    logs: [],
    activeWorkout: { isActive: false, day: null, startTime: null, exercises: [] }
};

let state = JSON.parse(JSON.stringify(defaultData));
let currentUser = null;
let saveTimeout = null;
let masterTimerInterval = null;

// --- CACHE SYSTEM (SZYBKOŚĆ) ---
const CACHE_KEY = "gym_pro_cache";

function loadFromCache() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            state = JSON.parse(cached);
            console.log("📂 Wczytano z cache (Instant Load)");
            refreshUI();
        } catch (e) { console.error("Błąd cache", e); }
    }
}

function saveToCache() {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
}

// --- SYSTEM ZAPISU (CLOUD & LOCAL) ---
async function saveData() {
    // 1. Zapisz lokalnie natychmiast
    saveToCache();
    updateSyncIcon('saving');

    // 2. Zapisz w chmurze z opóźnieniem (Debounce 2s)
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(async () => {
        if (!currentUser) return;
        try {
            await setDoc(doc(db, "users", currentUser.uid), { data: state });
            console.log("☁️ Zapisano w Firebase");
            updateSyncIcon('saved');
            setTimeout(() => updateSyncIcon('idle'), 2000);
        } catch (error) {
            console.error("Błąd zapisu chmury:", error);
            updateSyncIcon('error');
            showToast("Błąd zapisu w chmurze!", "red");
        }
    }, 2000);
}

function updateSyncIcon(status) {
    const el = document.getElementById('syncIndicator');
    if (status === 'saving') el.className = 'sync-status saving';
    else if (status === 'saved') el.className = 'sync-status saved';
    else if (status === 'error') { el.className = 'sync-status'; el.style.color = 'red'; }
    else el.className = 'sync-status';
}

// --- AUTORYZACJA ---
function initApp() {
    loadFromCache(); // Ładuj UI natychmiast
    
    onAuthStateChanged(auth, async (user) => {
        const splash = document.getElementById('splashScreen');
        
        if (user) {
            currentUser = user;
            document.getElementById('userEmail').textContent = user.email;
            
            // Pobierz świeże dane z chmury
            try {
                const docRef = doc(db, "users", user.uid);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const cloudData = snap.data().data;
                    // Scalanie: Użyj chmury jako prawdy, chyba że jest pusta
                    if (cloudData) {
                        state = { ...defaultData, ...cloudData };
                        saveToCache(); // Aktualizuj cache
                        refreshUI();
                    }
                }
                if (splash) splash.style.display = 'none';
                app.navigate('view-dashboard');
                
                // Wznów timer jeśli trzeba
                if (state.activeWorkout?.isActive) {
                    document.getElementById('navWorkout').style.display = 'flex';
                    startTimer();
                }

            } catch (e) {
                console.error("Błąd pobierania:", e);
                showToast("Błąd połączenia z bazą", "red");
                if (splash) splash.style.display = 'none';
            }
        } else {
            // Wylogowano
            currentUser = null;
            localStorage.removeItem(CACHE_KEY); // Czyść cache
            state = JSON.parse(JSON.stringify(defaultData));
            if (splash) splash.style.display = 'none';
            app.navigate('view-auth');
        }
    });
}

// --- NAWIGACJA ---
window.app = {
    navigate: (viewId) => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(viewId);
        if (target) target.classList.add('active');

        // Update paska dolnego
        document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
        const navBtn = document.querySelector(`button[data-target="${viewId}"]`);
        if (navBtn) navBtn.classList.add('active');

        // Specyficzne rendery
        if (viewId === 'view-dashboard') renderDashboard();
        if (viewId === 'view-history') renderHistory();
        if (viewId === 'view-profile') renderStats();
    }
};

// Eventy nawigacji dolnej
document.querySelectorAll('.bottom-nav button').forEach(btn => {
    btn.onclick = () => window.app.navigate(btn.dataset.target);
});

// --- LOGIKA APLIKACJI ---

// 1. Dashboard
function renderDashboard() {
    const grid = document.getElementById('daysGrid');
    grid.innerHTML = '';
    Object.keys(state.plans).forEach(day => {
        const count = state.plans[day].length;
        const el = document.createElement('div');
        el.className = 'day-card';
        el.innerHTML = `<h3>${day}</h3><span>${count} ćwiczeń</span>`;
        el.onclick = () => openEditor(day);
        grid.appendChild(el);
    });
}

// 2. Edytor
let currentDay = null;
function openEditor(day) {
    currentDay = day;
    document.getElementById('editorTitle').innerText = day;
    renderEditorList();
    const btnStart = document.getElementById('btnStartWorkout');
    
    if (state.plans[day].length > 0) {
        btnStart.style.display = 'flex';
        btnStart.onclick = () => startWorkout(day);
    } else {
        btnStart.style.display = 'none';
    }
    
    app.navigate('view-editor');
}

function renderEditorList() {
    const list = document.getElementById('editorList');
    list.innerHTML = '';
    state.plans[currentDay].forEach((ex, i) => {
        const div = document.createElement('div');
        div.className = 'exercise-item';
        div.innerHTML = `
            <div><strong>${ex.name}</strong><br><small>${ex.sets} x ${ex.reps}</small></div>
            <button class="btn-action" style="background:var(--danger);width:35px;height:35px;font-size:1rem" id="del-${i}">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        list.appendChild(div);
        div.querySelector(`#del-${i}`).onclick = () => {
            state.plans[currentDay].splice(i, 1);
            saveData();
            renderEditorList();
        };
    });
}

document.getElementById('btnAddEx').onclick = () => {
    const name = document.getElementById('exName').value;
    const sets = document.getElementById('exSets').value;
    const reps = document.getElementById('exReps').value;
    if (name) {
        state.plans[currentDay].push({ name, sets, reps });
        document.getElementById('exName').value = '';
        saveData();
        renderEditorList();
    }
};

// 3. Trening
function startWorkout(day) {
    if (state.activeWorkout.isActive && !confirm("Masz aktywny trening. Zastąpić go?")) return;

    state.activeWorkout = {
        isActive: true,
        day: day,
        startTime: Date.now(),
        exercises: state.plans[day].map(ex => ({ ...ex, logs: [] }))
    };
    
    document.getElementById('navWorkout').style.display = 'flex';
    saveData();
    startTimer();
    renderWorkoutView();
    app.navigate('view-workout');
}

function renderWorkoutView() {
    const list = document.getElementById('workoutList');
    const w = state.activeWorkout;
    document.getElementById('workoutTitle').innerText = w.day;
    list.innerHTML = '';

    w.exercises.forEach((ex, i) => {
        const card = document.createElement('div');
        card.className = 'card';
        let logsHtml = ex.logs.map((l, li) => 
            `<div style="display:flex;justify-content:space-between;color:var(--success);margin-top:5px;border-bottom:1px solid #333;padding-bottom:5px;">
                <span>Seria ${li+1}</span> <span>${l.kg}kg x ${l.reps}</span>
            </div>`
        ).join('');

        card.innerHTML = `
            <h3>${ex.name} <small>(${ex.sets}x${ex.reps})</small></h3>
            <div style="margin:10px 0">${logsHtml}</div>
            <div class="set-inputs">
                <input type="number" placeholder="kg" id="w-${i}">
                <input type="number" placeholder="pow" value="${ex.reps}" id="r-${i}">
                <button class="btn-action" id="ok-${i}"><i class="fa-solid fa-check"></i></button>
            </div>
        `;
        list.appendChild(card);
        card.querySelector(`#ok-${i}`).onclick = () => {
            const kg = document.getElementById(`w-${i}`).value;
            const reps = document.getElementById(`r-${i}`).value;
            if (kg && reps) {
                ex.logs.push({ kg, reps });
                saveData();
                renderWorkoutView();
            }
        };
    });
}

function startTimer() {
    if (masterTimerInterval) clearInterval(masterTimerInterval);
    const display = document.getElementById('timerDisplay');
    
    masterTimerInterval = setInterval(() => {
        if (!state.activeWorkout.isActive) return;
        const diff = Date.now() - state.activeWorkout.startTime;
        const d = new Date(diff);
        display.innerText = d.toISOString().substr(11, 8);
    }, 1000);
}

document.getElementById('btnFinish').onclick = () => {
    if (confirm("Zakończyć trening?")) {
        const w = state.activeWorkout;
        const hasData = w.exercises.some(e => e.logs.length > 0);
        
        if (hasData) {
            state.logs.push({
                date: new Date().toISOString().split('T')[0],
                day: w.day,
                duration: document.getElementById('timerDisplay').innerText,
                details: w.exercises.filter(e => e.logs.length > 0)
            });
        }
        
        state.activeWorkout = { isActive: false };
        document.getElementById('navWorkout').style.display = 'none';
        clearInterval(masterTimerInterval);
        saveData();
        app.navigate('view-history');
        showToast("Trening zapisany!", "green");
    }
};

// 4. Historia i Profil
function renderHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = state.logs.slice().reverse().map(l => `
        <div class="card" style="border-left:4px solid var(--success)">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                <strong>${l.date}</strong>
                <span>${l.day}</span>
            </div>
            <div style="font-size:0.85rem;color:#aaa">Czas: ${l.duration} | Ćw: ${l.details.length}</div>
        </div>
    `).join('') || '<div style="text-align:center;padding:20px;color:#666">Brak historii</div>';
}

function renderStats() {
    const ctx = document.getElementById('statsChart');
    if (!ctx) return;
    
    const volData = {};
    state.logs.forEach(l => {
        let vol = 0;
        l.details.forEach(e => e.logs.forEach(s => vol += (Number(s.kg) * Number(s.reps))));
        volData[l.date] = (volData[l.date] || 0) + vol;
    });

    if (window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(volData),
            datasets: [{ label: 'Kg', data: Object.values(volData), backgroundColor: '#4f46e5' }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
}

// --- OBSŁUGA LOGOWANIA/WYLOGOWANIA ---
document.getElementById('authForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const errBox = document.getElementById('authError');
    
    errBox.innerText = "Przetwarzanie...";
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            try {
                await createUserWithEmailAndPassword(auth, email, pass);
            } catch (regErr) {
                errBox.innerText = regErr.message;
            }
        } else {
            errBox.innerText = "Błąd logowania: " + err.message;
        }
    }
};

document.getElementById('btnLogout').onclick = async () => {
    if (confirm("Wylogować?")) {
        await signOut(auth);
        // onAuthStateChanged obsłuży resztę
    }
};

function refreshUI() {
    const active = document.querySelector('.view.active');
    if (active) window.app.navigate(active.id);
}

function showToast(msg, color) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.borderLeft = `4px solid ${color === 'red' ? 'var(--danger)' : 'var(--success)'}`;
    t.innerText = msg;
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// Start
initApp();
