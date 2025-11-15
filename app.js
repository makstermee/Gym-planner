// App logic: localStorage-first, optional Firebase sync (replace config in this file to enable)
// Data model:
// state = {
//   username: string,
//   plans: { day: [{id,name,sets,reps,weight}] },
//   logs: [{id,day,exerciseId,sets,reps,weight,timestamp}]
// }

const DAYS = ['Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota','Niedziela'];
const LS_KEY = 'gym_planner_v1';

let state = loadState();
let restTimer = null;
let restRemaining = 0;
let chart = null;

function loadState(){
  const raw = localStorage.getItem(LS_KEY);
  if(raw) return JSON.parse(raw);
  const empty = { username:'', plans:Object.fromEntries(DAYS.map(d=>[d,[]])), logs:[] };
  localStorage.setItem(LS_KEY, JSON.stringify(empty));
  return empty;
}

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  renderAll();
}

function init(){
  // populate days select
  const daySelect = document.getElementById('daySelect');
  DAYS.forEach(d=>{
    const o = document.createElement('option'); o.value = d; o.textContent = d;
    daySelect.appendChild(o);
  });
  daySelect.value = DAYS[0];
  document.getElementById('username').value = state.username;

  // handlers
  document.getElementById('addExercise').onclick = addExercise;
  document.getElementById('daySelect').onchange = renderPlan;
  document.getElementById('startRest').onclick = startRest;
  document.getElementById('stopRest').onclick = stopRest;
  document.getElementById('resetRest').onclick = resetRest;
  document.getElementById('logBtn').onclick = saveLog;
  document.getElementById('exportBtn').onclick = exportCSV;
  document.getElementById('clearHistory').onclick = clearHistory;
  document.getElementById('username').onchange = (e)=>{ state.username = e.target.value; saveState(); }
  document.getElementById('importBtn').onclick = ()=> document.getElementById('fileInput').click();
  document.getElementById('fileInput').onchange = importJSON;
  document.getElementById('syncFirebase').onclick = syncWithFirebase;

  renderAll();
  initChart();
}

function renderAll(){
  renderPlan();
  renderLogs();
  renderHistory();
}

function renderPlan(){
  const day = document.getElementById('daySelect').value;
  const list = document.getElementById('exerciseList');
  list.innerHTML = '';
  const items = state.plans[day] || [];
  items.forEach(ex=>{
    const div = document.createElement('div'); div.className='planItem';
    div.innerHTML = `<strong>${ex.name}</strong>
      <div class="small">Serie: ${ex.sets} • Powt.: ${ex.reps} • Ciężar: ${ex.weight} kg</div>
      <div class="row" style="margin-top:8px">
        <button onclick="startSet('${ex.id}')">Rozpocznij serię</button>
        <button onclick="openLog('${ex.id}')">Zaloguj serię</button>
        <button onclick="removeExercise('${day}','${ex.id}')">Usuń</button>
      </div>`;
    list.appendChild(div);
  });
}

function addExercise(){
  const name = document.getElementById('exerciseName').value.trim();
  const sets = Number(document.getElementById('sets').value)||1;
  const reps = Number(document.getElementById('reps').value)||8;
  const weight = Number(document.getElementById('weight').value)||0;
  if(!name) return alert('Podaj nazwę ćwiczenia');
  const day = document.getElementById('daySelect').value;
  const id = 'ex_'+Date.now()+Math.random().toString(36).slice(2,6);
  const item = { id, name, sets, reps, weight };
  state.plans[day].push(item);
  saveState();
  document.getElementById('exerciseName').value='';
}

function removeExercise(day,id){
  state.plans[day] = state.plans[day].filter(x=>x.id!==id);
  saveState();
}

function startSet(exId){
  // start rest timer for restSeconds
  const s = Number(document.getElementById('restSeconds').value)||60;
  restRemaining = s;
  startRest();
  // also prefill log form
  const ex = findExerciseById(exId);
  if(ex){ document.getElementById('logWeight').value = ex.weight; document.getElementById('logReps').value = ex.reps; }
}

function openLog(exId){
  const ex = findExerciseById(exId);
  if(!ex) return alert('Nie znaleziono ćwiczenia');
  document.getElementById('logWeight').value = ex.weight;
  document.getElementById('logReps').value = ex.reps;
}

function findExerciseById(id){
  for(const d of DAYS) for(const e of state.plans[d]) if(e.id===id) return e;
  return null;
}

// --- Logs (progres)
function saveLog(){
  const sets = Number(document.getElementById('logSets').value)||1;
  const reps = Number(document.getElementById('logReps').value)||0;
  const weight = Number(document.getElementById('logWeight').value)||0;
  const day = document.getElementById('daySelect').value;
  const log = { id:'log_'+Date.now(), day, sets, reps, weight, ts:Date.now() };
  state.logs.push(log);
  saveState();
  // update chart quickly
  updateChart();
  alert('Zapisano serię w historii');
  document.getElementById('logSets').value=''; document.getElementById('logReps').value=''; 
}

// render logs area (recent logs and quick add)
function renderLogs(){
  const area = document.getElementById('logArea');
  area.innerHTML = '';
  const recent = state.logs.slice(-10).reverse();
  recent.forEach(l=>{
    const d = new Date(l.ts); const dd = d.toLocaleString();
    const div = document.createElement('div');
    div.className='small';
    div.textContent = `${dd} — ${l.day} — ${l.sets}x${l.reps} @ ${l.weight}kg`;
    area.appendChild(div);
  });
  updateChart();
}

// --- Chart (progress by average weight per day)
function initChart(){
  const ctx = document.getElementById('progressChart').getContext('2d');
  chart = new Chart(ctx, {
    type:'line',
    data:{ labels:[], datasets:[{label:'Średni ciężar (ostatnie wpisy)', data:[], tension:0.3}] },
    options:{ responsive:true, maintainAspectRatio:false, scales:{y:{beginAtZero:true}} }
  });
  updateChart();
}

function updateChart(){
  if(!chart) return;
  // group last 20 logs by day label
  const logs = state.logs.slice(-30);
  const labels = logs.map(l=> new Date(l.ts).toLocaleDateString());
  const data = logs.map(l=> l.weight );
  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update();
}

// --- Timer functions
function startRest(){
  if(restTimer) clearInterval(restTimer);
  const display = document.getElementById('timerDisplay');
  if(restRemaining<=0) restRemaining = Number(document.getElementById('restSeconds').value)||60;
  display.textContent = formatTime(restRemaining);
  restTimer = setInterval(()=>{
    restRemaining--;
    display.textContent = formatTime(restRemaining);
    if(restRemaining<=0){ clearInterval(restTimer); restTimer=null; playBeep(); }
  },1000);
}

function stopRest(){ if(restTimer) clearInterval(restTimer); restTimer=null; }

function resetRest(){ stopRest(); restRemaining=0; document.getElementById('timerDisplay').textContent='00:00'; }

function formatTime(s){ const m = Math.floor(s/60); const sec = s%60; return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'); }

function playBeep(){ try{ const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.type='sine'; o.frequency.value=880; g.gain.value=0.05; o.start(); setTimeout(()=>{ o.stop(); ctx.close(); },300);}catch(e){} }

// --- History
function renderHistory(){
  const h = document.getElementById('historyList');
  h.innerHTML='';
  const rows = state.logs.slice().reverse();
  rows.forEach(r=>{
    const d = new Date(r.ts);
    const div = document.createElement('div');
    div.className='small';
    div.innerHTML = `${d.toLocaleString()} — ${r.day} — ${r.sets}x${r.reps} @ ${r.weight}kg`;
    h.appendChild(div);
  });
}

function clearHistory(){ if(!confirm('Wyczyścić historię?')) return; state.logs=[]; saveState(); }

// --- Export / Import
function exportCSV(){
  let rows = [['timestamp','day','sets','reps','weight']];
  state.logs.forEach(l=> rows.push([l.ts,l.day,l.sets,l.reps,l.weight]));
  const csv = rows.map(r=> r.join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='gym_logs.csv'; a.click(); URL.revokeObjectURL(url);
}

function importJSON(e){
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(data.plans && data.logs){ state = data; saveState(); alert('Zaimportowano'); }
      else alert('Nieprawidłowy format');
    }catch(err){ alert('Błąd parsowania JSON'); }
  };
  reader.readAsText(file);
}

// --- Firebase sync (optional)
// To enable: replace firebaseConfig below with your config and uncomment initialization lines
const firebaseConfig = {
  // apiKey: "YOUR_API_KEY",
  // authDomain: "YOUR_AUTH_DOMAIN",
  // databaseURL: "YOUR_DATABASE_URL",
  // projectId: "YOUR_PROJECT_ID",
  // storageBucket: "YOUR_STORAGE_BUCKET",
  // messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  // appId: "YOUR_APP_ID"
};

function syncWithFirebase(){
  if(!firebaseConfig.apiKey){ return alert('Firebase nie skonfigurowany. W app.js wpisz swój firebaseConfig aby użyć synchronizacji.'); }
  // Example using compat API (included in index.html). This will write state under /users/{username}
  const userKey = state.username || 'anon';
  firebase.initializeApp(firebaseConfig);
  const db = firebase.database();
  db.ref('/users/'+userKey).set(state, (err)=>{
    if(err) alert('Błąd zapisu do Firebase: '+err);
    else alert('Zapisano do Firebase');
  });
}

// --- Utils
window.addEventListener('load', init);
window.saveState = saveState; // expose for debugging
