// ---------- Azure pronunciation assessment (optional) ----------
// 录音 -> 16kHz 单声道 WAV -> 发给自己的代理（worker/azure-proxy.js）-> Azure 新加坡区域。
// 密钥只放在代理里，不会出现在网页中。

function azureEnabled(){ return typeof AZURE_PROXY_URL === "string" && AZURE_PROXY_URL.trim() !== ""; }

async function blobToWav16k(blob){
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let decoded;
  try{
    decoded = await new Promise((res, rej)=>{
      const p = ctx.decodeAudioData(buf, res, rej);
      if(p && p.then) p.then(res, rej);
    });
  }finally{
    try{ ctx.close(); }catch(_){}
  }
  const rate = 16000;
  const len = Math.max(1, Math.ceil(decoded.duration * rate));
  const off = new OfflineAudioContext(1, len, rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const pcm = rendered.getChannelData(0);

  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o, s)=>{ for(let i=0;i<s.length;i++) out.setUint8(o+i, s.charCodeAt(i)); };
  str(0, "RIFF"); out.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  str(36, "data"); out.setUint32(40, pcm.length * 2, true);
  for(let i=0;i<pcm.length;i++){
    const s = Math.max(-1, Math.min(1, pcm[i]));
    out.setInt16(44 + i*2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return { wav: new Blob([out], { type: "audio/wav" }), seconds: decoded.duration };
}

async function azureAssess(blob, referenceText){
  const { wav, seconds } = await blobToWav16k(blob);
  if(seconds > 60) throw new Error("录音超过 60 秒，Azure 单次最多评 60 秒。请把文本分段朗读。");
  const url = AZURE_PROXY_URL.replace(/\/+$/, "") + "/assess";
  let resp;
  try{
    resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "audio/wav",
      "X-Reference-Text": encodeURIComponent(referenceText)
    },
      body: wav
    });
  }catch(e){
    // 网络层失败（含 CORS 被拦）：浏览器只给 "Failed to fetch"
    throw new Error(`连不上评分服务（${e && e.message ? e.message : e}）。请在浏览器打开 ${AZURE_PROXY_URL.replace(/\/+$/, "")}/ 检查：应显示 "service": "pracread-azure"；若显示 Hello World，说明 Worker 代码还没换成 azure-proxy.js。`);
  }
  if(!resp.ok){
    const t = await resp.text().catch(()=> "");
    throw new Error(`评分服务出错（${resp.status}）${t ? "：" + t.slice(0, 200) : ""}`);
  }
  const data = await resp.json();
  data._seconds = seconds;
  return data;
}

async function runAzureScore(){
  if(!lastBlob){ setStatus("状态：请先录音。"); return; }
  const btn = $("#btnAzure");
  btn.disabled = true;
  $("#azureBox").classList.remove("hidden");
  $("#azureSummary").textContent = "正在评分…";
  $("#azureWords").innerHTML = "";
  try{
    const ref = currentText.replace(/\s+/g, " ").trim();
    const result = await azureAssess(lastBlob, ref);
    const summary = renderAzureScore(result);
    // 学生页（practice.js）会定义 onAzureScored，把成绩写入 Google Sheet
    if(summary && typeof onAzureScored === "function") onAzureScored(summary);
  }catch(e){
    $("#azureSummary").textContent = "发音评分失败：" + (e && e.message ? e.message : e);
  }finally{
    btn.disabled = !lastBlob;
  }
}
