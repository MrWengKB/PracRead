// ---------- Utilities ----------
const $ = (sel) => document.querySelector(sel);
const nowTs = () => Date.now();

function fmtTime(ts){
  const d = new Date(ts);
  const pad = (n)=> String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isChineseChar(ch){
  // Basic CJK Unified Ideographs + Extension A (common enough for classroom text)
  return /[\u3400-\u4DBF\u4E00-\u9FFF]/.test(ch);
}
