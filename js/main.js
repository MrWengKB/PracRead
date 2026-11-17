// ---------- View switching ----------
function showView(name){
  const v1 = $("#viewInput");
  const v2 = $("#viewPractice");
  const back = $("#btnBack");

  if(name === "input"){
    v1.classList.remove("hidden");
    v2.classList.add("hidden");
    back.classList.add("hidden");
  }else{
    v1.classList.add("hidden");
    v2.classList.remove("hidden");
    back.classList.remove("hidden");
  }
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
  // stop recording if active
  try{
    if(mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
  }catch(e){}
  try{
    if(mediaStream) mediaStream.getTracks().forEach(t=>t.stop());
  }catch(e){}
  mediaStream = null;
  mediaRecorder = null;
  abortSpeech();
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
if(!speechSupported()) $("#scoreHint").textContent = "当前浏览器不支持语音识别（如 Firefox），无法自动评分。请使用 Chrome、Edge 或 Safari。";
showView("input");
setButtons({rec:true, stop:false, save:false});
