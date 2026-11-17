// ---------- 作业链接 ----------
// 有成绩表：practice.html?a=<作业ID>            篇章、班级、名单都存在 Google Sheet 里
// 没有成绩表：practice.html#p=<篇章编码>         篇章直接编码在链接里，不记名、不记成绩

function b64urlEncode(str){
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for(const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s){
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while(s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function practiceBaseUrl(){
  return new URL("practice.html", location.href.split("#")[0].split("?")[0]).href;
}

function buildSheetLink(id, apiUrl){
  let u = practiceBaseUrl() + "?a=" + encodeURIComponent(id);
  if(apiUrl && apiUrl !== configSheetUrl()) u += "&api=" + encodeURIComponent(apiUrl);
  return u;
}

function buildOfflineLink(title, text){
  return practiceBaseUrl() + "#p=" + b64urlEncode(JSON.stringify({ t: title, x: text }));
}

function parseAssignmentLink(){
  const q = new URLSearchParams(location.search);
  const id = (q.get("a") || "").trim();
  if(id){
    const api = (q.get("api") || "").trim();
    return { mode: "sheet", id, api: isValidSheetUrl(api) ? api : configSheetUrl() };
  }
  const m = location.hash.match(/[#&]p=([\w-]+)/);
  if(m){
    try{
      const o = JSON.parse(b64urlDecode(m[1]));
      if(o && typeof o.x === "string" && o.x.trim()) return { mode: "offline", title: String(o.t || ""), text: o.x };
    }catch(_){}
  }
  return null;
}
