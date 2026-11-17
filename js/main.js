// ---------- View switching ----------
const VIEWS = { input: "#viewInput", practice: "#viewPractice", settings: "#viewSettings", publish: "#viewPublish" };
let currentView = "input";

function showView(name){
  currentView = name;
  for(const [k, sel] of Object.entries(VIEWS)){
    const el = $(sel);
    if(el) el.classList.toggle("hidden", k !== name);
  }
  $("#btnBack").classList.toggle("hidden", name === "input");
  const st = $("#btnSettings");
  if(st) st.classList.toggle("hidden", name === "settings");
}

// ---------- Events ----------
$("#btnGenerate").addEventListener("click", async ()=>{
  const text = $("#inputText").value || "";
  const cleaned = text.replace(/\r\n/g,"\n").trim();
  if(!cleaned){
    alert("请输入要朗读的文本。");
    return;
  }
  currentText = cleaned;
  showView("practice");
  renderTextWithPinyin(currentText, showPinyin);
  clearScore();
  await refreshAudioList();
});

$("#btnBack").addEventListener("click", ()=>{
  if(currentView !== "practice"){ showView("input"); return; }
  // stop recording if active
  try{
    if(mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
  }catch(e){}
  try{
    if(mediaStream) mediaStream.getTracks().forEach(t=>t.stop());
  }catch(e){}
  mediaStream = null;
  mediaRecorder = null;
  scoringThisTake = false;
  lastBlob = null;
  clearScore();
  stopMeter();
  setButtons({rec:true, stop:false, save:false});
  setStatus("状态：未录音");

  $("#inputText").value = currentText || $("#inputText").value;
  showView("input");
});

$("#togglePinyin").addEventListener("click", ()=>{
  showPinyin = !showPinyin;
  const sw = $("#togglePinyin");
  sw.classList.toggle("on", showPinyin);
  sw.setAttribute("aria-checked", String(showPinyin));
  renderTextWithPinyin(currentText, showPinyin);
});

$("#btnRec").addEventListener("click", startRecording);
$("#btnStop").addEventListener("click", stopRecording);
$("#btnSave").addEventListener("click", saveRecording);
$("#btnAzure").addEventListener("click", runAzureScore);
$("#toggleScore").addEventListener("click", ()=> setAutoScore(!autoScore));

// Show supported format hint
$("#formatHint").textContent = MIME ? `优先编码：${MIME}` : "编码：由浏览器自动选择";

// initial state
setAutoScore(autoScore);
if(!azureEnabled()) $("#scoreHint").textContent = "未配置评分服务（js/config.js 中的 AZURE_PROXY_URL），无法自动评分。";
showView("input");
setButtons({rec:true, stop:false, save:false});
