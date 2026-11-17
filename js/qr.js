// ---------- 作业二维码（在浏览器本地生成，链接不会发给任何第三方） ----------
// 依赖 js/vendor/qrcode.js（Kazuhiko Arase，MIT）

// 在 canvas 上画：二维码 + 下方作业标题。成功返回 true。
function drawQrCard(canvas, url, title){
  let qr = null;
  for(const level of ["M", "L"]){
    try{ qr = qrcode(0, level); qr.addData(url); qr.make(); break; }
    catch(_){ qr = null; }
  }
  const ctx = canvas.getContext("2d");
  if(!qr){
    canvas.width = 600; canvas.height = 120;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#c00"; ctx.font = "24px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("链接太长，无法生成二维码", 300, 70);
    return false;
  }
  const n = qr.getModuleCount();
  const quiet = 4;
  const cell = Math.max(4, Math.floor(720 / (n + quiet * 2)));
  const size = cell * (n + quiet * 2);
  const textH = title ? Math.round(size * 0.16) : 0;
  canvas.width = size; canvas.height = size + textH;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  for(let r = 0; r < n; r++)
    for(let c = 0; c < n; c++)
      if(qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  if(title){
    let fs = Math.round(textH * 0.5);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const font = (s)=> `600 ${s}px system-ui, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`;
    ctx.font = font(fs);
    while(fs > 12 && ctx.measureText(title).width > size * 0.92){ fs--; ctx.font = font(fs); }
    ctx.fillText(title, size / 2, size + textH * 0.35);
  }
  return true;
}

function printQr(canvas, title, url){
  const w = window.open("", "_blank");
  if(!w){ alert("浏览器挡住了弹出窗口，请允许弹出窗口后再试，或改用「下载二维码」。"); return; }
  const esc = (s)=> String(s || "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif;text-align:center;margin:40px;color:#000;background:#fff}
img{width:12cm;max-width:90vw;image-rendering:pixelated}p{word-break:break-all;font-size:11px;color:#444}</style></head>
<body><img src="${canvas.toDataURL("image/png")}" alt="二维码"><p>${esc(url)}</p>
<script>window.onload=function(){setTimeout(function(){window.print();},200);};<\/script></body></html>`);
  w.document.close();
}
