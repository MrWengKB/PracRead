// ---------- Pinyin rendering ----------
function renderTextWithPinyin(text, show){
  // Use pinyin-pro for whole text -> pinyin array aligned by char
  // We use pinyin(text, { type:'array', toneType:'symbol', nonZh:'spaced' })
  // Note: nonZh:'spaced' inserts non-Chinese chunks as separate array elements; alignment is not strictly 1:1 with original.
  // So we do a safer per-character approach for Chinese chars only.
  const { pinyin } = window.pinyinPro || {};
  const frag = document.createDocumentFragment();

  for (const ch of text){
    if (isChineseChar(ch)){
      const py = pinyin ? pinyin(ch, { toneType: "symbol" }) : "";
      const span = document.createElement("span");
      span.className = "zh";

      const pyEl = document.createElement("span");
      pyEl.className = "py" + (show ? "" : " hidden");
      pyEl.textContent = (py || "").replace(/\s+/g," ");

      const hzEl = document.createElement("span");
      hzEl.className = "hz";
      hzEl.textContent = ch;

      span.appendChild(pyEl);
      span.appendChild(hzEl);
      frag.appendChild(span);
    }else{
      // keep punctuation / whitespace as-is
      frag.appendChild(document.createTextNode(ch));
    }
  }

  const box = $("#display");
  box.innerHTML = "";
  box.appendChild(frag);
}
