const pendingServiceRequests=new Map();

const setQuickActionStatus=(message,state="")=>{
  const el=document.getElementById("quick-action-status");
  if(!el)return;
  el.classList.remove("success","error");
  if(state)el.classList.add(state);
  el.textContent=message;
};

const callHomeAssistantService=(domain,service,entityId)=>{
  const requestId=`mcx-v2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve,reject)=>{
    pendingServiceRequests.set(requestId,{resolve,reject});
    window.parent.postMessage({
      type:"reef-call-service",
      requestId,
      domain,
      service,
      serviceData:{},
      target:{entity_id:entityId}
    },window.location.origin);

    window.setTimeout(()=>{
      if(!pendingServiceRequests.has(requestId))return;
      pendingServiceRequests.delete(requestId);
      reject(new Error("The command timed out."));
    },12000);
  });
};

window.handleMissionControlServiceResult=(message)=>{
  const pending=pendingServiceRequests.get(message.requestId);
  if(!pending)return;
  pendingServiceRequests.delete(message.requestId);
  if(message.success)pending.resolve();
  else pending.reject(new Error(message.error||"Command failed."));
};

const logLocalTimelineEvent=(message)=>{
  const key="mcx-v2-timeline";
  let events=[];
  try{
    events=JSON.parse(localStorage.getItem(key)||"[]");
    if(!Array.isArray(events))events=[];
  }catch(error){events=[];}
  events.unshift({message,type:"Maintenance",timestamp:new Date().toISOString()});
  localStorage.setItem(key,JSON.stringify(events.slice(0,100)));
};

const attachQuickActions=()=>{
  document.querySelectorAll(".quick-action").forEach((button)=>{
    button.addEventListener("click",async()=>{
      button.disabled=true;
      setQuickActionStatus("Running command...");
      try{
        const timelineEvent=button.dataset.timelineEvent;
        if(timelineEvent){
          logLocalTimelineEvent(timelineEvent);
          setQuickActionStatus(`${timelineEvent} logged.`,"success");
        }else{
          await callHomeAssistantService(button.dataset.domain,button.dataset.service,button.dataset.entity);
          setQuickActionStatus(`${button.querySelector("strong")?.textContent||"Command"} completed.`,"success");
        }
      }catch(error){
        setQuickActionStatus(String(error.message||error),"error");
      }finally{
        window.setTimeout(()=>{button.disabled=false;},700);
      }
    });
  });
};

window.initQuickActions=attachQuickActions;
