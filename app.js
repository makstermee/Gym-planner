// --- Inicjalizacja stanu ---
let state = JSON.parse(localStorage.getItem('trening_pro') || `{
  "username": "",
  "theme": "light",
  "plans": {"Dzisiaj": []},
  "logs": []
}`);

// --- Panel navigation ---
const panels = document.querySelectorAll('.panel');
document.querySelectorAll('.bottom-nav button').forEach(btn=>{
  btn.onclick = () => {
    panels.forEach(p=>p.classList.remove('active'));
    document.getElementById(btn.dataset.panel).classList.add('active');
  }
});

// --- Motyw i ustawienia ---
const usernameInput = document.getElementById('username');
usernameInput.value = state.username;
usernameInput.onchange = e => { state.username = e.target.value; saveState(); }

const themeSelect = document.getElementById('themeSelect');
themeSelect.value = state.theme;
applyTheme();
themeSelect.onchange = e => { state.theme = e.target.value; applyTheme(); saveState(); }

function applyTheme(){ document.body.classList.toggle('dark', state.theme === 'dark'); }

// --- Plan treningowy ---
const exerciseList = document.getElementById('exerciseList');
document.getElementById('addExercise').onclick = () => {
  const name = document.getElementById('exerciseName').value;
  const sets = +document.getElementById('sets').value || 1;
  const reps = +document.getElementById('reps').value || 10;
  const weight = +document.getElementById('weight').value || 0;
  if(!name) return alert('Podaj nazwę ćwiczenia!');
  state.plans["Dzisiaj"].push({name, sets, reps, weight});
  document.getElementById('exerciseName').value = '';
  renderPlan();
  saveState();
}

function renderPlan(){
  exerciseList.innerHTML = '';
  state.plans["Dzisiaj"].forEach(ex => {
    const div = document.createElement('div'); div.className = 'card';
    div.innerHTML = `<strong>${ex.name}</strong><br>Serie: ${ex.sets} • Powt.: ${ex.reps} • Ciężar: ${ex.weight} kg`;
    exerciseList.appendChild(div);
  });
}

// --- Timer ---
let timer = 0, interval = null;
const timerDisplay = document.getElementById('timerDisplay');
document.getElementById('startRest').onclick = () => {
  if(interval) clearInterval(interval);
  timer = +document.getElementById('restSeconds').value || 60;
  interval = setInterval(()=>{
    timer--;
    timerDisplay.textContent = `${Math.floor(timer/60).toString().padStart(2,'0')}:${(timer%60).toString().padStart(2,'0')}`;
    if(timer <= 0){ clearInterval(interval); interval=null; alert("Czas odpoczynku zakończony!"); }
  },1000);
}
document.getElementById('stopRest').onclick = () => { clearInterval(interval); interval = null; }
document.getElementById('resetRest').onclick = () => { clearInterval(interval); interval=null; timer=0; timerDisplay.textContent='00:00'; }

// --- Historia i wykres ---
const logArea = document.getElementById('logArea');
function renderLogs(){
  logArea.innerHTML='';
  state.logs.slice().reverse().forEach(l => {
    const div = document.createElement('div'); div.className='card';
    div.textContent=`${l.name} ${l.sets}x${l.reps} @ ${l.weight}kg`;
    logArea.appendChild(div);
  });
}
document.getElementById('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state.logs)],{type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='logs.json'; a.click();
}
document.getElementById('importBtn').onclick = () => { document.getElementById('fileInput').click(); }
document.getElementById('fileInput').onchange = e => {
  const file = e.target.files[0]; const reader = new FileReader();
  reader.onload = () => { state.logs = JSON.parse(reader.result); saveState(); renderLogs(); alert('Zaimportowano dane'); }
  reader.readAsText(file);
}
document.getElementById('clearHistory').onclick = () => { state.logs=[]; saveState(); renderLogs(); }

// --- Statystyki ---
const statsChart = new Chart(document.getElementById('statsChart'), {
  type: 'bar',
  data: { labels: [], datasets: [{ label: 'Objętość treningowa', data: [], backgroundColor:'#ff5722' }] },
  options: { responsive:true, scales:{ y:{ beginAtZero:true } } }
});

// --- Save state ---
function saveState(){ localStorage.setItem('trening_pro', JSON.stringify(state)); }

// --- Init render ---
renderPlan();
renderLogs();
