// ---------- 学生练习页 ----------
let hw = null;          // { mode, id, api, title, text, className, names, open }
let studentName = "";
const NAME_KEY_PREFIX = "pracread.name.";

function showLoadError(msg){
  $("#viewLoading").classList.remove("hidden");
  $("#loadMsg").textContent = msg;
}

function setSubmitMsg(text, kind){
  const el = $("#submitMsg");
  el.textContent = text;
  el.className = "submit-msg" + (kind ? " " + kind : "");
  el.classList.toggle("hidden", !text);
}

async function loadAssignment(){
  const link = parseAssignmentLink();
  if(!link){
    showLoadError("这个链接不完整，请向老师要正确的作业链接。");
    return;
  }

  if(link.mode === "offline"){
    hw = { mode: "offline", title: link.title, text: link.text.replace(/\r\n/g, "\n").trim() };
  }else{
    if(!link.api){
      showLoadError("网站还没有设置成绩表，无法打开这份作业。请告诉老师。");
      return;
    }
    try{
      const d = await sheetCall(link.api, { action: "getAssignment", id: link.id });
      hw = { mode: "sheet", id: d.id, api: link.api, title: d.title, text: d.text, className: d.className, names: d.names || [], open: d.open };
    }catch(e){
      showLoadError("加载作业失败：" + e.message);
      return;
    }
  }

  currentText = hw.text;
  document.title = (hw.title || "朗读作业") + " · 朗读练习";
  $("#hwTitle").textContent = hw.title || "朗读作业";
  $("#viewLoading").classList.add("hidden");
  $("#viewPractice").classList.remove("hidden");
  renderTextWithPinyin(currentText, showPinyin);

  if(hw.mode === "sheet"){
    $("#hwClass").textContent = hw.className ? "班级：" + hw.className : "";
    setupNamePicker();
    if(!hw.open) setSubmitMsg("这份作业已关闭，可以继续练习，但成绩不会再记录。", "warn");
  }else{
    $("#hwClass").textContent = "练习模式（不记录成绩）";
  }
  await refreshAudioList();
}

function setupNamePicker(){
  $("#viewName").classList.remove("hidden");
  const sel = $("#studentName");
  for(const n of hw.names){
    const o = document.createElement("option");
    o.value = n; o.textContent = n;
    sel.appendChild(o);
  }
  if(!hw.names.length) $("#nameHint").textContent = "老师还没有导入这个班的名单。";
  const saved = lsGet(NAME_KEY_PREFIX + hw.id);
  if(saved && hw.names.includes(saved)){ sel.value = saved; studentName = saved; }
  sel.addEventListener("change", ()=>{
    studentName = sel.value;
    lsSet(NAME_KEY_PREFIX + hw.id, studentName);
    sel.classList.remove("need");
  });
}

// azure.js 评分成功后调用
async function onAzureScored(summary){
  if(!hw || hw.mode !== "sheet" || !hw.open) return;
  if(!studentName){
    setSubmitMsg("没有选名字，这次成绩没有记录。", "warn");
    return;
  }
  if(summary.pron == null){
    setSubmitMsg("这次没有得到分数，没有记录。", "warn");
    return;
  }
  setSubmitMsg("正在记录成绩…");
  try{
    await sheetCall(hw.api, { action: "submit", id: hw.id, name: studentName, scores: summary });
    setSubmitMsg(`✓ 成绩已记录（${studentName}，发音总分 ${Math.round(summary.pron)}）`, "ok");
  }catch(e){
    setSubmitMsg("成绩没有记录成功：" + e.message, "warn");
  }
}

// ---------- Events ----------
$("#togglePinyin").addEventListener("click", ()=>{
  showPinyin = !showPinyin;
  const sw = $("#togglePinyin");
  sw.classList.toggle("on", showPinyin);
  sw.setAttribute("aria-checked", String(showPinyin));
  renderTextWithPinyin(currentText, showPinyin);
});

$("#btnRec").addEventListener("click", ()=>{
  if(hw && hw.mode === "sheet" && !studentName){
    const sel = $("#studentName");
    sel.classList.add("need");
    sel.focus();
    setStatus("状态：请先在上面选择你的名字。");
    return;
  }
  setSubmitMsg("");
  startRecording();
});
$("#btnStop").addEventListener("click", stopRecording);
$("#btnSave").addEventListener("click", saveRecording);
$("#btnAzure").addEventListener("click", runAzureScore);

$("#formatHint").textContent = MIME ? `优先编码：${MIME}` : "编码：由浏览器自动选择";

// 学生页总是自动评分
autoScore = true;
if(!azureEnabled()) $("#scoreHint").textContent = "网站未配置评分服务，无法评分。";
setButtons({rec:true, stop:false, save:false});
loadAssignment();
