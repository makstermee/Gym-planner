import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- KONFIGURACJA (Zastąp swoimi danymi jeśli inne) ---
const firebaseConfig = {
    apiKey: "AIzaSyCacBxUhSiqaaCBrmVVKluMHMs3iMpR_cA",
    authDomain: "pro-plan-e6f00.firebaseapp.com",
    databaseURL: "https://pro-plan-e6f00-default-rtdb.europe-west1.firebasedabase.app",
    projectId: "pro-plan-e6f00",
    storageBucket: "pro-plan-e6f00.firebasestorage.app",
    messagingSenderId: "887703996706",
    appId: "1:887703996706:web:b7363c891b41b7d4697d7b",
    measurementId: "G-1WTB0NNLEB"
};

// --- INIT ---
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase Init Error:", e);
    alert("Błąd krytyczny konfiguracji Firebase.");
}

// --- STATE MANAGER (Model) ---
const InitialState = {
    plans: {
        "Poniedziałek": [], "Wtorek": [], "Środa": [], 
        "Czwartek": [], "Piątek": [], "Sobota": [], "Niedziela": []
    },
    logs: [],
    activeWorkout: { isActive: false, day: null, startTime: null, exercises: [] }
};

class Store {
    constructor() {
        this.data = JSON.parse(JSON.stringify(InitialState));
        this.user = null;
        this.listeners = [];
        this.unsavedChanges = false;
        this.saveTimer = null;
        
        // Załaduj z Cache na start (Instant Load)
        const cached = localStorage.getItem("gym_cache");
        if(cached) {
            try { this.data = JSON.parse(cached); } 
            catch(e) { console.error("Cache corrupted"); }
        }
    }

    // Metoda do aktualizacji stanu
    update(newData, saveToCloud = true) {
        this.data = { ...this.data, ...newData };
        this.notify();
        
        // Zapisz lokalnie
        localStorage.setItem("gym_cache", JSON.stringify(this.data));
        
        if(saveToCloud && this.user) {
            this.triggerCloudSave();
        }
    }

    // Debounce Cloud Save (Opóźniony zapis)
    triggerCloudSave() {
        this.unsavedChanges = true;
        UI.updateSyncStatus('saving');
        
        if(this.saveTimer) clearTimeout(this.saveTimer);
        
        this.saveTimer = setTimeout(async () => {
            try {
                await setDoc(doc(db, "users", this.user.uid), { appData: this.data }, { merge: true });
                this.unsavedChanges = false;
                UI.updateSyncStatus('online');
            } catch (err) {
                console.error("Cloud save fail:", err);
                UI.updateSyncStatus('error');
            }
        }, 2000); // 2 sekundy opóźnienia
    }

    subscribe(fn) { this.listeners.push(fn); }
    notify() { this.listeners.forEach(fn => fn(this.data)); }
    
    reset() {
        this.data = JSON.parse(JSON.stringify(InitialState));
        this.user = null;
        localStorage.removeItem("gym_cache");
        this.notify();
    }
}

const store = new Store();

// --- UI CONTROLLER ---
const UI = {
    loader: document.getElementById('globalLoader'),
    views: document.querySelectorAll('.view'),
    navItems: document.querySelectorAll('.nav-item'),
    
    hideLoader: () => {
        const l = document.getElementById('globalLoader');
        if(l) { l.style.opacity = '0'; setTimeout(() => l.style.display = 'none', 500); }
    },

    showToast: (msg, type='info') => {
        const div = document.createElement('div');
        div.className = 'toast';
        div.textContent = msg;
        div.style.borderColor = type === 'error' ? 'var(--danger)' : 'var(--success)';
        document.getElementById('toastArea').appendChild(div);
        setTimeout(() => div.remove(), 3500);
    },

    updateSyncStatus: (status) => {
        const el = document.getElementById('syncStatus');
        el.className = 'status-dot';
        if(status === 'online') el.classList.add('online');
        if(status === 'saving') el.classList.add('saving');
    },

    navigate: (targetId) => {
        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active');
            v.style.display = 'none'; // Optymalizacja renderowania
        });
        
        const target = document.getElementById(targetId);
        if(target) {
            target.style.display = 'block';
            // setTimeout dla animacji CSS
            setTimeout(() => target.classList.add('active'), 10);
        }

        // Nav icons
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const btn = document.querySelector(`button[data-target="${targetId}"]`);
        if(btn) btn.classList.add('active');

        // Specyficzne odświeżania
        if(targetId === 'view-dashboard') Render.dashboard();
        if(targetId === 'view-history') Render.history();
        if(targetId === 'view-profile') Render.profile();
    }
};

// --- RENDER LOGIC ---
const Render = {
    dashboard: () => {
        const grid = document.getElementById('dashboardGrid');
        grid.innerHTML = '';
        const today = new Date().toLocaleDateString('pl-PL', {weekday:'long'});
        document.getElementById('currentDateDisplay').textContent = today;

        Object.keys(store.data.plans).forEach(day => {
            const count = store.data.plans[day].length;
            const el = document.createElement('div');
            el.className = 'card-day';
            el.innerHTML = `<div style="font-weight:bold;font-size:1.1rem">${day}</div>
                            <div style="color:var(--text-muted);font-size:0.9rem">${count} ćwiczeń</div>`;
            el.onclick = () => {
                currentEditingDay = day;
                Render.editor(day);
                UI.navigate('view-editor');
            };
            grid.appendChild(el);
        });
    },

    editor: (day) => {
        document.getElementById('editorTitle').textContent = day;
        const list = document.getElementById('editorList');
        list.innerHTML = '';
        
        store.data.plans[day].forEach((ex, idx) => {
            const item = document.createElement('div');
            item.className = 'exercise-card';
            item.innerHTML = `
                <div>
                    <div style="font-weight:600">${ex.name}</div>
                    <div style="font-size:0.85rem;color:var(--text-muted)">${ex.sets} serii x ${ex.reps} powt.</div>
                </div>
                <button class="btn-icon" style="color:var(--danger)"><i class="fa-solid fa-trash"></i></button>
            `;
            item.querySelector('button').onclick = () => {
                const newPlans = { ...store.data.plans };
                newPlans[day].splice(idx, 1);
                store.update({ plans: newPlans });
                Render.editor(day);
            };
            list.appendChild(item);
        });

        // Button Start
        const fab = document.getElementById('startWorkoutBtn');
        if(store.data.plans[day].length > 0) {
            fab.style.display = 'flex';
            fab.onclick = () => Logic.startWorkout(day);
        } else {
            fab.style.display = 'none';
        }
    },

    workout: () => {
        const w = store.data.activeWorkout;
        document.getElementById('workoutDayLabel').textContent = w.day;
        const list = document.getElementById('workoutExercisesList');
        list.innerHTML = '';

        w.exercises.forEach((ex, idx) => {
            const card = document.createElement('div');
            card.className = 'exercise-card';
            card.style.display = 'block'; // Override flex
            
            let logsHTML = ex.logs.map((l, i) => 
                `<div class="log-entry"><span>Seria ${i+1}</span> <span style="color:var(--success)">${l.weight}kg x ${l.reps}</span></div>`
            ).join('');

            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                    <strong>${ex.name}</strong>
                    <small>${ex.sets}x${ex.reps}</small>
                </div>
                <div id="logs-${idx}">${logsHTML}</div>
                <div class="set-logger">
                    <input type="number" id="w-${idx}" placeholder="kg">
                    <input type="number" id="r-${idx}" placeholder="pow" value="${ex.reps}">
                    <button class="btn-success" id="btn-${idx}"><i class="fa-solid fa-check"></i></button>
                </div>
            `;
            list.appendChild(card);

            card.querySelector(`#btn-${idx}`).onclick = () => {
                const wVal = document.getElementById(`w-${idx}`).value;
                const rVal = document.getElementById(`r-${idx}`).value;
                if(wVal && rVal) {
                    ex.logs.push({ weight: wVal, reps: rVal });
                    store.update({ activeWorkout: w }); // Zapisz stan treningu
                    Render.workout(); // Rerender
                }
            };
        });
    },

    history: () => {
        const list = document.getElementById('historyList');
        list.innerHTML = store.data.logs.slice().reverse().map(l => `
            <div class="exercise-card" style="border-left-color:var(--success); display:block">
                <div style="display:flex;justify-content:space-between">
                    <strong>${l.date}</strong>
                    <span>${l.day}</span>
                </div>
                <div style="margin-top:5px;font-size:0.85rem;color:var(--text-muted)">
                    Czas: ${l.duration} | Wykonane ćwiczenia: ${l.details.length}
                </div>
            </div>
        `).join('') || '<p style="text-align:center;color:#666;margin-top:20px">Brak historii treningów.</p>';
    },

    profile: () => {
        const ctx = document.getElementById('volumeChart');
        if(window.myChart) window.myChart.destroy();
        
        const dataMap = {};
        store.data.logs.forEach(l => {
            let vol = 0;
            l.details.forEach(ex => {
                ex.logs.forEach(s => vol += (Number(s.weight) * Number(s.reps)));
            });
            dataMap[l.date] = (dataMap[l.date] || 0) + vol;
        });

        window.myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(dataMap),
                datasets: [{
                    label: 'Objętość (kg)',
                    data: Object.values(dataMap),
                    backgroundColor: '#6366f1',
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true, grid: { color: '#333'} }, x: { grid: { display: false } } },
                plugins: { legend: { display: false } }
            }
        });
    }
};

// --- LOGIC & HANDLERS ---
let currentEditingDay = null;
let masterTimerInt = null;

const Logic = {
    startWorkout: (day) => {
        if(store.data.activeWorkout.isActive) {
            if(!confirm("Masz aktywny trening. Zastąpić go?")) return;
        }
        
        const newWorkout = {
            isActive: true,
            day: day,
            startTime: Date.now(),
            exercises: store.data.plans[day].map(e => ({ ...e, logs: [] }))
        };
        
        store.update({ activeWorkout: newWorkout });
        Logic.initTimer();
        UI.navigate('view-workout');
        document.getElementById('navWorkoutBtn').style.display = 'flex';
    },

    initTimer: () => {
        if(masterTimerInt) clearInterval(masterTimerInt);
        const display = document.getElementById('workoutTimer');
        
        masterTimerInt = setInterval(() => {
            if(!store.data.activeWorkout.isActive) return;
            const diff = Date.now() - store.data.activeWorkout.startTime;
            const d = new Date(diff);
            display.textContent = d.toISOString().substr(11, 8);
        }, 1000);
    },

    finishWorkout: () => {
        if(!confirm("Zakończyć trening?")) return;
        
        const w = store.data.activeWorkout;
        const validExercises = w.exercises.filter(e => e.logs.length > 0);
        
        if(validExercises.length > 0) {
            const logEntry = {
                date: new Date().toISOString().split('T')[0],
                day: w.day,
                duration: document.getElementById('workoutTimer').textContent,
                details: validExercises
            };
            const newLogs = [...store.data.logs, logEntry];
            store.update({ logs: newLogs, activeWorkout: { isActive: false } });
            UI.showToast("Trening zapisany!", "success");
        } else {
            store.update({ activeWorkout: { isActive: false } });
            UI.showToast("Pusty trening anulowany.");
        }

        clearInterval(masterTimerInt);
        document.getElementById('navWorkoutBtn').style.display = 'none';
        UI.navigate('view-history');
    }
};

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. SAFETY VALVE (Zabezpieczenie przed infinite load)
    setTimeout(() => {
        const loader = document.getElementById('globalLoader');
        if(loader && loader.style.opacity !== '0') {
            console.warn("⚠️ Loader timeout - wymuszam otwarcie.");
            UI.hideLoader();
            if(!store.user) UI.navigate('view-auth');
        }
    }, 5000); // Po 5 sekundach loader zniknie zawsze.

    // 2. Navigation
    document.querySelectorAll('button[data-target]').forEach(btn => {
        btn.onclick = () => UI.navigate(btn.dataset.target);
    });

    // 3. Add Exercise
    document.getElementById('addExerciseBtn').onclick = () => {
        const name = document.getElementById('exNameInput').value;
        const sets = document.getElementById('exSetsInput').value;
        const reps = document.getElementById('exRepsInput').value;
        
        if(name && currentEditingDay) {
            const newPlans = { ...store.data.plans };
            newPlans[currentEditingDay].push({ name, sets, reps });
            store.update({ plans: newPlans });
            document.getElementById('exNameInput').value = '';
            Render.editor(currentEditingDay);
        }
    };

    // 4. Finish Workout
    document.getElementById('finishWorkoutBtn').onclick = Logic.finishWorkout;

    // 5. Auth Form
    document.getElementById('authForm').onsubmit = async (e) => {
        e.preventDefault();
        const em = document.getElementById('authEmail').value;
        const pass = document.getElementById('authPass').value;
        const msg = document.getElementById('authMsg');
        
        msg.textContent = "Przetwarzanie...";
        try {
            await signInWithEmailAndPassword(auth, em, pass);
        } catch (err) {
            if(err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                try {
                    await createUserWithEmailAndPassword(auth, em, pass);
                    msg.textContent = "Utworzono nowe konto!";
                } catch (regErr) {
                    msg.textContent = regErr.message;
                }
            } else {
                msg.textContent = err.message;
            }
        }
    };

    // 6. Logout
    document.getElementById('logoutBtn').onclick = async () => {
        if(confirm("Wylogować?")) {
            await signOut(auth);
            store.reset();
            window.location.reload(); // Najczystsze wylogowanie
        }
    };
});

// --- FIREBASE AUTH LISTENER (MAIN ENTRY) ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // ZALOGOWANY
        store.user = user;
        document.getElementById('userEmailDisplay').textContent = user.email;
        UI.hideLoader(); // Natychmiast pokaż UI (cache)
        
        // POBIERZ DANE Z CHMURY (Merge Strategy)
        try {
            const docRef = doc(db, "users", user.uid);
            const snap = await getDoc(docRef);
            
            if (snap.exists()) {
                const cloudData = snap.data().appData;
                if(cloudData) {
                    console.log("☁️ Pobranno dane.");
                    // Scalaj mądrze (nadpisz lokalne chmurą)
                    store.data = { ...store.data, ...cloudData };
                    store.update(store.data, false); // false = nie wysyłaj z powrotem od razu
                    
                    // Odśwież widok po pobraniu
                    const activeView = document.querySelector('.view.active').id;
                    UI.navigate(activeView);

                    // Wznów timer jeśli trzeba
                    if(store.data.activeWorkout.isActive) {
                        document.getElementById('navWorkoutBtn').style.display = 'flex';
                        Logic.initTimer();
                    }
                }
            }
            UI.updateSyncStatus('online');
        } catch (e) {
            console.error("Sync error", e);
            UI.showToast("Błąd synchronizacji", "error");
        }
        
        if(document.getElementById('view-auth').classList.contains('active')) {
            UI.navigate('view-dashboard');
        }
        
    } else {
        // WYLOGOWANY
        UI.hideLoader();
        UI.navigate('view-auth');
    }
});
