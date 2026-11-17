// ---------- Google Sheet 后端（apps-script/Code.gs 部署成的网页应用） ----------
// 网址来源优先级：链接里的 ?api=  >  老师在「设置」里填的  >  js/config.js 的 SHEET_API_URL

const SHEET_URL_KEY = "pracread.sheetUrl";
const TEACHER_KEY_KEY = "pracread.teacherKey";

function isValidSheetUrl(u){
  return /^https:\/\/script\.google\.com\/(a\/macros\/[^\/?#]+|macros)\/s\/[\w-]+\/exec$/.test(String(u || "").trim());
}

function lsGet(k){ try{ return localStorage.getItem(k) || ""; }catch(_){ return ""; } }
function lsSet(k, v){ try{ v ? localStorage.setItem(k, v) : localStorage.removeItem(k); }catch(_){} }

function configSheetUrl(){
  return (typeof SHEET_API_URL === "string" && isValidSheetUrl(SHEET_API_URL)) ? SHEET_API_URL.trim() : "";
}

// 老师页用
function teacherSheetUrl(){
  const own = lsGet(SHEET_URL_KEY).trim();
  return isValidSheetUrl(own) ? own : configSheetUrl();
}

async function sheetCall(url, payload){
  if(!isValidSheetUrl(url)) throw new Error("还没有设置成绩表网址（Apps Script 网页应用网址）。");
  let resp;
  try{
    // text/plain 是“简单请求”，不会触发 CORS 预检，Apps Script 才能接收
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });
  }catch(e){
    const err = new Error("连不上成绩表服务。最常见的原因是部署时「谁可以访问」没有选「任何人」。请点下面的测试链接看看显示什么。");
    err.testUrl = url + "?action=ping";
    throw err;
  }
  const t = await resp.text();
  let data;
  try{ data = JSON.parse(t); }catch(_){
    throw new Error("成绩表服务返回的不是正确数据。请确认 Apps Script 部署时「谁可以访问」选的是「任何人」。");
  }
  if(!data.ok) throw new Error(data.error || "成绩表服务出错。");
  return data;
}
