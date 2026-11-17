// ---------- 老师页：设置、学生名单、发布作业 ----------

function teacherKey(){ return lsGet(TEACHER_KEY_KEY); }
function teacherReady(){ return !!teacherSheetUrl() && !!teacherKey(); }
function teacherCall(payload){ return sheetCall(teacherSheetUrl(), { ...payload, key: teacherKey() }); }

function setMsg(sel, text, kind){
  const el = $(sel);
  el.textContent = text || "";
  el.className = "msg" + (kind ? " " + kind : "");
}

// ---------- 名单解析（纯函数） ----------
// 支持：每行一个名字；从 Excel 复制（制表符分隔）；CSV。
// 第一行如有「姓名/Name」「班级/Class」表头，就按栏读取（可一次导入多个班）。
const NAME_HEAD = /^(姓名|名字|学生|学生姓名|中文名|name|names|student|student name|full name)$/i;
const CLASS_HEAD = /^(班级|班|班别|class|class name|form class|form)$/i;

function splitCsvLine(line, delim){
  if(delim === "\t") return line.split("\t");
  const out = []; let cur = ""; let q = false;
  for(let i = 0; i < line.length; i++){
    const c = line[i];
    if(q){
      if(c === '"' && line[i+1] === '"'){ cur += '"'; i++; }
      else if(c === '"') q = false;
      else cur += c;
    }else if(c === '"') q = true;
    else if(c === delim){ out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseRoster(text, defaultClass){
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if(!lines.length) return { error: "名单是空的。" };
  const delim = lines.some(l => l.includes("\t")) ? "\t" : lines.some(l => l.includes(",")) ? "," : null;
  let rows = lines.map(l => (delim ? splitCsvLine(l, delim) : [l]).map(c => c.trim()));

  let nameIdx = -1, classIdx = -1;
  const head = rows[0];
  head.forEach((c, i)=>{
    if(nameIdx < 0 && NAME_HEAD.test(c)) nameIdx = i;
    else if(classIdx < 0 && CLASS_HEAD.test(c)) classIdx = i;
  });
  const hasHeader = nameIdx >= 0 || classIdx >= 0;
  if(hasHeader){
    if(nameIdx < 0) return { error: "表头里找不到「姓名 / Name」这一栏。" };
    rows = rows.slice(1);
  }

  const classes = {};
  const def = String(defaultClass || "").trim();
  for(const r of rows){
    let name;
    if(hasHeader) name = r[nameIdx] || "";
    else if(r.length === 1) name = r[0].replace(/^\d+\s*[.)、:：]\s*/, "");
    else name = r.find(c => c && !/^\d+[.)]?$/.test(c)) || "";
    name = name.trim();
    if(!name) continue;
    const cls = (classIdx >= 0 && r[classIdx] ? r[classIdx] : def).trim();
    if(!cls) return { error: "请先填写班级名称。" };
    const list = classes[cls] = classes[cls] || [];
    if(!list.includes(name)) list.push(name);
  }
  if(!Object.keys(classes).length) return { error: "没有读到任何名字。" };
  return { classes };
}

// ---------- 设置 ----------
let classCache = null;

function openSettings(){
  $("#setSheetUrl").value = lsGet(SHEET_URL_KEY) || configSheetUrl();
  $("#setKey").value = teacherKey();
  showView("settings");
  if(teacherReady()) loadClasses();
}

async function saveSheetSettings(){
  const url = $("#setSheetUrl").value.trim();
  const key = $("#setKey").value.trim();
  if(url && !isValidSheetUrl(url)){
    setMsg("#sheetMsg", "网址格式不对。应该是 https://script.google.com/macros/s/……/exec（在 Apps Script「部署」后复制的「网页应用」网址）。", "err");
    return;
  }
  lsSet(SHEET_URL_KEY, url);
  lsSet(TEACHER_KEY_KEY, key);
  if(!teacherSheetUrl()){ setMsg("#sheetMsg", "已清空。", ""); return; }
  setMsg("#sheetMsg", "正在测试连接…");
  try{
    const p = await sheetCall(teacherSheetUrl(), { action: "ping" });
    if(!p.keySet){ setMsg("#sheetMsg", "连上了，但 Apps Script 里的 TEACHER_KEY 还没改成你自己的密码。改好后要「管理部署 → 编辑 → 新版本」重新部署。", "err"); return; }
    if(!key){ setMsg("#sheetMsg", "连上了。请再填写老师密码。", "err"); return; }
    await teacherCall({ action: "checkKey" });
    setMsg("#sheetMsg", "✓ 连接成功，密码正确。", "ok");
    loadClasses();
  }catch(e){
    setMsg("#sheetMsg", "连接失败：" + e.message, "err");
  }
}

function renderRosterPreview(){
  const txt = $("#rosterText").value;
  if(!txt.trim()){ $("#rosterPreview").textContent = "如果表格第一行有「姓名 / Name」和「班级 / Class」栏，会自动按栏读取，并可一次导入多个班。"; return; }
  const r = parseRoster(txt, $("#rosterClass").value);
  if(r.error){ $("#rosterPreview").textContent = "⚠ " + r.error; return; }
  $("#rosterPreview").textContent = Object.entries(r.classes)
    .map(([c, ns]) => `${c}：${ns.length} 人（${ns.slice(0, 6).join("、")}${ns.length > 6 ? "……" : ""}）`).join("\n");
}

async function saveRoster(){
  if(!teacherReady()){ setMsg("#rosterMsg", "请先在上面设置成绩表网址和老师密码。", "err"); return; }
  const r = parseRoster($("#rosterText").value, $("#rosterClass").value);
  if(r.error){ setMsg("#rosterMsg", r.error, "err"); return; }
  const btn = $("#btnSaveRoster");
  btn.disabled = true;
  setMsg("#rosterMsg", "正在保存…");
  const done = [];
  try{
    for(const [className, names] of Object.entries(r.classes)){
      const res = await teacherCall({ action: "saveRoster", className, names });
      done.push(`${res.className}（${res.count} 人）`);
    }
    setMsg("#rosterMsg", "✓ 已保存：" + done.join("、"), "ok");
    loadClasses();
  }catch(e){
    setMsg("#rosterMsg", (done.length ? "已保存：" + done.join("、") + "\n" : "") + "保存失败：" + e.message, "err");
  }finally{
    btn.disabled = false;
  }
}

async function loadClasses(){
  const box = $("#classList");
  if(!teacherReady()){ box.innerHTML = '<span class="hint">还没设置成绩表。</span>'; return []; }
  box.innerHTML = '<span class="hint">加载中…</span>';
  try{
    const d = await teacherCall({ action: "listClasses" });
    classCache = d.classes;
    box.innerHTML = "";
    if(!classCache.length) box.innerHTML = '<span class="hint">还没有导入任何班级。</span>';
    for(const c of classCache){
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = `${c.className}（${c.names.length}）`;
      b.onclick = ()=>{
        $("#rosterClass").value = c.className;
        $("#rosterText").value = c.names.join("\n");
        renderRosterPreview();
      };
      box.appendChild(b);
    }
    return classCache;
  }catch(e){
    box.innerHTML = "";
    const s = document.createElement("span");
    s.className = "hint";
    s.textContent = "加载失败：" + e.message;
    box.appendChild(s);
    return [];
  }
}

// ---------- 发布作业 ----------
let publishText = "";

async function openPublish(){
  const text = ($("#inputText").value || "").replace(/\r\n/g, "\n").trim();
  if(!text){ alert("请先在输入框里输入要发布的篇章。"); return; }
  publishText = text;
  const firstLine = text.split("\n")[0].replace(/\s+/g, " ");
  $("#pubTitle").value = firstLine.slice(0, 16) + (firstLine.length > 16 ? "…" : "");
  const zh = Array.from(text).filter(isChineseChar).length;
  $("#pubPreview").textContent = `共 ${zh} 个汉字：${text.slice(0, 60).replace(/\s+/g, " ")}${text.length > 60 ? "……" : ""}` +
    (zh > 220 ? "\n⚠ 篇章较长，一次朗读可能超过 60 秒（评分上限）。建议分成几段分别发布。" : "");
  $("#pubResult").classList.add("hidden");
  setMsg("#pubMsg", "");
  showView("publish");

  const ready = teacherReady();
  $("#pubClassField").classList.toggle("hidden", !ready);
  $("#btnDoPublish").disabled = !ready;
  if(!ready){
    setMsg("#pubMsg", "还没设置成绩表，只能生成「不记成绩」的链接（学生不用选名字）。要记录成绩，请先到「设置」里连接 Google Sheet 并导入名单。", "err");
    $("#hwList").innerHTML = "";
    return;
  }
  const sel = $("#pubClass");
  sel.innerHTML = '<option value="">加载中…</option>';
  const classes = classCache || await loadClasses();
  sel.innerHTML = "";
  for(const c of classes){
    const o = document.createElement("option");
    o.value = c.className;
    o.textContent = `${c.className}（${c.names.length} 人）`;
    sel.appendChild(o);
  }
  const last = lsGet("pracread.lastClass");
  if(last && classes.some(c => c.className === last)) sel.value = last;
  $("#pubClassHint").textContent = classes.length ? "" : "还没有名单，请先到「设置」导入学生名单。";
  $("#btnDoPublish").disabled = !classes.length;
  loadAssignments();
}

function showLink(url){
  $("#pubLink").value = url;
  $("#btnOpenLink").href = url;
  $("#pubResult").classList.remove("hidden");
  $("#pubLink").select();
}

async function doPublish(){
  const className = $("#pubClass").value;
  if(!className){ setMsg("#pubMsg", "请选择班级。", "err"); return; }
  const btn = $("#btnDoPublish");
  btn.disabled = true;
  setMsg("#pubMsg", "正在发布…");
  try{
    const d = await teacherCall({ action: "publish", title: $("#pubTitle").value.trim(), className, text: publishText });
    lsSet("pracread.lastClass", className);
    showLink(buildSheetLink(d.id, teacherSheetUrl()));
    setMsg("#pubMsg", "✓ 已发布。这份作业的成绩在 Google Sheet 的分页「" + (d.tab || className) + "」里（只列这个班的学生）。", "ok");
    loadAssignments();
  }catch(e){
    setMsg("#pubMsg", "发布失败：" + e.message, "err");
  }finally{
    btn.disabled = false;
  }
}

function offlineLink(){
  showLink(buildOfflineLink($("#pubTitle").value.trim(), publishText));
  setMsg("#pubMsg", "这是不记成绩的链接：篇章直接包含在链接里，学生可以练习、看评分，但不选名字，成绩不会写入表格。", "");
}

async function copyText(t){
  try{ await navigator.clipboard.writeText(t); return true; }
  catch(_){
    const ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    let ok = false; try{ ok = document.execCommand("copy"); }catch(_){}
    ta.remove(); return ok;
  }
}

async function loadAssignments(){
  const box = $("#hwList");
  if(!teacherReady()){ box.innerHTML = ""; return; }
  box.innerHTML = '<div class="hint">加载中…</div>';
  try{
    const d = await teacherCall({ action: "listAssignments" });
    box.innerHTML = "";
    if(!d.assignments.length) box.innerHTML = '<div class="hint">还没有发布过作业。</div>';
    for(const a of d.assignments){
      const url = buildSheetLink(a.id, teacherSheetUrl());
      const row = document.createElement("div");
      row.className = "hw-item row";
      const meta = document.createElement("div");
      const nm = document.createElement("div");
      nm.className = "name";
      nm.textContent = a.title + (a.open ? "" : "（已关闭）");
      const sub = document.createElement("div");
      sub.className = "hint";
      sub.textContent = `${a.className} · ${typeof a.time === "number" ? fmtTime(a.time) : a.time}` + (a.tab ? ` · 成绩分页「${a.tab}」` : "");
      meta.append(nm, sub);
      const sp = document.createElement("div"); sp.className = "spacer";
      const cp = document.createElement("button");
      cp.className = "btn"; cp.textContent = "复制链接";
      cp.onclick = async ()=>{ cp.textContent = (await copyText(url)) ? "已复制 ✓" : "复制失败"; setTimeout(()=> cp.textContent = "复制链接", 1500); };
      const op = document.createElement("a");
      op.className = "btn"; op.textContent = "打开"; op.href = url; op.target = "_blank"; op.rel = "noopener";
      row.append(meta, sp, cp, op);
      box.appendChild(row);
    }
  }catch(e){
    box.innerHTML = "";
    const s = document.createElement("div");
    s.className = "hint"; s.textContent = "加载失败：" + e.message;
    box.appendChild(s);
  }
}

// ---------- Events ----------
$("#btnSettings").addEventListener("click", openSettings);
$("#btnSaveSheet").addEventListener("click", saveSheetSettings);
$("#rosterText").addEventListener("input", renderRosterPreview);
$("#rosterClass").addEventListener("input", renderRosterPreview);
$("#rosterFile").addEventListener("change", (e)=>{
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  const rd = new FileReader();
  rd.onload = ()=>{ $("#rosterText").value = String(rd.result || ""); renderRosterPreview(); };
  rd.readAsText(f, "utf-8");
});
$("#btnSaveRoster").addEventListener("click", saveRoster);
$("#btnLoadClasses").addEventListener("click", loadClasses);
$("#btnPublish").addEventListener("click", openPublish);
$("#btnDoPublish").addEventListener("click", doPublish);
$("#btnOfflineLink").addEventListener("click", offlineLink);
$("#btnCopyLink").addEventListener("click", async ()=>{
  const b = $("#btnCopyLink");
  b.textContent = (await copyText($("#pubLink").value)) ? "已复制 ✓" : "复制失败，请手动复制";
  setTimeout(()=> b.textContent = "复制链接", 1500);
});
$("#btnLoadHw").addEventListener("click", loadAssignments);
