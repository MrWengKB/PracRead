// ---------- App State ----------
let currentText = "";
let showPinyin = false;

// Recorder state
let mediaStream = null;
let mediaRecorder = null;
let chunks = [];
let lastBlob = null;
let recStartAt = 0;
let meterTimer = null;

// Try to pick a supported mimeType
function pickMimeType(){
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",       // some Safari versions
    "audio/aac",
    "audio/ogg;codecs=opus",
    "audio/ogg"
  ];
  for (const t of candidates){
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  }
  return ""; // let browser decide
}

const MIME = pickMimeType();
