// Cloudflare Worker：Azure 发音评估代理（保管密钥，网页只调用这里）。
// 需要设置的变量（Cloudflare 后台 Settings -> Variables，或 wrangler secret put）：
//   AZURE_SPEECH_KEY     Azure 语音服务密钥（secret）
//   AZURE_SPEECH_REGION  区域，新加坡用 southeastasia
//   ALLOWED_ORIGIN       允许调用的网页来源，例如 https://mrwengkb.github.io（多个用英文逗号分隔）
//
// 网页 POST {代理网址}/assess，body 为 16kHz 单声道 WAV，
// 头部 X-Reference-Text 为 encodeURIComponent(原文)。

const MAX_BYTES = 2_500_000; // 约 60 秒 16kHz 16bit 单声道 WAV

function corsHeaders(origin, env){
  const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = origin && allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : (allowed[0] || "null"),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Reference-Text",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
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
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if(request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if(request.method !== "POST" || url.pathname !== "/assess"){
      return new Response("Not found", { status: 404, headers: cors });
    }
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
    if(!allowed.includes(origin)) return new Response("Origin not allowed", { status: 403, headers: cors });
    if(!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION){
      return new Response("Worker 未配置 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION", { status: 500, headers: cors });
    }

    let ref = "";
    try{ ref = decodeURIComponent(request.headers.get("X-Reference-Text") || "").trim(); }catch(_){}
    if(!ref || ref.length > 600) return new Response("缺少原文或原文过长", { status: 400, headers: cors });

    const audio = await request.arrayBuffer();
    if(audio.byteLength < 1000) return new Response("录音为空", { status: 400, headers: cors });
    if(audio.byteLength > MAX_BYTES) return new Response("录音过长（最多约 60 秒）", { status: 413, headers: cors });

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
    return new Response(body, {
      status: resp.status,
      headers: { ...cors, "Content-Type": resp.headers.get("Content-Type") || "application/json" }
    });
  }
};
