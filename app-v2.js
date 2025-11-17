// Modularne importy funkcji Firebase
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Pobranie instancji z window (zdefiniowane w index.html)
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

// Zmienne globalne stanu
let state = JSON.parse(JSON.stringify(defaultUserState)); 
let currentUserId = null;
let firestoreUnsubscribe = null; 
let masterTimerInterval = null; 
let statsChart = null;
let currentDay = null;

// --- BEZPIECZNIK (Najważniejsza zmienna) ---
// Zmienna blokująca zapis, dopóki nie mamy pewności, że dane z chmury dotarły.
let canSaveToCloud = false; 

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
    
    // Funkcje obsługi Loadera
    function hideLoader() {
        if(appLoader) appLoader.style.display = 'none';
    }
    function showLoader() {
        if(appLoader) appLoader.style.display = 'flex';
    }

    // --- Autoryzacja i Logika Danych ---
    if (!window.IS_FIREBASE_CONFIGURED) {
        if (configWarning) configWarning.style.display = 'block';
        if (authForm) authForm.style.display = 'none';
        hideLoader();
    } else {
        if (configWarning) configWarning.style.display = 'none';
        
        onAuthStateChanged(auth, user => {
            if (user) {
                // --- ZALOGOWANO ---
                currentUserId = user.uid;
                canSaveToCloud = false; // Blokada zapisu na start

                // UI
                authForm.style.display = 'none';
                logoutBtn.style.display = 'block';
                bottomNav.style.display = 'flex';
                if(welcomeMsg) welcomeMsg.textContent = `, ${user.email.split('@')[0]}!`;

                // Nasłuchiwanie bazy
                const docRef = doc(db, `users/${currentUserId}/data/user_state`);
                
                if(firestoreUnsubscribe) firestoreUnsubscribe();
                
                // >>> TUTAJ BYŁ PROBLEM - POPRAWIONA FUNKCJA <<<
                firestoreUnsubscribe = onSnapshot(docRef, (snap) => {
                    try {
                        if (snap.exists()) {
                            // DANE ISTNIEJĄ
                            const data = snap.data();
                            state = { 
                                ...defaultUserState, 
                                ...data, 
                                plans: { ...defaultUserState.plans, ...(data.plans||{}) } 
                            };
                            console.log("Pobrano dane z chmury.");
                        } else {
                            // NOWY UŻYTKOWNIK (Brak danych)
                            // >>> NAPRAWA: Wymuszamy czysty stan, żeby aplikacja nie miała 'undefined' <<<
                            console.warn("Brak danych (nowy profil) - inicjalizuję domyślny stan.");
                            state = JSON.parse(JSON.stringify(defaultUserState));
                        }
                        
                        // Zdejmujemy blokadę zapisu
                        canSaveToCloud = true; 

                        // Renderujemy widok
                        renderDayList(); 
                        initAppUI(); 
                    
                    } catch (err) {
                        console.error("Błąd krytyczny podczas przetwarzania danych:", err);
                        // Nawet jak coś walnie w kodzie wyżej, to chcemy widzieć błąd, a nie loader
                    } finally {
                        // >>> TO GWARANTUJE, ŻE KÓŁKO ZNIKNIE <<<
                        hideLoader(); 
                    }
                    
                }, (error) => {
                    console.error("Błąd Firebase:", error);
                    hideLoader(); 
                    showErrorModal("Błąd pobierania danych!");
                });

            } else {
                // --- WYLOGOWANO ---
                if(firestoreUnsubscribe) firestoreUnsubscribe();
                currentUserId = null;
                canSaveToCloud = false;
                state = JSON.parse(JSON.stringify(defaultUserState));
                
                authForm.style.display = 'block';
                logoutBtn.style.display = 'none';
                bottomNav.style.display = 'none';
                if(welcomeMsg) welcomeMsg.textContent = '';
                showPanel('panel-auth');
                hideLoader();
            }
        });
    }

    // --- Reszta funkcji (Bez zmian, działają poprawnie) ---

    async function saveState() {
        if (!currentUserId || !db) return;
        if (!canSaveToCloud) {
            console.warn("⛔ Zatrzymano próbę zapisu - dane jeszcze się nie wczytały.");
            return; 
        }
        try { 
            await setDoc(doc(db, `users/${currentUserId}/data/user_state`), state); 
            console.log("Zapisano stan.");
        } catch (e) { 
            console.error("Błąd zapisu:", e);
            showErrorModal("Błąd zapisu (sprawdź internet).");
        }
    }

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

    function initAppUI() {
        if (state.activeWorkout && state.activeWorkout.isActive && !masterTimerInterval) {
            if (confirm("Wznowić przerwany trening?")) {
                masterTimerInterval = setInterval(updateMasterTimer, 1000);
                masterTimerDisplay.style.display = 'block';
                renderActiveWorkout();
                showPanel('panel-active-workout');
            } else {
                state.activeWorkout.isActive = false;
                saveState(); 
            }
        }
        renderLogs();
    }

    function renderDayList() {
      if (!dayList) return;
      dayList.innerHTML = '';
      // Zabezpieczenie przed błędem 'undefined'
      const plans = state.plans || defaultUserState.plans;
      Object.keys(plans).forEach(dayName => {
        const count = plans[dayName] ? plans[dayName].length : 0;
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
        
        if(id==='panel-stats') {
             if(!statsChart) initStatsChart();
             updateStatsChart();
        }
    }

    document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>showPanel(b.dataset.panel));
    document.getElementById('backToMainBtn').onclick=()=>showPanel('panel-main');
    
    function showPlanDetails(day) {
        currentDay = day;
        document.getElementById('planDetailsTitle').textContent = `Plan: ${day}`;
        const list = document.getElementById('planDetailsList');
        list.innerHTML = '';
        const plan = state.plans[day] || [];
        
        if(!plan.length) {
            list.innerHTML='<p style="text-align:center;color:#888">Pusto. Dodaj ćwiczenia.</p>';
        } else {
            plan.forEach(ex=> {
                const d=document.createElement('div'); d.className='card';
                d.innerHTML=`<div><strong>${ex.name}</strong><br><small>${ex.targetSets}x${ex.targetReps}</small></div>`;
                list.appendChild(d);
            });
        }
        document.getElementById('editPlanBtn').onclick=()=>showPlanEditor(day);
        document.getElementById('startWorkoutBtn').onclick=()=>startWorkout(day);
        showPanel('panel-plan-details');
    }

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
                saveState(); 
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
                saveState(); 
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
        saveState(); 
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
                    saveState(); 
                    renderActiveWorkout(); 
                }
            };
        });
        
        document.getElementById('finishWorkoutBtn').onclick=()=>{
            if(!confirm("Zakończyć?")) return;
            clearInterval(masterTimerInterval); masterTimerDisplay.style.display='none';
            state.logs.push({date:new Date().toISOString().split('T')[0], dayName:state.activeWorkout.dayName, duration:masterTimerDisplay.textContent, exercises:state.activeWorkout.exercises.filter(e=>e.loggedSets.length)});
            state.activeWorkout={isActive:false}; 
            saveState(); 
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
        if(!logArea) return;
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
            saveState(); 
            renderLogs(); 
        };
        if(e.target.files[0]) r.readAsText(e.target.files[0]);
    };
    document.getElementById('clearHistory').onclick=async()=>{ 
        if(confirm("Usunąć?")) { 
            state.logs=[]; 
            saveState(); 
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
