// 朗读练习 · Google Sheet 后端（Google Apps Script）
// 用法：在你的 Google Sheet 里点「扩展程序 → Apps Script」，把本文件全部内容粘贴进去，
//       改好下面的 TEACHER_KEY，然后「部署 → 新建部署 → 网页应用」，
//       执行身份选「我」，谁可以访问选「任何人」。详细步骤见 README。
//
// 表格里会自动建立这些分页：
//   作业        每次发布作业一行（可以把「状态」改成“关闭”来停止收成绩）
//   名单        班级 + 姓名
//   成绩        所有学生每评分一次记一行（总记录，带班级和作业）
//   汇总        按班级、作业、学生统计次数、最高分、平均分（自动公式）
//   班级·作业名  每发布一份作业自动建一个分页，只列该班学生，显示每人的次数、最高分、平均分、最近练习

// ★ 改成只有你知道的密码。老师页面「设置」里要填同一个密码，才能导入名单、发布作业。
const TEACHER_KEY = "改成你自己的密码";

const VERSION = 1;
const SH = { assign: "作业", roster: "名单", scores: "成绩", summary: "汇总" };
const HEADERS = {
  [SH.assign]: ["作业ID", "发布时间", "标题", "班级", "篇章", "状态", "分页"],
  [SH.roster]: ["班级", "姓名"],
  [SH.scores]: ["时间", "作业ID", "作业标题", "班级", "姓名", "发音总分", "准确度", "流利度", "完整度",
                "读对", "声调可疑", "读错", "漏读", "录音秒数", "识别文字"]
};

// 防刷：同一学生同一作业两次提交至少间隔几秒；每份作业每小时最多收几条
const MIN_GAP_SECONDS = 15;
const MAX_PER_ASSIGNMENT_PER_HOUR = 400;

function doGet(e) { return handle_((e && e.parameter) || {}); }

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (_) {}
  return handle_(body);
}

function handle_(req) {
  let out;
  try {
    out = route_(req);
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function route_(req) {
  const a = String(req.action || "");
  switch (a) {
    case "ping": return { ok: true, service: "pracread-sheet", version: VERSION, keySet: keyIsSet_() };
    case "getAssignment": return getAssignment_(req);
    case "submit": return submit_(req);
  }
  // 以下需要老师密码
  checkKey_(req.key);
  switch (a) {
    case "checkKey": return { ok: true };
    case "listClasses": return listClasses_();
    case "saveRoster": return saveRoster_(req);
    case "publish": return publish_(req);
    case "listAssignments": return listAssignments_();
  }
  throw new Error("未知操作：" + a);
}

// ---------- 工具 ----------
function keyIsSet_() { return TEACHER_KEY && TEACHER_KEY !== "改成你自己的密码" && TEACHER_KEY.length >= 4; }

function checkKey_(key) {
  if (!keyIsSet_()) throw new Error("请先在 Apps Script 里把 TEACHER_KEY 改成你自己的密码，并重新部署。");
  if (String(key || "") !== TEACHER_KEY) {
    Utilities.sleep(800); // 减慢猜密码
    throw new Error("老师密码不对。");
  }
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (HEADERS[name]) {
      sh.appendRow(HEADERS[name]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight("bold");
    }
    if (name === SH.scores) ensureSummary_();
  }
  return sh;
}

function ensureSummary_() {
  const ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName(SH.summary)) return;
  const sh = ss.insertSheet(SH.summary);
  sh.getRange("A1").setFormula(
    "=QUERY('" + SH.scores + "'!A:O," +
    "\"select B, C, D, E, count(F), max(F), avg(F), max(A) where E is not null group by B, C, D, E " +
    "label B '作业ID', C '作业', D '班级', E '姓名', count(F) '次数', max(F) '最高分', avg(F) '平均分', max(A) '最近练习' " +
    "order by D, C, E " +
    "format avg(F) '0', max(A) 'yyyy-mm-dd hh:mm'\",1)"
  );
}

function rows_(name) {
  const sh = sheet_(name);
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues();
}

// 防止被当成公式
function safe_(s, max) {
  s = String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim();
  if (max) s = s.slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function num_(v, lo, hi) {
  const n = Number(v);
  if (!isFinite(n)) return "";
  return Math.max(lo, Math.min(hi, Math.round(n * 10) / 10));
}

function namesOf_(className) {
  return rows_(SH.roster).filter(r => String(r[0]).trim() === className).map(r => String(r[1]).trim()).filter(Boolean);
}

function findAssignment_(id) {
  id = String(id || "").trim();
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return null;
  for (const r of rows_(SH.assign)) {
    if (String(r[0]) === id) {
      return { id, title: String(r[2]), className: String(r[3]).trim(), text: String(r[4]), open: String(r[5]).trim() !== "关闭" };
    }
  }
  return null;
}

// ---------- 学生 ----------
function getAssignment_(req) {
  const id = String(req.id || "");
  const cache = CacheService.getScriptCache();
  const hit = cache.get("a:" + id);
  if (hit) return JSON.parse(hit);
  const a = findAssignment_(id);
  if (!a) return { ok: false, error: "找不到这份作业，请向老师确认链接。" };
  const out = { ok: true, id: a.id, title: a.title, className: a.className, text: a.text, open: a.open, names: namesOf_(a.className) };
  cache.put("a:" + id, JSON.stringify(out), 60);
  return out;
}

function submit_(req) {
  const a = findAssignment_(req.id);
  if (!a) throw new Error("找不到这份作业。");
  if (!a.open) throw new Error("这份作业已关闭，成绩不再记录。");
  const name = String(req.name || "").trim();
  if (!namesOf_(a.className).includes(name)) throw new Error("名单里没有这个名字。");

  const s = req.scores || {};
  const pron = num_(s.pron, 0, 100);
  if (pron === "") throw new Error("缺少分数。");

  const cache = CacheService.getScriptCache();
  const gapKey = "g:" + a.id + ":" + Utilities.base64EncodeWebSafe(name);
  if (cache.get(gapKey)) throw new Error("提交太频繁，请稍后再试。");
  const hourKey = "h:" + a.id + ":" + Math.floor(Date.now() / 3600000);
  const count = Number(cache.get(hourKey) || 0);
  if (count >= MAX_PER_ASSIGNMENT_PER_HOUR) throw new Error("这份作业本小时提交次数太多，请稍后再试。");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    sheet_(SH.scores).appendRow([
      new Date(), a.id, safe_(a.title, 100), safe_(a.className, 50), safe_(name, 50),
      pron, num_(s.accuracy, 0, 100), num_(s.fluency, 0, 100), num_(s.completeness, 0, 100),
      num_(s.ok, 0, 5000), num_(s.tone, 0, 5000), num_(s.wrong, 0, 5000), num_(s.missing, 0, 5000),
      num_(s.seconds, 0, 600), safe_(s.heard, 600)
    ]);
  } finally {
    lock.releaseLock();
  }
  cache.put(gapKey, "1", MIN_GAP_SECONDS);
  cache.put(hourKey, String(count + 1), 3700);
  return { ok: true };
}

// ---------- 老师 ----------
function listClasses_() {
  const map = {};
  for (const r of rows_(SH.roster)) {
    const c = String(r[0]).trim(), n = String(r[1]).trim();
    if (!c || !n) continue;
    (map[c] = map[c] || []).push(n);
  }
  return { ok: true, classes: Object.keys(map).map(c => ({ className: c, names: map[c] })) };
}

function saveRoster_(req) {
  const className = String(req.className || "").trim().slice(0, 50);
  if (!className) throw new Error("请填写班级名称。");
  const seen = {};
  const names = (Array.isArray(req.names) ? req.names : [])
    .map(n => String(n || "").trim().slice(0, 50))
    .filter(n => n && !seen[n] && (seen[n] = true));
  if (names.length > 300) throw new Error("一个班最多 300 人。");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SH.roster);
    const keep = rows_(SH.roster).filter(r => String(r[0]).trim() !== className && String(r[1]).trim());
    const all = keep.map(r => [r[0], r[1]]).concat(names.map(n => [safe_(className), safe_(n)]));
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
    if (all.length) sh.getRange(2, 1, all.length, 2).setValues(all);
    syncClassTabs_(className, names);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, className, count: names.length };
}

function publish_(req) {
  const title = String(req.title || "").trim().slice(0, 100) || "朗读作业";
  const className = String(req.className || "").trim();
  const text = String(req.text || "").replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error("篇章是空的。");
  if (text.length > 3000) throw new Error("篇章太长（最多 3000 字）。");
  if (!className || !namesOf_(className).length) throw new Error("请先导入这个班级的名单。");

  // 以字母开头，避免表格把纯数字 ID 当成数字
  const id = "h" + Utilities.getUuid().replace(/-/g, "").slice(0, 11);
  let tab = "";
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    sheet_(SH.scores); // 确保「成绩」分页存在，作业分页的公式要用
    tab = makeAssignTab_(id, title, className, namesOf_(className));
    sheet_(SH.assign).appendRow([id, new Date(), safe_(title), safe_(className), safe_(text), "开放", tab]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, id, tab };
}

// ---------- 每份作业一个分页 ----------
const TAB_FIRST_ROW = 6; // 第 5 行是表头，第 6 行起是学生

function tabName_(className, title, id) {
  const ss = SpreadsheetApp.getActive();
  let base = (className + "·" + title).replace(/[\[\]*?\/\\:']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || id;
  let name = base;
  if (ss.getSheetByName(name) || Object.values(SH).includes(name)) name = base + " (" + id.slice(1, 5) + ")";
  return name;
}

function studentRow_(r) {
  const S = "'" + SH.scores + "'!";
  const cond = S + "$B:$B,$B$1," + S + "$E:$E,$A" + r;
  return [
    "=COUNTIFS(" + cond + ")",
    "=IF(B" + r + "=0,\"\",MAXIFS(" + S + "$F:$F," + cond + "))",
    "=IF(B" + r + "=0,\"\",ROUND(AVERAGEIFS(" + S + "$F:$F," + cond + "),0))",
    "=IF(B" + r + "=0,\"\",MAXIFS(" + S + "$A:$A," + cond + "))"
  ];
}

function appendStudents_(sh, names) {
  if (!names.length) return;
  const start = Math.max(sh.getLastRow() + 1, TAB_FIRST_ROW);
  const rows = names.map((n, i) => [safe_(n)].concat(studentRow_(start + i)));
  sh.getRange(start, 1, rows.length, 5).setValues(rows);
  sh.getRange(start, 5, rows.length, 1).setNumberFormat("yyyy-mm-dd hh:mm");
}

function makeAssignTab_(id, title, className, names) {
  const name = tabName_(className, title, id);
  const sh = SpreadsheetApp.getActive().insertSheet(name);
  sh.getRange(1, 1, 3, 2).setValues([["作业ID", id], ["班级", safe_(className)], ["标题", safe_(title)]]);
  sh.getRange(5, 1, 1, 5).setValues([["姓名", "练习次数", "最高分", "平均分", "最近练习"]]);
  sh.getRange(5, 1, 1, 5).setFontWeight("bold");
  sh.setFrozenRows(5);
  appendStudents_(sh, names);
  return name;
}

// 名单更新后，把新加入的学生补进这个班已发布的作业分页
function syncClassTabs_(className, names) {
  const ss = SpreadsheetApp.getActive();
  for (const r of rows_(SH.assign)) {
    if (String(r[3]).trim() !== className || !r[6]) continue;
    const sh = ss.getSheetByName(String(r[6]));
    if (!sh) continue;
    const n = sh.getLastRow();
    const have = n >= TAB_FIRST_ROW ? sh.getRange(TAB_FIRST_ROW, 1, n - TAB_FIRST_ROW + 1, 1).getValues().map(x => String(x[0]).trim()) : [];
    appendStudents_(sh, names.filter(x => !have.includes(x)));
  }
}

function listAssignments_() {
  const list = rows_(SH.assign).map(r => ({
    id: String(r[0]), tab: String(r[6] || ""), time: r[1] instanceof Date ? r[1].getTime() : String(r[1]),
    title: String(r[2]), className: String(r[3]), open: String(r[5]).trim() !== "关闭",
    preview: String(r[4]).slice(0, 30)
  })).filter(x => x.id);
  list.reverse();
  return { ok: true, assignments: list.slice(0, 50) };
}

// 在编辑器里手动运行一次可以先建立所有分页（可选）
function setup() {
  [SH.assign, SH.roster, SH.scores].forEach(sheet_);
  ensureSummary_();
}
