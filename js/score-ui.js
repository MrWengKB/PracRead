// ---------- Scoring UI ----------
// Azure 发音评分结果展示，以及用 Azure 识别文字做的逐字对照（ReadScore.alignAndScore）。
const AUTO_SCORE_KEY = "pracread.autoScore";
let autoScore = true;
try{ autoScore = localStorage.getItem(AUTO_SCORE_KEY) !== "0"; }catch(_){}

function setAutoScore(on){
  autoScore = on;
  try{ localStorage.setItem(AUTO_SCORE_KEY, on ? "1" : "0"); }catch(_){}
  const sw = $("#toggleScore");
  sw.classList.toggle("on", on);
  sw.setAttribute("aria-checked", String(on));
}

function clearScore(){
  $("#scoreBox").classList.add("hidden");
  $("#scoreSummary").textContent = "";
  $("#scoreChars").innerHTML = "";
  $("#scoreHeard").textContent = "";
  $("#azureBox").classList.add("hidden");
  $("#azureSummary").textContent = "";
  $("#azureWords").innerHTML = "";
}

function renderCharScore(targetText, heardText){
  const box = $("#scoreBox");
  box.classList.remove("hidden");
  $("#scoreHeard").textContent = heardText || "（没有识别到内容）";
  const chars = $("#scoreChars");
  chars.innerHTML = "";

  if(!heardText){
    $("#scoreSummary").textContent = "没有识别到朗读内容，请靠近麦克风再试一次。";
    return null;
  }
  const { pinyin } = window.pinyinPro || {};
  if(!pinyin){
    $("#scoreSummary").textContent = "拼音库未加载，无法评分。";
    return null;
  }
  const r = ReadScore.alignAndScore(targetText, heardText, pinyin);
  $("#scoreSummary").textContent =
    `共 ${r.total} 字：读对 ${r.ok}，声调可疑 ${r.tone}，读错 ${r.wrong}，漏读 ${r.missing}，多读 ${r.extra}`;

  for(const p of r.perChar){
    const el = document.createElement("span");
    el.className = "sc " + p.status;
    if(p.status !== "ok"){
      el.title = `应读 ${p.py}` + (p.heard ? `，听成「${p.heard}」${p.heardPy}` : "，漏读");
    }
    const sm = document.createElement("small");
    sm.textContent = (p.status === "tone" || p.status === "wrong") ? p.heard : p.status === "missing" ? "漏读" : "\u00a0";
    el.appendChild(sm);
    el.appendChild(document.createTextNode(p.ch));
    chars.appendChild(el);
  }
  return r;
}

function renderAzureScore(result){
  const box = $("#azureBox");
  box.classList.remove("hidden");
  const best = result && result.NBest && result.NBest[0];
  if(!best){
    $("#azureSummary").textContent = "Azure 没有返回评分结果" + (result && result.RecognitionStatus ? `（${result.RecognitionStatus}）` : "") + "。";
    return null;
  }
  const pa = best.PronunciationAssessment || best;
  // 用 Azure 的识别文字做逐字对照
  const heard = best.Display || best.Lexical || "";
  const cs = renderCharScore(currentText, heard);
  const fmt = (v)=> v == null ? "-" : Math.round(v);
  $("#azureSummary").textContent =
    `发音总分 ${fmt(pa.PronScore)} · 准确度 ${fmt(pa.AccuracyScore)} · 流利度 ${fmt(pa.FluencyScore)} · 完整度 ${fmt(pa.CompletenessScore)}`;

  const wrap = $("#azureWords");
  wrap.innerHTML = "";
  for(const w of (best.Words || [])){
    const wpa = w.PronunciationAssessment || w;
    const type = wpa.ErrorType || "None";
    const acc = wpa.AccuracyScore;
    const el = document.createElement("span");
    let cls = "ok";
    if(type === "Omission") cls = "missing";
    else if(type === "Insertion") cls = "extra";
    else if(type === "Mispronunciation" || (acc != null && acc < 60)) cls = "wrong";
    else if(acc != null && acc < 85) cls = "tone";
    el.className = "sc " + cls;
    const sm = document.createElement("small");
    sm.textContent = type === "Omission" ? "漏读" : type === "Insertion" ? "多读" : fmt(acc);
    el.appendChild(sm);
    el.appendChild(document.createTextNode(w.Word || ""));
    const parts = (w.Syllables || w.Phonemes || []).map(s => {
      const spa = s.PronunciationAssessment || s;
      return `${s.Syllable || s.Phoneme || ""} ${fmt(spa.AccuracyScore)}`;
    });
    el.title = `准确度 ${fmt(acc)}` + (type !== "None" ? `（${type}）` : "") + (parts.length ? `\n${parts.join("  ")}` : "");
    wrap.appendChild(el);
  }
  return {
    pron: pa.PronScore, accuracy: pa.AccuracyScore, fluency: pa.FluencyScore, completeness: pa.CompletenessScore,
    ok: cs ? cs.ok : null, tone: cs ? cs.tone : null, wrong: cs ? cs.wrong : null, missing: cs ? cs.missing : null,
    seconds: result._seconds, heard
  };
}
