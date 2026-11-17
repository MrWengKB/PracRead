// ---------- Recorder ----------
function setStatus(s){
  $("#status").textContent = s;
}

function setButtons({rec, stop, save}){
  $("#btnRec").disabled = !rec;
  $("#btnStop").disabled = !stop;
  $("#btnSave").disabled = !save;
  // Azure 发音评分：有刚录好的音频且已配置代理时可用
  const az = $("#btnAzure");
  az.classList.toggle("hidden", !azureEnabled());
  az.disabled = !(save && lastBlob);
}

function startMeter(){
  const bar = $("#bar");
  let t0 = nowTs();
  meterTimer = setInterval(()=>{
    const dt = nowTs() - t0;
    // faux progress pulse (no audio level analysis; keeps UI responsive & simple)
    const phase = (dt % 1200) / 1200;
    const w = 15 + Math.round(70 * Math.abs(Math.sin(phase * Math.PI)));
    bar.style.width = w + "%";
  }, 120);
}

function stopMeter(){
  const bar = $("#bar");
  if(meterTimer) clearInterval(meterTimer);
  meterTimer = null;
  bar.style.width = "0%";
}

async function startRecording(){
  lastBlob = null;
  chunks = [];

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    setStatus("状态：当前浏览器不支持录音（缺少 getUserMedia）。");
    return;
  }

  try{
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio:true });
  }catch(err){
    setStatus("状态：麦克风权限获取失败。请检查浏览器权限设置。");
    return;
  }

  try{
    const opts = MIME ? { mimeType: MIME } : undefined;
    mediaRecorder = new MediaRecorder(mediaStream, opts);
  }catch(err){
    // fallback without opts
    try{
      mediaRecorder = new MediaRecorder(mediaStream);
    }catch(e2){
      setStatus("状态：MediaRecorder 初始化失败（该浏览器可能不支持录音编码）。");
      try { mediaStream.getTracks().forEach(t=>t.stop()); } catch(e){}
      mediaStream = null;
      return;
    }
  }

  recStartAt = nowTs();
  setButtons({rec:false, stop:true, save:false});
  setStatus(`状态：录音中…\n编码：${mediaRecorder.mimeType || MIME || "browser-default"}`);
  startMeter();

  mediaRecorder.ondataavailable = (e)=>{
    if(e.data && e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.onstop = ()=>{
    stopMeter();
    const durationMs = nowTs() - recStartAt;
    lastBlob = new Blob(chunks, { type: mediaRecorder.mimeType || MIME || "audio/webm" });
    setButtons({rec:true, stop:false, save:true});
    setStatus(`状态：录音已停止（${Math.round(durationMs/1000)}s）。可保存。`);
  };

  mediaRecorder.start();

  // 自动评分：
  // - 一般浏览器：录音时同时用浏览器语音识别
  // - 安卓 Chrome：麦克风不能同时给录音和识别用，改为停止后用 Azure 评分（已配置时）
  clearScore();
  scoringThisTake = "";
  const enc = `编码：${mediaRecorder.mimeType || MIME || "browser-default"}`;
  if(autoScore){
    if(IS_ANDROID && azureEnabled()){
      scoringThisTake = "azure";
    }else if(IS_ANDROID){
      setStatus(`状态：录音中…（安卓浏览器无法边录音边识别，本次不自动评分）\n${enc}`);
    }else if(speechSupported()){
      scoringThisTake = startSpeech(showLiveHeard) ? "web" : "";
      if(!scoringThisTake){
        if(azureEnabled()) scoringThisTake = "azure";
        else setStatus(`状态：录音中…（语音识别启动失败，本次不评分）\n${enc}`);
      }
    }else if(azureEnabled()){
      scoringThisTake = "azure";
    }else{
      setStatus(`状态：录音中…（当前浏览器不支持语音识别，无法自动评分）\n${enc}`);
    }
  }
}

let scoringThisTake = "";   // "" | "web" | "azure"
const IS_ANDROID = /Android/i.test(navigator.userAgent);

// 等 MediaRecorder 的 onstop 把 lastBlob 准备好
function waitForBlob(timeoutMs = 4000){
  return new Promise((resolve)=>{
    const t0 = nowTs();
    (function poll(){
      if(lastBlob) return resolve(lastBlob);
      if(nowTs() - t0 > timeoutMs) return resolve(null);
      setTimeout(poll, 100);
    })();
  });
}

async function stopRecording(){
  if(!mediaRecorder) return;
  const mode = scoringThisTake;
  scoringThisTake = "";
  if(mode === "web"){
    $("#scoreSummary").textContent = "评分中…";
    stopSpeech().then(async (heard)=>{
      if(heard || !azureEnabled()){
        renderBrowserScore(currentText, heard);
        return;
      }
      // 浏览器没识别到 -> 自动改用 Azure
      if(await waitForBlob()) runAzureScore();
      else renderBrowserScore(currentText, heard);
    });
  }else if(mode === "azure"){
    waitForBlob().then((b)=>{ if(b) runAzureScore(); });
  }
  try{
    mediaRecorder.stop();
  }catch(e){}

  try{
    if(mediaStream) mediaStream.getTracks().forEach(t=>t.stop());
  }catch(e){}
  mediaStream = null;
}

async function saveRecording(){
  if(!lastBlob){
    setStatus("状态：没有可保存的录音。");
    return;
  }
  const durationMs = nowTs() - recStartAt;
  const id = "a_" + nowTs() + "_" + Math.random().toString(16).slice(2);

  const title = currentText
    ? ("朗读：" + currentText.trim().slice(0, 14).replace(/\s+/g," ") + (currentText.trim().length > 14 ? "…" : ""))
    : "朗读录音";

  const rec = {
    id,
    createdAt: nowTs(),
    durationMs,
    mimeType: lastBlob.type || (mediaRecorder && mediaRecorder.mimeType) || MIME || "unknown",
    blob: lastBlob
  };

  await dbPutAudio(rec);
  await enforceMax4();
  await refreshAudioList();

  lastBlob = null;
  setButtons({rec:true, stop:false, save:false});
  setStatus("状态：已保存。");
}
