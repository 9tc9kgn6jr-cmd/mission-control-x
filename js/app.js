const ENTITY_IDS={
  health:"sensor.reef_doctor_health_score",
  confidence:"sensor.reef_doctor_chemistry_confidence",
  mission:"sensor.reef_doctor_today_focus",
  overall:"sensor.reef_doctor_overall_status",
  temperature:"sensor.apex_apex_apex_temperature",
  salinity:"sensor.apex_apex_apex_conductivity",
  ph:"sensor.apex_apex_apex_ph",
  alkalinity:"sensor.apex_apex_apex_alkalinity",
  calcium:"sensor.apex_apex_apex_calcium",
  magnesium:"sensor.apex_apex_apex_magnesium"
};

const FORMATS={
  temperature:{decimals:1,unit:" °F",min:78,max:79,watch:.6},
  salinity:{decimals:1,unit:" ppt",min:34,max:35,watch:1},
  ph:{decimals:2,unit:"",min:8,max:8.3,watch:.25},
  alkalinity:{decimals:2,unit:" dKH",min:8.8,max:9.2,watch:.6},
  calcium:{decimals:0,unit:" ppm",min:400,max:450,watch:25},
  magnesium:{decimals:0,unit:" ppm",min:1300,max:1400,watch:80}
};

let currentStates={};

const entity=(id)=>currentStates?.[id]||null;
const numericState=(id)=>{
  const raw=entity(id)?.state;
  const value=Number(raw);
  return Number.isFinite(value)?value:null;
};
const textState=(id,fallback="")=>entity(id)?.state??fallback;

const confidenceValue=()=>{
  const raw=textState(ENTITY_IDS.confidence,"");
  const numeric=Number(raw);
  if(Number.isFinite(numeric)) return Math.max(0,Math.min(100,numeric));
  const value=String(raw).toLowerCase();
  if(value.includes("high")) return 90;
  if(value.includes("moderate")||value.includes("medium")) return 65;
  if(value.includes("low")) return 35;
  return null;
};

const classify=(value,rule)=>{
  if(value===null) return "watch";
  if(value>=rule.min&&value<=rule.max) return "good";
  if(value>=rule.min-rule.watch&&value<=rule.max+rule.watch) return "watch";
  return "alert";
};

const freshnessMinutes=(id)=>{
  const item=entity(id);
  const stamp=item?.last_updated||item?.last_changed;
  if(!stamp) return null;
  const age=(Date.now()-new Date(stamp).getTime())/60000;
  return Number.isFinite(age)?age:null;
};

const updateSystems=()=>{
  const systemItems=[...document.querySelectorAll(".system-item")];
  const setSystem=(index,state,detail)=>{
    const item=systemItems[index];
    if(!item) return;
    item.classList.remove("online","watch","offline");
    item.classList.add(state);
    item.querySelector("small").textContent=detail;
  };

  setSystem(0,Object.keys(currentStates).length?"online":"offline",Object.keys(currentStates).length?"Connected":"Disconnected");

  const apexAge=freshnessMinutes(ENTITY_IDS.temperature);
  const apexValue=numericState(ENTITY_IDS.temperature);
  setSystem(1,apexValue===null?"offline":apexAge!==null&&apexAge>15?"watch":"online",apexValue===null?"No data":apexAge!==null&&apexAge>15?"Delayed":"Connected");

  const tridentIds=[ENTITY_IDS.alkalinity,ENTITY_IDS.calcium,ENTITY_IDS.magnesium];
  const missing=tridentIds.some(id=>numericState(id)===null);
  const oldest=Math.max(...tridentIds.map(freshnessMinutes).filter(v=>v!==null),0);
  setSystem(2,missing?"offline":oldest>720?"watch":"online",missing?"Missing results":oldest>720?"Overdue":"Reporting");

  const ages=Object.keys(FORMATS).map(key=>freshnessMinutes(ENTITY_IDS[key])).filter(v=>v!==null);
  const newest=ages.length?Math.min(...ages):null;
  setSystem(3,newest===null?"offline":newest>15?"watch":"online",newest===null?"No updates":newest>15?`${Math.round(newest)} min old`:"Fresh");
};

const updateBrain=()=>{
  const checks=Object.entries(FORMATS).map(([key,rule])=>{
    const value=numericState(ENTITY_IDS[key]);
    return {key,value,state:classify(value,rule)};
  });

  const alerts=checks.filter(x=>x.state==="alert");
  const watches=checks.filter(x=>x.state==="watch");
  const stable=checks.filter(x=>x.state==="good");

  const headline=document.getElementById("brain-headline");
  const summary=document.getElementById("brain-summary");
  const priority=document.getElementById("priority");

  if(alerts.length){
    headline.textContent="Action required";
    summary.textContent=`${alerts.map(x=>x.key).join(", ")} ${alerts.length===1?"is":"are"} outside the preferred range. Verify the readings before making changes.`;
    priority.textContent=`Review ${alerts.map(x=>x.key).join(", ")}`;
  }else if(watches.length){
    headline.textContent="A few readings deserve attention";
    summary.textContent=`${watches.map(x=>x.key).join(", ")} ${watches.length===1?"is":"are"} near the edge of the target range. Keep conditions steady and confirm the trend first.`;
    priority.textContent=`Monitor ${watches.map(x=>x.key).join(", ")}`;
  }else{
    headline.textContent="Dreams of Tahiti is stable";
    summary.textContent="All available chemistry readings are within their preferred operating ranges. No immediate chemistry adjustment is recommended.";
    priority.textContent="Observe only";
  }

  document.getElementById("analysis-time").textContent=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
};

const updateDashboard=(states)=>{
  currentStates=states||{};

  const health=numericState(ENTITY_IDS.health);
  const confidence=confidenceValue();

  document.getElementById("health").textContent=health===null?"--":`${Math.round(health)}%`;
  document.getElementById("confidence").textContent=confidence===null?"--":`${Math.round(confidence)}%`;
  document.getElementById("mission").textContent=textState(ENTITY_IDS.mission,"Waiting for Reef Doctor...");

  Object.entries(FORMATS).forEach(([key,format])=>{
    const value=numericState(ENTITY_IDS[key]);
    document.getElementById(key).textContent=value===null?"--":`${value.toFixed(format.decimals)}${format.unit}`;
    const state=classify(value,format);
    const card=document.querySelector(`[data-key="${key}"]`);
    card.classList.remove("good","watch","alert");
    card.classList.add(state);
    document.getElementById(`${key}-status`).textContent=state==="good"?"In target":state==="watch"?"Watch":"Outside target";
  });

  updateSystems();
  updateBrain();

  document.getElementById("connection").textContent="Connected — live data streaming";
  document.getElementById("updated").textContent=`Last updated: ${new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}`;
};

const updateClock=()=>{
  document.getElementById("clock").textContent=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
};

window.addEventListener("message",event=>{
  if(event.origin!==window.location.origin) return;

  if(event.data?.type==="reef-service-result"){
    window.handleMissionControlServiceResult?.(event.data);
    return;
  }

  if(event.data?.type!=="reef-mission-control-v2-hass") return;
  updateDashboard(event.data.states||{});
});

window.initDigitalTwin?.();
window.initQuickActions?.();

updateClock();
setInterval(updateClock,1000);

window.parent.postMessage({type:"reef-mission-control-v2-ready"},window.location.origin);
