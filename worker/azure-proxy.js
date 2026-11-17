// Cloudflare Worker：Azure 发音评估代理（保管密钥，网页只调用这里）。
// 需要设置的变量（Cloudflare 后台 Settings -> Variables，或 wrangler secret put）：
//   AZURE_SPEECH_KEY     Azure 语音服务密钥（secret）
//   AZURE_SPEECH_REGION  区域，新加坡用 southeastasia
//   ALLOWED_ORIGIN       允许调用的网页来源，例如 https://mrwengkb.github.io（多个用英文逗号分隔）
//
// 网页 POST {代理网址}/assess，body 为 16kHz 单声道 WAV，
// 头部 X-Reference-Text 为 encodeURIComponent(原文)。

const MAX_BYTES = 2_500_000; // 约 60 秒 16kHz 16bit 单声道 WAV

function allowedList(env){
  return (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
}

// 总是带上 CORS 头（回显请求来源），这样即使出错，网页也能读到错误信息；
// 真正的来源限制在 /assess 里用 403 执行。
function corsHeaders(origin){
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Reference-Text",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function text(msg, status, cors){
  return new Response(msg, { status, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
}

function b64utf8(str){
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for(const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export default {
  async fetch(request, env){
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);
    try{
      return await handle(request, env, origin, cors);
    }catch(err){
      return text("Worker 内部错误：" + (err && err.message ? err.message : err), 500, cors);
    }
  }
};

async function handle(request, env, origin, cors){
  const url = new URL(request.url);
  const allowed = allowedList(env);

  if(request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // 自检：在浏览器直接打开 Worker 网址即可看到配置是否齐全（不会显示密钥）
  if(request.method === "GET" && url.pathname === "/"){
    const info = {
      service: "pracread-azure",
      ok: !!env.AZURE_SPEECH_KEY && !!env.AZURE_SPEECH_REGION && allowed.length > 0,
      hasKey: !!env.AZURE_SPEECH_KEY,
      region: env.AZURE_SPEECH_REGION || null,
      allowedOrigin: allowed
    };
    return new Response(JSON.stringify(info, null, 2), { headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
  }

  if(request.method !== "POST" || url.pathname !== "/assess") return text("Not found", 404, cors);
  if(!allowed.includes(origin)) return text(`来源 ${origin || "(无)"} 不在 ALLOWED_ORIGIN（${allowed.join(", ") || "未设置"}）中`, 403, cors);
  if(!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION){
    return text("Worker 未配置 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION", 500, cors);
  }

  let ref = "";
  try{ ref = decodeURIComponent(request.headers.get("X-Reference-Text") || "").trim(); }catch(_){}
  if(!ref || ref.length > 600) return text("缺少原文或原文过长（最多 600 字）", 400, cors);

  const audio = await request.arrayBuffer();
  if(audio.byteLength < 1000) return text("录音为空", 400, cors);
  if(audio.byteLength > MAX_BYTES) return text("录音过长（最多约 60 秒）", 413, cors);

  const pa = {
    ReferenceText: ref,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    EnableMiscue: true
  };
  const endpoint = `https://${env.AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=zh-CN&format=detailed`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      "Accept": "application/json",
      "Pronunciation-Assessment": b64utf8(JSON.stringify(pa))
    },
    body: audio
  });
  const body = await resp.text();
  if(!resp.ok){
    const hint = resp.status === 401 ? "（Azure 密钥或区域不对）" : "";
    return text(`Azure 返回 ${resp.status}${hint}：${body.slice(0, 300)}`, 502, cors);
  }
  return new Response(body, { status: 200, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
}
