// Modularne importy funkcji Firebase
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const auth = window.auth;
const db = window.db;

// --- Domyślny Stan (To co widać natychmiast) ---
const defaultUserState = {
  "plans": {
    "Poniedziałek": [], "Wtorek": [], "Środa": [],
    "Czwartek": [], "Piątek": [], "Sobota": [], "Niedziela": []
  },
  "logs": [],
  "activeWorkout": { "isActive": false, "dayName": null, "startTime": null, "exercises": [] }
};

let state = JSON.parse(JSON.stringify(defaultUserState)); 
let currentUserId = null;
let currentUserEmail = null; 
let firestoreUnsubscribe = null; 

let masterTimerInterval = null; 
let restTimerInterval = null; 
let currentRestDisplay = null; 

// --- START APLIKACJI ---
document.addEventListener('DOMContentLoaded', () => {

    // 1. ZMIENNE DOM (Pobieramy je raz)
    const dayList = document.getElementById('dayList'); // To jest najważniejsze
    const logArea = document.getElementById('logArea');
    const masterTimerDisplay = document.getElementById('masterTimerDisplay');
    const welcomeMsg = document.getElementById('welcomeMsg');
    const authError = document.getElementById('authError');
    const authForm = document.getElementById('authForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const bottomNav = document.getElementById('bottomNav');
    const configWarning = document.getElementById('configWarning');
    const panels = document.querySelectorAll('.panel');
    
    // Zmienne pomocnicze
    let statsChart = null;
    let currentDay = null;

    // --- KLUCZOWA ZMIANA: Renderujemy PUSTĄ listę natychmiast! ---
    // Nie czekamy na internet. Użytkownik widzi dni od razu.
    renderDayList(); 

    // --- Funkcje pomocnicze ---
    function showErrorModal(msg, type='error') {
        const d = document.createElement('div');
        d.className = 'modal-message';
        d.style.background = type==='error'?'var(--danger)':(type==='success'?'var(--success)':'var(--accent)');
        d.innerHTML = `<strong>${msg}</strong>`;
        document.body.appendChild(d);
        setTimeout(()=>d.remove(),3000);
    }

    function showConfirmModal(msg, onYes) {
        if(!confirm(msg)) return; // Upraszczamy modal na telefon dla szybkości
        onYes();
    }

    // --- Logika Danych ---
    function getUserDocRef() {
        if (!currentUserId || !db) return null;
        return doc(db, `users/${currentUserId}/data/user_state`);
    }

    async function saveState() {
        if (!currentUserId || !db) return;
        try { await setDoc(getUserDocRef(), state); } catch (e) { console.error(e); }
    }

    // --- Autoryzacja ---
    if (!window.IS_FIREBASE_CONFIGURED) {
        configWarning.style.display = 'block';
        authForm.style.display = 'none';
    } else {
        configWarning.style.display = 'none';
        
        onAuthStateChanged(auth, user => {
            if (user) {
                // Zalogowano
                currentUserId = user.uid;
                currentUserEmail = user.email;
                
                // UI Zalogowanego
                authForm.style.display = 'none';
                logoutBtn.style.display = 'block';
                bottomNav.style.display = 'flex';
                welcomeMsg.textContent = `, ${user.email.split('@')[0]}!`;

                // Pobieranie danych w tle (UI już jest wyświetlone!)
                const docRef = getUserDocRef();
                if(firestoreUnsubscribe) firestoreUnsubscribe();
                firestoreUnsubscribe = onSnapshot(docRef, (snap) => {
                    if (snap.exists()) {
                        const data = snap.data();
                        // Scalamy dane z chmury
                        state = { ...defaultUserState, ...data, plans: { ...defaultUserState.plans, ...(data.plans||{}) } };
                        console.log("Dane zaktualizowane.");
                    } else {
                        saveState(); // Tworzymy profil jeśli brak
                    }
                    // ODŚWIEŻAMY widok dopiero jak dane przyjdą (ale lista już tam jest)
                    renderDayList(); 
                    initAppUI(); 
                });

            } else {
                // Wylogowano
                if(firestoreUnsubscribe) firestoreUnsubscribe();
                currentUserId = null;
                state = JSON.parse(JSON.stringify(defaultUserState));
                
                authForm.style.display = 'block';
                logoutBtn.style.display = 'none';
                bottomNav.style.display = 'none';
                welcomeMsg.textContent = '';
                showPanel('panel-auth');
            }
        });
    }

    // --- Obsługa przycisków Auth ---
    loginBtn.onclick = async () => {
        const e = document.getElementById('authEmail').value;
        const p = document.getElementById('authPassword').value;
        if(!e||!p) return authError.textContent="Podaj dane.";
        try { await signInWithEmailAndPassword(auth,e,p); showPanel('panel-main'); } 
        catch(err) { authError.textContent="Błąd logowania."; }
    };
    registerBtn.onclick = async () => {
        const e = document.getElementById('authEmail').value;
        const p = document.getElementById('authPassword').value;
        if(!e||p.length<6) return authError.textContent="Hasło min 6 znaków.";
        try { await createUserWithEmailAndPassword(auth,e,p); showPanel('panel-main'); } 
        catch(err) { authError.textContent=err.message; }
    };
    logoutBtn.onclick = async () => {
        if(confirm("Wylogować?")) {
            if(masterTimerInterval) clearInterval(masterTimerInterval);
            if(auth) await signOut(auth);
        }
    };

    // --- Inicjalizacja ---
    function initAppUI() {
        // Sprawdź czy trening trwa
        if (state.activeWorkout.isActive) {
             if (!masterTimerInterval) { // Tylko jeśli timer jeszcze nie chodzi
                if (confirm("Wznowić trening?")) {
                    masterTimerInterval = setInterval(updateMasterTimer, 1000);
                    masterTimerDisplay.style.display = 'block';
                    renderActiveWorkout();
                    showPanel('panel-active-workout');
                } else {
                    state.activeWorkout.isActive = false;
                    saveState();
                }
             }
        }
        renderLogs();
    }

    // --- Renderowanie Listy Dni (To jest to szybkie!) ---
    function renderDayList() {
      if (!dayList) return;
      dayList.innerHTML = '';
      Object.keys(state.plans).forEach(dayName => {
        const count = state.plans[dayName] ? state.plans[dayName].length : 0;
        const btn = document.createElement('button');
        btn.className = 'day-btn';
        // To się wyświetli od razu jako 0, a potem zmieni na np. 5
        btn.innerHTML = `<span>${dayName}</span><span>(${count} ćw.)</span>`;
        btn.onclick = () => showPlanDetails(dayName);
        dayList.appendChild(btn);
      });
    }

    // --- Reszta Funkcji (Skrócona dla czytelności, działa tak samo) ---
    function showPanel(id) {
        panels.forEach(p=>p.classList.remove('active'));
        const target = document.getElementById(id);
        if(target) target.classList.add('active');
        document.querySelectorAll('.bottom-nav button').forEach(b=>{
            b.classList.remove('active');
            if(b.dataset.panel===id) b.classList.add('active');
        });
        if(id==='panel-stats' && !statsChart) initStatsChart();
        if(id==='panel-stats') updateStatsChart();
    }

    document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>showPanel(b.dataset.panel));
    document.getElementById('backToMainBtn').onclick=()=>showPanel('panel-main');
    
    // Szczegóły planu
    function showPlanDetails(day) {
        currentDay = day;
        document.getElementById('planDetailsTitle').textContent = `Plan: ${day}`;
        const list = document.getElementById('planDetailsList');
        list.innerHTML = '';
        const plan = state.plans[day] || [];
        if(!plan.length) list.innerHTML='<p style="text-align:center;color:#888">Pusto. Dodaj ćwiczenia.</p>';
        else plan.forEach(ex=> {
            const d=document.createElement('div'); d.className='card';
            d.innerHTML=`<div><strong>${ex.name}</strong><br><small>${ex.targetSets}x${ex.targetReps}</small></div>`;
            list.appendChild(d);
        });
        document.getElementById('editPlanBtn').onclick=()=>showPlanEditor(day);
        document.getElementById('startWorkoutBtn').onclick=()=>startWorkout(day);
        showPanel('panel-plan-details');
    }

    // Edytor
    function showPlanEditor(day) {
        currentDay = day;
        document.getElementById('editPlanTitle').textContent=`Edycja: ${day}`;
        renderEditList();
        document.getElementById('addExerciseBtn').onclick = () => {
            const n = document.getElementById('exName').value;
            const s = document.getElementById('exTargetSets').value;
            const r = document.getElementById('exTargetReps').value;
            if(n && s && r) {
                if(!state.plans[day]) state.plans[day]=[];
                state.plans[day].push({name:n, targetSets:s, targetReps:r});
                saveState(); renderEditList(); document.getElementById('exName').value='';
            }
        };
        document.getElementById('savePlanChangesBtn').onclick=()=>{
            renderDayList(); showPlanDetails(day);
        };
        showPanel('panel-edit-plan');
    }
    function renderEditList() {
        const list = document.getElementById('editPlanList'); list.innerHTML='';
        (state.plans[currentDay]||[]).forEach((ex,i)=>{
            const d=document.createElement('div'); d.className='card';
            d.innerHTML=`${ex.name} <button class="btn-danger" style="width:50px">X</button>`;
            d.querySelector('button').onclick=()=>{
                state.plans[currentDay].splice(i,1); saveState(); renderEditList();
            };
            list.appendChild(d);
        });
    }

    // Trening
    function startWorkout(day) {
        if(!state.plans[day] || !state.plans[day].length) return alert("Pusty plan!");
        state.activeWorkout = { isActive:true, dayName:day, startTime:Date.now(), exercises: state.plans[day].map(e=>({...e, loggedSets:[]})) };
        if(masterTimerInterval) clearInterval(masterTimerInterval);
        masterTimerInterval = setInterval(updateMasterTimer,1000);
        masterTimerDisplay.style.display='block';
        saveState(); renderActiveWorkout(); showPanel('panel-active-workout');
    }

    function renderActiveWorkout() {
        const list = document.getElementById('activeWorkoutList'); list.innerHTML='';
        document.getElementById('activeWorkoutTitle').textContent = state.activeWorkout.dayName;
        state.activeWorkout.exercises.forEach((ex,i)=>{
            const d=document.createElement('div'); d.className='workout-card';
            let sets = ex.loggedSets.map((s,si)=>`<div>Seria ${si+1}: ${s.weight}kg x ${s.reps}</div>`).join('');
            d.innerHTML=`<h3>${ex.name}</h3><div style="margin:10px 0;padding:5px;background:rgba(0,0,0,0.3)">${sets}</div>
            <input type="number" placeholder="kg" id="w-${i}" style="width:60px"> <input type="number" placeholder="pow" id="r-${i}" style="width:60px"> 
            <button class="btn-success" id="btn-${i}">OK</button>`;
            list.appendChild(d);
            d.querySelector(`#btn-${i}`).onclick=()=>{
                const w=document.getElementById(`w-${i}`).value; const r=document.getElementById(`r-${i}`).value;
                if(w&&r) { ex.loggedSets.push({weight:w, reps:r}); saveState(); renderActiveWorkout(); }
            };
        });
        document.getElementById('finishWorkoutBtn').onclick=()=>{
            if(!confirm("Zakończyć?")) return;
            clearInterval(masterTimerInterval); masterTimerDisplay.style.display='none';
            state.logs.push({date:new Date().toISOString().split('T')[0], dayName:state.activeWorkout.dayName, duration:masterTimerDisplay.textContent, exercises:state.activeWorkout.exercises.filter(e=>e.loggedSets.length)});
            state.activeWorkout={isActive:false}; saveState(); renderLogs(); showPanel('panel-logs');
        };
    }
    
    function updateMasterTimer() {
        if(!state.activeWorkout.startTime) return;
        const diff = Date.now() - state.activeWorkout.startTime;
        masterTimerDisplay.textContent = new Date(diff).toISOString().slice(11,19);
    }

    // Logi i Wykresy
    function renderLogs() {
        logArea.innerHTML = state.logs.slice().reverse().map(l=>`<div class="card" style="border-left:4px solid green;padding:10px;margin-bottom:5px">
            <strong>${l.date}</strong> ${l.dayName} (${l.duration})<br>
            <small>${l.exercises.length} ćwiczeń</small>
        </div>`).join('') || '<p style="text-align:center;color:#888">Brak historii.</p>';
    }
    
    function initStatsChart() {
        const ctx = document.getElementById('statsChart');
        if(!ctx) return;
        statsChart = new Chart(ctx.getContext('2d'), {
            type:'bar', data:{labels:[], datasets:[{label:'Kg',data:[],backgroundColor:'#ff5722'}]},
            options:{responsive:true, maintainAspectRatio:false, scales:{y:{ticks:{color:'#fff'}},x:{ticks:{color:'#fff'}}},plugins:{legend:{display:false}}}
        });
    }
    function updateStatsChart() {
        if(!statsChart) return;
        const data = {};
        state.logs.forEach(l=>{
            const vol = l.exercises.reduce((acc,e)=>acc+e.loggedSets.reduce((a,s)=>a+(s.weight*s.reps),0),0);
            if(vol>0) data[l.date] = (data[l.date]||0)+vol;
        });
        statsChart.data.labels=Object.keys(data).sort();
        statsChart.data.datasets[0].data=Object.values(data);
        statsChart.update();
    }
    
    // Import/Export
    document.getElementById('exportBtn').onclick=()=>{
        const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(state.logs)],{type:'application/json'}));
        a.download='trening.json'; a.click();
    };
    document.getElementById('importBtn').onclick=()=>document.getElementById('fileInput').click();
    document.getElementById('fileInput').onchange=(e)=>{
        const r=new FileReader(); r.onload=async()=>{ state.logs=JSON.parse(r.result); await saveState(); renderLogs(); };
        if(e.target.files[0]) r.readAsText(e.target.files[0]);
    };
    document.getElementById('clearHistory').onclick=async()=>{ 
        if(confirm("Usunąć?")) { state.logs=[]; await saveState(); renderLogs(); } 
    };

});
