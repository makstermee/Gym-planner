// --- WERSJA DIAGNOSTYCZNA (SPY MODE) ---
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const auth = window.auth;
const db = window.db;

// --- SYSTEM LOGOWANIA NA EKRANIE (DLA TELEFONU) ---
const debugConsole = document.createElement('div');
debugConsole.style.cssText = "position:fixed;top:0;left:0;width:100%;height:200px;background:rgba(0,0,0,0.9);color:#0f0;font-family:monospace;font-size:10px;z-index:10000;overflow-y:scroll;padding:5px;border-bottom:2px solid #fff;pointer-events:none;";
document.body.appendChild(debugConsole);

function log(msg, color = '#0f0') {
    const line = document.createElement('div');
    line.style.color = color;
    line.style.marginBottom = "2px";
    const time = new Date().toLocaleTimeString();
    line.textContent = `[${time}] ${msg}`;
    debugConsole.appendChild(line);
    debugConsole.scrollTop = debugConsole.scrollHeight;
    console.log(msg);
}

log("--- START DIAGNOSTYKI ---", "white");

// --- STAN ---
const defaultUserState = {
  "plans": { "Poniedziałek": [], "Wtorek": [], "Środa": [], "Czwartek": [], "Piątek": [], "Sobota": [], "Niedziela": [] },
  "logs": [],
  "activeWorkout": { "isActive": false }
};
let state = JSON.parse(JSON.stringify(defaultUserState)); 
let currentUserId = null;
let firestoreUnsubscribe = null; 
let DB_SYNCED = false;

// --- START ---
document.addEventListener('DOMContentLoaded', () => {
    log("DOM załadowany. Szukam elementów...", "white");

    // Elementy (uproszczone dla diagnostyki)
    const dayList = document.getElementById('dayList');
    const authForm = document.getElementById('authForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const panels = document.querySelectorAll('.panel');
    
    if (!window.IS_FIREBASE_CONFIGURED) {
        log("BŁĄD KRYTYCZNY: Brak konfiguracji Firebase w index.html!", "red");
        return;
    }

    onAuthStateChanged(auth, user => {
        if (user) {
            currentUserId = user.uid;
            log(`ZALOGOWANO: ${user.email}`, "yellow");
            log(`UID: ${user.uid}`, "gray");
            
            authForm.style.display = 'none';
            logoutBtn.style.display = 'block';
            
            startDatabaseListener();

        } else {
            log("Status: Wylogowany.", "orange");
            currentUserId = null;
            DB_SYNCED = false;
            authForm.style.display = 'block';
            logoutBtn.style.display = 'none';
            showPanel('panel-auth');
        }
    });

    function startDatabaseListener() {
        log("Rozpoczynam nasłuchiwanie bazy...", "cyan");
        const docPath = `users/${currentUserId}/data/user_state`;
        log(`Ścieżka: ${docPath}`, "gray");
        
        const docRef = doc(db, docPath);
        
        if(firestoreUnsubscribe) firestoreUnsubscribe();

        firestoreUnsubscribe = onSnapshot(docRef, (snap) => {
            const source = snap.metadata.hasPendingWrites ? "Lokalne" : "Serwer";
            log(`Odebrano dane (${source})`, "cyan");

            if (snap.exists()) {
                const data = snap.data();
                const planCount = Object.keys(data.plans || {}).length;
                const logsCount = (data.logs || []).length;
                
                log(`✅ DANE ISTNIEJĄ! Plany: ${planCount}, Historia: ${logsCount}`, "#0f0");
                
                // Sprawdź czy plany nie są puste
                let totalExercises = 0;
                Object.values(data.plans || {}).forEach(p => totalExercises += p.length);
                log(`Łączna liczba ćwiczeń w bazie: ${totalExercises}`, totalExercises > 0 ? "#0f0" : "orange");

                state = { ...defaultUserState, ...data };
                DB_SYNCED = true;
                renderDayList();
            } else {
                log("⚠️ DOKUMENT NIE ISTNIEJE (Brak danych w bazie)", "yellow");
                log("To normalne TYLKO dla nowego konta.", "gray");
                DB_SYNCED = true; // Pozwalamy na zapis nowego
                renderDayList();
            }
        }, (error) => {
            log(`❌ BŁĄD POBIERANIA: ${error.code}`, "red");
            log(`Treść: ${error.message}`, "red");
            
            if (error.code === 'permission-denied') {
                log("!!! TO JEST PRZYCZYNA !!!", "magenta");
                log("Musisz naprawić reguły w konsoli Firebase.", "magenta");
            }
        });
    }

    // --- ZAPIS ---
    async function saveState() {
        if (!currentUserId) return;
        log("Próba zapisu...", "white");
        
        if (!DB_SYNCED) {
            log("⛔ ZAPIS ZABLOKOWANY: Dane nie pobrane.", "red");
            return;
        }

        try {
            log("Wysyłanie do Firebase...", "gray");
            await setDoc(doc(db, `users/${currentUserId}/data/user_state`), state);
            log("✅ ZAPIS UDANY (Potwierdzone)", "#0f0");
        } catch (e) {
            log(`❌ BŁĄD ZAPISU: ${e.code}`, "red");
            log(`${e.message}`, "red");
        }
    }

    // --- INTERFEJS (Minimum do testu) ---
    loginBtn.onclick = async () => {
        const e = document.getElementById('authEmail').value;
        const p = document.getElementById('authPassword').value;
        try { await signInWithEmailAndPassword(auth,e,p); showPanel('panel-main'); } 
        catch(err) { log("Błąd logowania: " + err.message, "red"); }
    };

    logoutBtn.onclick = async () => {
        if(confirm("Wylogować?")) await signOut(auth);
    };

    // Prosty render do testu
    function renderDayList() {
        if (!dayList) return;
        dayList.innerHTML = '';
        Object.keys(state.plans).forEach(day => {
            const btn = document.createElement('button');
            btn.className = 'day-btn';
            const count = state.plans[day].length;
            btn.innerHTML = `${day} (${count})`;
            // TESTOWE DODAWANIE: Kliknij dzień, żeby dodać testowe ćwiczenie
            btn.onclick = () => {
                if(confirm(`Dodać TESTOWE ćwiczenie do: ${day}?`)) {
                    state.plans[day].push({name: "Test " + Date.now(), targetSets: 3, targetReps: 10});
                    log(`Dodano ćwiczenie do RAM. Zapisuję...`, "yellow");
                    saveState();
                    renderDayList();
                }
            };
            dayList.appendChild(btn);
        });
    }

    function showPanel(id) {
        panels.forEach(p=>p.classList.remove('active'));
        const t = document.getElementById(id);
        if(t) t.classList.add('active');
    }
    
    document.getElementById('backToMainBtn').onclick=()=>showPanel('panel-main');
});
