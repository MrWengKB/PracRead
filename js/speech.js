// ---------- Speech recognition (Web Speech API, zh-CN) ----------
// 录音时同时识别，停止后得到识别文字，用于逐字评分。
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;

let recog = null;
let recogFinal = "";
let recogInterim = "";
let recogRunning = false;
let recogErrors = [];      // 本次出现过的所有错误代码
let recogEvents = {};      // 诊断：start / audiostart / speechstart / result 次数
let recogDone = null;      // stopSpeech() 的 resolve
let recogOnUpdate = null;

function speechSupported(){ return !!SpeechRec; }

function makeRecognizer(){
  const r = new SpeechRec();
  r.lang = "zh-CN";
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  const bump = (k)=>{ recogEvents[k] = (recogEvents[k] || 0) + 1; };
  r.onstart = ()=> bump("start");
  r.onaudiostart = ()=> bump("audiostart");
  r.onspeechstart = ()=> bump("speechstart");
  r.onresult = (e)=>{
    bump("result");
    // 重新拼出本轮会话的全部结果（兼容 Safari 每次返回累积结果的情况）
    let fin = "", inter = "";
    for(let i = 0; i < e.results.length; i++){
      const t = e.results[i][0] ? e.results[i][0].transcript : "";
      if(e.results[i].isFinal) fin += t; else inter += t;
    }
    r._sessionFinal = fin;
    recogInterim = inter;
    if(recogOnUpdate) recogOnUpdate(currentHeard());
  };
  r.onerror = (e)=>{
    recogErrors.push(e.error);
    if(["not-allowed","service-not-allowed","network","language-not-supported","audio-capture"].includes(e.error)){
      recogRunning = false;
    }
  };
  r.onend = ()=>{
    bump("end");
    // 把这一轮会话的结果并入总结果
    recogFinal += (r._sessionFinal || "") + recogInterim;
    r._sessionFinal = ""; recogInterim = "";
    if(recogRunning && recog === r){
      // 浏览器停顿后自动结束：稍等再开新一轮
      setTimeout(()=>{
        if(!recogRunning || recog !== r) return finish();
        try{ recog = makeRecognizer(); recog.start(); }
        catch(err){ recogErrors.push("restart-failed"); recogRunning = false; finish(); }
      }, 150);
      return;
    }
    finish();
  };
  return r;
}

function currentHeard(){
  return recogFinal + ((recog && recog._sessionFinal) || "") + recogInterim;
}

function finish(){
  const done = recogDone; recogDone = null;
  if(done) done(currentHeard());
}

function startSpeech(onUpdate){
  if(!SpeechRec) return false;
  recogFinal = ""; recogInterim = ""; recogErrors = []; recogEvents = {};
  recogOnUpdate = onUpdate || null;
  recogRunning = true;
  try{
    recog = makeRecognizer();
    recog.start();
  }catch(e){
    recogErrors.push("start-failed");
    recogRunning = false;
    return false;
  }
  return true;
}

// 结束识别，返回 Promise<识别到的全部文字>
function stopSpeech(){
  if(!recog) return Promise.resolve("");
  recogRunning = false;
  return new Promise((resolve)=>{
    recogDone = resolve;
    try{ recog.stop(); }catch(_){ finish(); }
    // 保险：有的浏览器不触发 onend
    setTimeout(finish, 4000);
  });
}

function abortSpeech(){
  recogRunning = false; recogDone = null; recogOnUpdate = null;
  if(recog){ try{ recog.abort(); }catch(_){} }
  recog = null;
}

// 识别失败时给用户看的原因
function speechErrorText(){
  const map = {
    "network": "无法连接浏览器的语音识别服务（请检查网络；部分浏览器如 Brave 不提供此服务）",
    "not-allowed": "麦克风或语音识别权限被拒绝（请在地址栏左侧允许麦克风）",
    "service-not-allowed": "浏览器不允许使用语音识别（Safari 需在系统设置中开启“听写”）",
    "language-not-supported": "浏览器不支持中文识别",
    "audio-capture": "语音识别拿不到麦克风（可能被录音占用）",
    "start-failed": "语音识别启动失败",
    "restart-failed": "语音识别中途停止后无法重新启动",
    "no-speech": "语音识别没有听到声音"
  };
  const errs = recogErrors.filter(e => e !== "aborted");
  for(const e of errs){ if(e !== "no-speech") return map[e] || ("识别出错：" + e); }
  if(errs.includes("no-speech")) return map["no-speech"];
  if(!recogEvents.start) return "语音识别没有启动";
  if(!recogEvents.audiostart) return "语音识别没有拿到麦克风声音（可能被录音占用）";
  return "";
}

function speechDiagnostics(){
  const ev = Object.entries(recogEvents).map(([k,v]) => `${k}×${v}`).join(" ");
  return `诊断：${ev || "无事件"}${recogErrors.length ? "；错误 " + recogErrors.join(",") : ""}`;
}
