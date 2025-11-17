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

// --- Domyślny Stan (Pusty) ---
const defaultUserState = {
  "plans": {
    "Poniedziałek": [], "Wtorek": [], "Środa": [],
    "Czwartek": [], "Piątek": [], "Sobota": [], "Niedziela": []
  },
  "logs": [],
  "activeWorkout": { "isActive": false, "dayName": null, "startTime": null, "exercises": [] }
};

// Głęboka kopia stanu domyślnego
let state = JSON.parse(JSON.stringify(defaultUserState)); 

let currentUserId = null;
let firestoreUnsubscribe = null; 
let masterTimerInterval = null; 
let statsChart = null;
let currentDay = null;

// --- BEZPIECZNIKI ---
// DB_SYNCED: True tylko wtedy, gdy pomyślnie pobraliśmy dane z chmury.
let DB_SYNCED = false; 

// --- START APLIKACJI ---
document.addEventListener('DOMContentLoaded', () => {

    // Zmienne DOM
    const appLoader = document.getElementById('appLoader');
    const dayList = document.getElementById('dayList');
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
    
    function hideLoader() {
        if(appLoader) appLoader.style.display = 'none';
    }
    function showLoader() {
        if(appLoader) appLoader.style.display = 'flex';
    }

    // --- Autoryzacja i Bezpieczne Pobieranie ---
    if (!window.IS_FIREBASE_CONFIGURED) {
        configWarning.style.display = 'block';
        authForm.style.display = 'none';
        hideLoader();
    } else {
        configWarning.style.display = 'none';
        
        onAuthStateChanged(auth, user => {
            if (user) {
                // 1. Użytkownik zalogowany
                currentUserId = user.uid;
                
                // Resetujemy flagę synchronizacji - NIC NIE ZAPISUJEMY
                DB_SYNCED = false; 

                authForm.style.display = 'none';
                logoutBtn.style.display = 'block';
                bottomNav.style.display = 'flex';
                welcomeMsg.textContent = `, ${user.email.split('@')[0]}!`;

                // 2. Podłączamy nasłuchwianie bazy
                const docRef = doc(db, `users/${currentUserId}/data/user_state`);
                
                if(firestoreUnsubscribe) firestoreUnsubscribe();
                
                firestoreUnsubscribe = onSnapshot(docRef, (snap) => {
                    if (snap.exists()) {
                        // DANE ISTNIEJĄ W CHMURZE - POBIERAMY
                        const data = snap.data();
                        
                        // Scalamy ostrożnie
                        state = { 
                            ...defaultUserState, 
                            ...data, 
                            plans: { ...defaultUserState.plans, ...(data.plans||{}) } 
                        };
                        
                        console.log("✅ POBRANO DANE Z CHMURY");
                        DB_SYNCED = true; // Teraz (i tylko teraz) można zapisywać
                    } else {
                        // DANE NIE ISTNIEJĄ (Nowy użytkownik)
                        console.log("ℹ️ Profil pusty (nowy użytkownik).");
                        // Nie nadpisujemy state, zostawiamy domyślny.
                        // Ale pozwalamy na zapis, żeby użytkownik mógł utworzyć plan.
                        DB_SYNCED = true; 
                    }
                    
                    // Odświeżamy widok po pobraniu danych
                    renderDayList(); 
                    initAppUI(); // Inicjalizacja UI (ale bez auto-zapisu!)
                    hideLoader(); 
                    
                }, (error) => {
                    console.error("❌ Błąd Firebase:", error);
                    hideLoader(); 
                    showErrorModal("Błąd synchronizacji. Sprawdź internet.");
                    // W razie błędu NIE ustawiamy DB_SYNCED = true, żeby nie nadpisać bazy pustką.
                });

            } else {
                // Wylogowano
                if(firestoreUnsubscribe) firestoreUnsubscribe();
                currentUserId = null;
                DB_SYNCED = false;
                state = JSON.parse(JSON.stringify(defaultUserState));
                
                authForm.style.display = 'block';
                logoutBtn.style.display = 'none';
                bottomNav.style.display = 'none';
                welcomeMsg.textContent = '';
                showPanel('panel-auth');
                hideLoader();
            }
        });
    }

    // --- FUNKCJA ZAPISU (Sercem poprawki) ---
    async function saveState() {
        if (!currentUserId || !db) return;
        
        // ⛔ TWARDA BLOKADA ⛔
        // Jeśli nie pobraliśmy jeszcze danych z chmury, nie mamy prawa nic wysłać.
        if (!DB_SYNCED) {
            console.warn("⛔ ZABLOKOWANO PRÓBĘ NADPISANIA DANYCH (Jeszcze się nie wczytały)");
            return; 
        }

        try { 
            await setDoc(doc(db, `users/${currentUserId}/data/user_state`), state); 
            console.log("💾 Zapisano stan w chmurze.");
        } catch (e) { 
            console.error("Błąd zapisu:", e);
            showErrorModal("Nie udało się zapisać (błąd sieci?)");
        }
    }

    // --- Logika Aplikacji ---

    loginBtn.onclick = async () => {
        const e = document.getElementById('authEmail').value;
        const p = document.getElementById('authPassword').value;
        if(!e||!p) return authError.textContent="Podaj dane.";
        showLoader();
        try { await signInWithEmailAndPassword(auth,e,p); showPanel('panel-main'); } 
        catch(err) { authError.textContent="Błąd logowania."; hideLoader(); }
    };

    registerBtn.onclick = async () => {
        const e = document.getElementById('authEmail').value;
        const p = document.getElementById('authPassword').value;
        if(!e||p.length<6) return authError.textContent="Hasło min 6 znaków.";
        showLoader();
        try { await createUserWithEmailAndPassword(auth,e,p); showPanel('panel-main'); } 
        catch(err) { authError.textContent=err.message; hideLoader(); }
    };

    logoutBtn.onclick = async () => {
        if(confirm("Wylogować?")) {
            if(masterTimerInterval) clearInterval(masterTimerInterval);
            if(auth) await signOut(auth);
        }
    };

    // --- Inicjalizacja UI (Bezpieczna) ---
    function initAppUI() {
        // UWAGA: Usunięto stąd saveState()! Aplikacja tylko czyta, nie pisze przy starcie.
        
        if (state.activeWorkout.isActive && !masterTimerInterval) {
            // Mamy aktywny trening w pobranym stanie
            if (confirm("Wznowić trening wykryty w chmurze?")) {
                masterTimerInterval = setInterval(updateMasterTimer, 1000);
                masterTimerDisplay.style.display = 'block';
                renderActiveWorkout();
                showPanel('panel-active-workout');
            } else {
                // Użytkownik ANULOWAŁ wznowienie
                state.activeWorkout.isActive = false;
                saveState(); // To jest bezpieczne - user sam podjął decyzję
            }
        }
        renderLogs();
    }

    function renderDayList() {
      if (!dayList) return;
      dayList.innerHTML = '';
      Object.keys(state.plans).forEach(dayName => {
        const count = state.plans[dayName] ? state.plans[dayName].length : 0;
        const btn = document.createElement('button');
        btn.className = 'day-btn';
        btn.innerHTML = `<span>${dayName}</span><span>(${count} ćw.)</span>`;
        btn.onclick = () => showPlanDetails(dayName);
        dayList.appendChild(btn);
      });
    }

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

    function showPlanEditor(day) {
        currentDay = day;
        document.getElementById('editPlanTitle').textContent=`Edycja: ${day}`;
        renderEditList();
        // Obsługa przycisku Dodaj
        document.getElementById('addExerciseBtn').onclick = () => {
            const n = document.getElementById('exName').value;
            const s = document.getElementById('exTargetSets').value;
            const r = document.getElementById('exTargetReps').value;
            if(n && s && r) {
                if(!state.plans[day]) state.plans[day]=[];
                state.plans[day].push({name:n, targetSets:s, targetReps:r});
                saveState(); // Zapis tylko po kliknięciu
                renderEditList(); 
                document.getElementById('exName').value='';
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
                state.plans[currentDay].splice(i,1); 
                saveState(); // Zapis tylko po kliknięciu
                renderEditList();
            };
            list.appendChild(d);
        });
    }

    function startWorkout(day) {
        if(!state.plans[day] || !state.plans[day].length) return alert("Pusty plan!");
        state.activeWorkout = { isActive:true, dayName:day, startTime:Date.now(), exercises: state.plans[day].map(e=>({...e, loggedSets:[]})) };
        if(masterTimerInterval) clearInterval(masterTimerInterval);
        masterTimerInterval = setInterval(updateMasterTimer,1000);
        masterTimerDisplay.style.display='block';
        saveState(); // Zapis, bo startujemy trening
        renderActiveWorkout(); showPanel('panel-active-workout');
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
                if(w&&r) { 
                    ex.loggedSets.push({weight:w, reps:r}); 
                    saveState(); // Zapis tylko po kliknięciu
                    renderActiveWorkout(); 
                }
            };
        });
        document.getElementById('finishWorkoutBtn').onclick=()=>{
            if(!confirm("Zakończyć?")) return;
            clearInterval(masterTimerInterval); masterTimerDisplay.style.display='none';
            state.logs.push({date:new Date().toISOString().split('T')[0], dayName:state.activeWorkout.dayName, duration:masterTimerDisplay.textContent, exercises:state.activeWorkout.exercises.filter(e=>e.loggedSets.length)});
            state.activeWorkout={isActive:false}; 
            saveState(); // Zapis
            renderLogs(); 
            showPanel('panel-logs');
        };
    }
    
    function updateMasterTimer() {
        if(!state.activeWorkout.startTime) return;
        const diff = Date.now() - state.activeWorkout.startTime;
        masterTimerDisplay.textContent = new Date(diff).toISOString().slice(11,19);
    }

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
    
    document.getElementById('exportBtn').onclick=()=>{
        const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(state.logs)],{type:'application/json'}));
        a.download='trening.json'; a.click();
    };
    document.getElementById('importBtn').onclick=()=>document.getElementById('fileInput').click();
    document.getElementById('fileInput').onchange=(e)=>{
        const r=new FileReader(); r.onload=async()=>{ 
            state.logs=JSON.parse(r.result); 
            saveState(); // User sam importuje
            renderLogs(); 
        };
        if(e.target.files[0]) r.readAsText(e.target.files[0]);
    };
    document.getElementById('clearHistory').onclick=async()=>{ 
        if(confirm("Usunąć?")) { 
            state.logs=[]; 
            saveState(); // User sam usuwa
            renderLogs(); 
        } 
    };

    function showErrorModal(msg) {
        const d = document.createElement('div');
        d.className = 'modal-message';
        d.style.background = 'var(--danger)';
        d.innerHTML = `<strong>${msg}</strong>`;
        document.body.appendChild(d);
        setTimeout(()=>d.remove(),3000);
    }
});
