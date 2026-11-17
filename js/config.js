// ---------- Config ----------
// Azure 发音评估（可选）。部署 worker/azure-proxy.js 后，把它的网址填在这里，例如
// "https://pracread-azure.<你的子域>.workers.dev"。留空则不显示“发音评分”按钮。
const AZURE_PROXY_URL = "https://pracread-azure.wengkaibin.workers.dev";

// 成绩表（Google Apps Script 网页应用）网址，形如 "https://script.google.com/macros/s/xxxx/exec"。
// 填在这里后，学生链接会更短；老师也可以只在网页「设置」里填。留空则只能发布“不记成绩”的链接。
const SHEET_API_URL = "";
