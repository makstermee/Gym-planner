const DAYS = ['Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota','Niedziela'];
let state = JSON.parse(localStorage.getItem('gym_planner_max')||`{"username":"","plans":{},"logs":[]}`);
if(!state.plans){state.plans={};DAYS.forEach(d=>state.plans[d]=[]);}
const daySelect=document.getElementById('daySelect');
DAYS.forEach(d=>{const o=document.createElement('option');o.value=d;o.textContent=d;daySelect.appendChild(o);});
daySelect.value=DAYS[0];

function saveState(){localStorage.setItem('gym_planner_max',JSON.stringify(state));renderPlan();renderLogs();}
function renderPlan(){
  const list=document.getElementById('exerciseList');list.innerHTML='';
  state.plans[daySelect.value]?.forEach(ex=>{
    const div=document.createElement('div');div.className='card';div.style.background='#e0f7fa';div.innerHTML=`
      <strong>${ex.name}</strong><br>Serie: ${ex.sets} • Powt.: ${ex.reps} • Ciężar: ${ex.weight} kg
    `;list.appendChild(div);
  });
}
document.getElementById('addExercise').onclick=()=>{
  const name=document.getElementById('exerciseName').value;const sets=+document.getElementById('sets').value||1;
  const reps=+document.getElementById('reps').value||10;const weight=+document.getElementById('weight').value||0;
  if(!name) return alert('Podaj nazwę ćwiczenia!');
  if(!state.plans[daySelect.value]) state.plans[daySelect.value]=[];
  state.plans[daySelect.value].push({name,sets,reps,weight});
  document.getElementById('exerciseName').value='';saveState();
}

// Timer
let timer=0;let interval=null;
function startRest(){if(interval) clearInterval(interval);timer=+document.getElementById('restSeconds').value||60;interval=setInterval(()=>{timer--;document.getElementById('timerDisplay').textContent=`${Math.floor(timer/60).toString().padStart(2,'0')}:${(timer%60).toString().padStart(2,'0')}`;if(timer<=0){clearInterval(interval);interval=null;}},1000);}
document.getElementById('startRest').onclick=startRest;
document.getElementById('stopRest').onclick=()=>{clearInterval(interval);interval=null;}
document.getElementById('resetRest').onclick=()=>{clearInterval(interval);interval=null;timer=0;document.getElementById('timerDisplay').textContent='00:00';}

// History / logs
function renderLogs(){
  const area=document.getElementById('logArea');area.innerHTML='';
  state.logs.slice().reverse().forEach(l=>{const div=document.createElement('div');div.className='small';div.textContent=`${l.day} ${l.sets}x${l.reps} @ ${l.weight}kg`;area.appendChild(div);});
}
renderPlan();renderLogs();

// Eksport / Import
document.getElementById('exportBtn').onclick=()=>{
  const blob=new Blob([JSON.stringify(state.logs)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='logs.json';a.click();URL.revokeObjectURL(url);
}
document.getElementById('importBtn').onclick=()=>{document.getElementById('fileInput').click();}
document.getElementById('fileInput').onchange=e=>{
  const file=e.target.files[0];const reader=new FileReader();
  reader.onload=()=>{state.logs=JSON.parse(reader.result);saveState();alert('Zaimportowano dane');}
  reader.readAsText(file);
}

// Init username input
document.getElementById('username').value=state.username||'';
document.getElementById('username').onchange=e=>{state.username=e.target.value;saveState();}
