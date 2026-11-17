// ---------- Speech recognition (Web Speech API, zh-CN) ----------
// 录音时同时识别，停止后得到识别文字，用于逐字评分。
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;

let recog = null;
let recogFinal = "";
let recogInterim = "";
let recogRunning = false;
let recogError = "";
let recogDone = null; // resolve fn for stop()

function speechSupported(){ return !!SpeechRec; }

function startSpeech(onUpdate){
  if(!SpeechRec) return false;
  recogFinal = ""; recogInterim = ""; recogError = "";
  recog = new SpeechRec();
  recog.lang = "zh-CN";
  recog.continuous = true;
  recog.interimResults = true;
  recog.onresult = (e)=>{
    recogInterim = "";
    for(let i = e.resultIndex; i < e.results.length; i++){
      if(e.results[i].isFinal) recogFinal += e.results[i][0].transcript;
      else recogInterim += e.results[i][0].transcript;
    }
    if(onUpdate) onUpdate(recogFinal + recogInterim);
  };
  recog.onerror = (e)=>{
    // no-speech / aborted 不算致命错误
    if(e.error !== "no-speech" && e.error !== "aborted") recogError = e.error;
    if(e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "network") recogRunning = false;
  };
  // 部分浏览器在停顿后会自动结束，用户没点停止就继续识别
  recog.onend = ()=>{
    if(recogRunning){
      recogFinal += recogInterim; recogInterim = "";
      try{ recog.start(); return; }catch(_){}
    }
    const done = recogDone; recogDone = null;
    if(done) done(recogFinal + recogInterim);
  };
  recogRunning = true;
  try{ recog.start(); }catch(e){ recogRunning = false; return false; }
  return true;
}

// 结束识别，返回 Promise<识别到的全部文字>
function stopSpeech(){
  if(!recog) return Promise.resolve("");
  recogRunning = false;
  return new Promise((resolve)=>{
    recogDone = resolve;
    try{ recog.stop(); }catch(_){ recogDone = null; resolve(recogFinal + recogInterim); }
    // 保险：有的浏览器不触发 onend
    setTimeout(()=>{ if(recogDone){ recogDone = null; resolve(recogFinal + recogInterim); } }, 2500);
  });
}

function abortSpeech(){
  recogRunning = false; recogDone = null;
  if(recog){ try{ recog.abort(); }catch(_){} }
  recog = null;
}

function speechErrorText(){
  const map = {
    "network": "无法连接语音识别服务（请检查网络）",
    "not-allowed": "麦克风或语音识别权限被拒绝",
    "service-not-allowed": "浏览器不允许使用语音识别",
    "language-not-supported": "浏览器不支持中文识别",
    "audio-capture": "没有可用的麦克风"
  };
  return recogError ? (map[recogError] || ("识别出错：" + recogError)) : "";
}
