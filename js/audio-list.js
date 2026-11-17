// ---------- Audio list UI ----------
async function refreshAudioList(){
  const list = $("#audioList");
  list.innerHTML = "";

  let items = await dbGetAllAudios();
  items.sort((a,b)=> b.createdAt - a.createdAt);
  items = items.slice(0,4);

  if(items.length === 0){
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "暂无保存的录音。";
    list.appendChild(empty);
    return;
  }

  for (const it of items){
    const row = document.createElement("div");
    row.className = "item";

    const meta = document.createElement("div");
    meta.className = "meta";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = it.title || "朗读录音";

    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = `${fmtTime(it.createdAt)}  |  ${Math.round((it.durationMs||0)/1000)}s  |  ${it.mimeType || "unknown"}`;

    meta.appendChild(name);
    meta.appendChild(sub);

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = URL.createObjectURL(it.blob);

    const spacer = document.createElement("div");
    spacer.className = "spacer";

    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "删除";
    del.onclick = async ()=>{
      // stop any playback first
      try { audio.pause(); } catch(e){}
      await dbDeleteAudio(it.id);
      await refreshAudioList();
    };

    row.appendChild(meta);
    row.appendChild(audio);
    row.appendChild(spacer);
    row.appendChild(del);

    list.appendChild(row);
  }
}

// enforce max 4 saved audios in db
async function enforceMax4(){
  let items = await dbGetAllAudios();
  items.sort((a,b)=> b.createdAt - a.createdAt);
  const extra = items.slice(4);
  for (const it of extra){
    await dbDeleteAudio(it.id);
  }
}
