(() => {
"use strict";

const BASE_W = 1920;
const BASE_H = 1080;
const $ = id => document.getElementById(id);
let currentTvMode="NORMAL";
let currentTvPhase="";
let lastRenderedMusicPhase="";
const stage = $("stage");
const left = $("leftCards");
const right = $("rightCards");
const alarmAudio = $("alarmAudio");
const silenceAudio = $("silenceAudio");
const musicAudio = new Audio();
musicAudio.preload = "auto";
const systemEventAudio = new Audio();
systemEventAudio.preload = "auto";
let musicPolicy = null;
let musicPolicyKey = "";
let musicManualState = "auto";
let musicPriorityBusy = false;
let musicFadeTimer = null;
let musicTrack = null;
let musicRuntimeState = "stopped";
let musicTestActiveUntil = 0;
let musicTestStopTimer = null;
let musicTestFadeTimer = null;

function viewportSize(){
  const vv = window.visualViewport;
  const w = Math.max(1, Math.round(vv?.width || document.documentElement.clientWidth || innerWidth || BASE_W));
  const h = Math.max(1, Math.round(vv?.height || document.documentElement.clientHeight || innerHeight || BASE_H));
  return {w,h};
}

function fitStage(){
  const {w,h} = viewportSize();
  const scale = Math.min(w / BASE_W, h / BASE_H);
  const x = Math.round((w - BASE_W * scale) / 2);
  const y = Math.round((h - BASE_H * scale) / 2);

  stage.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`;
  stage.dataset.scale = scale.toFixed(5);
  stage.dataset.viewport = `${w}x${h}`;

  const dbg = $("viewportDebug");
  if (new URLSearchParams(location.search).get("debug") === "1") {
    dbg.textContent = `viewport ${w}×${h} • canvas 1920×1080 • scale ${scale.toFixed(4)}`;
    dbg.classList.remove("hidden");
  } else {
    dbg.classList.add("hidden");
  }
}
addEventListener("resize", fitStage, {passive:true});
addEventListener("orientationchange", fitStage, {passive:true});
window.visualViewport?.addEventListener("resize", fitStage, {passive:true});
fitStage();
setInterval(fitStage, 5000);

function esc(v){
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function mmss(sec){
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
}
function weatherIcon(code){
  code = Number(code);
  if(code===0) return "☀";
  if([1,2].includes(code)) return "🌤";
  if(code===3) return "☁";
  if([45,48].includes(code)) return "🌫";
  if(code>=51 && code<=67) return "🌧";
  if(code>=71 && code<=86) return "🌨";
  if(code>=95) return "⛈";
  return "☀";
}
function cleanTeacher(v){
  return String(v || "")
    .replace(/^(?:гр\.?|група|підгрупа)\s*\d+\s*[.:;\-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fitSingleLine(el, maxPx, minPx, step = 0.5){
  if(!el) return;
  el.style.fontSize = `${maxPx}px`;
  const available = Math.floor(el.clientWidth || el.parentElement?.clientWidth || 0);
  if(available <= 0) return;

  let size = maxPx;
  let guard = 0;
  while(el.scrollWidth > available && size > minPx && guard++ < 64){
    size = Math.max(minPx, size - step);
    el.style.fontSize = `${size}px`;
  }
  el.dataset.fitPx = size.toFixed(1);
}

function subjectMeasureContext(el, px){
  const ctx = subjectMeasureContext._ctx ||
    (subjectMeasureContext._ctx = document.createElement("canvas").getContext("2d"));
  const cs = getComputedStyle(el);
  ctx.font = `${cs.fontStyle || "normal"} ${cs.fontWeight || "900"} ${px}px ${cs.fontFamily || "Roboto"}`;
  return ctx;
}

function bestTwoLineSubjectSplit(el, text, px){
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if(words.length < 2) return null;

  const ctx = subjectMeasureContext(el, px);
  let best = null;
  for(let i = 1; i < words.length; i++){
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const wa = ctx.measureText(a).width;
    const wb = ctx.measureText(b).width;
    const score = Math.max(wa, wb) + Math.abs(wa - wb) * 0.30;
    if(!best || score < best.score){
      best = {a, b, wa, wb, score};
    }
  }
  return best;
}

function fitSubjectText(el, maxPx = 28, minPx = 19, step = 0.5){
  if(!el) return;

  const text = String(el.dataset.subject || el.textContent || "")
    .replace(/\s+/g, " ")
    .trim();

  if(!text){
    el.textContent = "—";
    return;
  }

  const available = Math.max(1, Math.floor(el.clientWidth || el.parentElement?.clientWidth || 0));
  let size = maxPx;
  let split = null;

  // Short labels stay on one line. Multi-word subjects that become visually
  // crowded are intentionally balanced over exactly two lines, matching the
  // approved timetable-card reference.
  const words = text.split(/\s+/);
  const fullCtx = subjectMeasureContext(el, maxPx);
  const fullWidth = fullCtx.measureText(text).width;
  const forceTwo = words.length > 1 && (text.length >= 14 || fullWidth > available * 0.82);

  if(forceTwo){
    split = bestTwoLineSubjectSplit(el, text, maxPx);
  }

  el.classList.remove("subject-one-line", "subject-two-line");
  el.replaceChildren();

  if(split){
    el.classList.add("subject-two-line");
    const l1 = document.createElement("span");
    const l2 = document.createElement("span");
    l1.className = "subject-line";
    l2.className = "subject-line";
    l1.textContent = split.a;
    l2.textContent = split.b;
    el.append(l1, l2);

    let guard = 0;
    while(size > minPx && guard++ < 64){
      const ctx = subjectMeasureContext(el, size);
      const widest = Math.max(ctx.measureText(split.a).width, ctx.measureText(split.b).width);
      if(widest <= available - 2) break;
      size = Math.max(minPx, size - step);
    }
  }else{
    el.classList.add("subject-one-line");
    el.textContent = text;

    let guard = 0;
    while(size > minPx && guard++ < 64){
      const ctx = subjectMeasureContext(el, size);
      if(ctx.measureText(text).width <= available - 2) break;
      size = Math.max(minPx, size - step);
    }
  }

  el.style.fontSize = `${size}px`;
  el.dataset.fitPx = size.toFixed(1);
  el.dataset.lines = split ? "2" : "1";
}

function fitDynamicTypography(mode){
  const title = $("headerTitle");
  fitSingleLine(title, mode === "AIR_RAID" ? 40 : 47, 30, 0.5);

  document.querySelectorAll(".subject-text").forEach(el => {
    fitSubjectText(el, 28, 19, 0.5);
  });

  document.querySelectorAll(".teacher-text").forEach(el => {
    fitSingleLine(el, 18.5, 13.5, 0.5);
  });
}

function entryRowHtml(e){
  if(!e){
    return `<div class="entry-row empty-row"><div class="cell">—</div></div>`;
  }
  const group = e.subgroup ? `<span class="group">${esc(e.subgroup.replace(/\s+/g,""))}</span>` : "";
  const subject = esc(e.subject || "—");
  const room = esc(e.room || "—");
  const teacher = esc(cleanTeacher(e.teacher) || "—");

  return `<div class="entry-row">
    <div class="cell subject-cell">${group}<span class="subject-text" data-subject="${subject}">${subject}</span></div>
    <div class="cell room-cell">${room}</div>
    <div class="cell teacher-cell"><span class="teacher-text">${teacher}</span></div>
  </div>`;
}

function cardHtml(row, lesson, dutyClass="", dutyLabel="ЧЕРГОВИЙ КЛАС"){
  const entries = (row.entries || []).slice(0,2);
  const body = entries.length ? entries.map(entryRowHtml).join("") : entryRowHtml(null);
  const lessonText = lesson > 0 ? `${lesson} УРОК` : "—";
  const isSub = !!row.substitution;
  const isDuty = !!dutyClass && row.className === dutyClass;
  const subFlag = isSub ? `<div class="substitution-flag">ЗАМІНА</div>` : "";
  const dutyFlag = isDuty ? `<div class="duty-flag">★ ${esc(dutyLabel || "ЧЕРГОВИЙ КЛАС")}</div>` : "";
  const classes = ["class-card", isSub ? "has-substitution" : "", isDuty ? "is-duty" : ""].filter(Boolean).join(" ");

  return `<article class="${classes}" data-class="${esc(row.className)}"${isDuty ? ' aria-label="Черговий клас"' : ""}>
    <div class="class-side">
      ${dutyFlag}
      <div class="class-name">${esc(row.className)}</div>
      <div class="class-book" aria-hidden="true"><i></i><i></i></div>
      <div class="class-lesson">${esc(lessonText)}</div>
      ${subFlag}
    </div>
    <div class="card-table">
      <div class="table-head">
        <span>ПРЕДМЕТ</span>
        <span>КАБ.</span>
        <span>ВИКЛАДАЧ</span>
      </div>
      <div class="entry-list">${body}</div>
    </div>
  </article>`;
}

function showCards(rows, lesson, duty={}){
  const map = new Map((rows || []).map(r => [r.className, r]));
  const order = ["10-А","10-Б","10-В","10-Г","11-А","11-Б","11-В","11-Г"];
  const dutyClass = duty?.enabled && !duty?.paused ? String(duty.class || "") : "";
  const dutyLabel = String(duty?.label || "ЧЕРГОВИЙ КЛАС");
  left.innerHTML = order.slice(0,4)
    .map(n => cardHtml(map.get(n) || {className:n,entries:[]}, lesson, dutyClass, dutyLabel)).join("");
  right.innerHTML = order.slice(4)
    .map(n => cardHtml(map.get(n) || {className:n,entries:[]}, lesson, dutyClass, dutyLabel)).join("");
}

function playOnce(audio,eventId,storageKey,volume){
  if(!eventId) return;
  const prior = localStorage.getItem(storageKey) || "";
  if(prior === eventId) return;
  audio.volume = Math.max(0, Math.min(1, Number(volume) || 0));
  audio.currentTime = 0;
  audio.play()
    .then(() => localStorage.setItem(storageKey,eventId))
    .catch(() => {});
}

function updateWeather(w){
  $("weatherCity").textContent = (w.city || "Кропивницький").toUpperCase();
  $("weatherCondition").textContent = w.condition || "Погода";
  $("weatherTemp").textContent = w.available
    ? `${Number(w.temperature) >= 0 ? "+" : ""}${w.temperature}°`
    : "—°";
  $("weatherIcon").textContent = weatherIcon(w.code);
}

function normalizeMobilePublicUrl(value){
  let raw=String(value||"").trim();
  if(!raw) raw="http://192.168.2.193:8080/mobile/";
  try{
    const u=new URL(raw);
    if(!u.pathname || u.pathname==="/")u.pathname="/mobile/";
    if(!u.pathname.endsWith("/"))u.pathname+="/";
    u.search="";u.hash="";
    return u.toString();
  }catch(_){
    return "http://192.168.2.193:8080/mobile/";
  }
}
function updateTvMobileQrUrl(cfg={}){
  const url=normalizeMobilePublicUrl(cfg.mobile_public_url);
  const qr=$("tvMobileQr");
  const label=$("tvMobileUrl");
  if(qr && qr.dataset.url!==url){
    qr.dataset.url=url;
    qr.src=`/api/qr.svg?text=${encodeURIComponent(url)}`;
  }
  if(label){
    try{
      const u=new URL(url);
      label.textContent=`${u.host}${u.pathname}`;
    }catch(_){
      label.textContent="192.168.2.193:8080/mobile/";
    }
  }
}
function updateTvMobileQr(mode, phase){
  const card = $("tvMobileQrCard");
  if(!card) return;

  const visible =
    mode !== "AIR_RAID" &&
    mode !== "SILENCE" &&
    ["LESSON","BREAK","BEFORE_SCHOOL"].includes(String(phase || ""));

  card.classList.toggle("hidden", !visible);
}

function showMessage(title,subtitle){
  $("messagePage").classList.remove("hidden");
  $("messagePage").querySelector(".messageTitle").textContent = title;
  $("messagePage").querySelector(".messageSubtitle").textContent = subtitle || "";
}
function hideMessage(){
  $("messagePage").classList.add("hidden");
}

function render(s){
  currentTvMode=String(s?.mode||"NORMAL");
  const mode = s.mode;
  const sch = s.schedule || {};
  const infoActive = mode === "NORMAL" && sch.phase === "AFTER_SCHOOL" && Boolean(s.after_school_info);
  $("afterSchoolInfo")?.classList.toggle("hidden", !infoActive);
  window.afterSchoolSlideshow?.setActive(infoActive);
  currentTvPhase=String(sch.phase||"");
  musicEnforceSafety();
  if(currentTvPhase!==lastRenderedMusicPhase){
    lastRenderedMusicPhase=currentTvPhase;
    setTimeout(()=>refreshMusicPolicy(),0);
  }
  const lesson = Number(sch.lesson) || 0;

  stage.className =
    mode === "AIR_RAID" ? "theme-alarm" :
    mode === "SILENCE" ? "theme-silence" :
    "theme-normal";
  stage.classList.toggle("after-school-info", infoActive);
  if(infoActive || mode === "AIR_RAID" || mode === "SILENCE") hideSignageOverlay();

  $("silencePage").classList.toggle("hidden", mode !== "SILENCE");

  if(mode === "SILENCE"){
    hideMessage();
    $("announcement").classList.add("hidden");
    updateTvMobileQrUrl(s.config_public || {});
    updateTvMobileQr(mode, sch.phase);
    playOnce(silenceAudio, s.silence.event_id, "lyceumtv.lastSilenceEvent", s.silence.volume);
    return;
  } else {
    silenceAudio.pause();
  }

  $("headerTitle").textContent = mode === "AIR_RAID" ? "РОЗКЛАД В УКРИТТІ" : "РОЗКЛАД УРОКІВ";
  $("weekPill").textContent = sch.week?.label || "—";
  $("dayLabel").textContent = sch.day_label || "";
  $("dateLabel").textContent = s.date || "";
  $("clock").textContent = (s.clock || "").slice(0,5);
  $("alarmMessage").classList.toggle("hidden", mode !== "AIR_RAID");
  $("alarmGuide")?.classList.toggle("hidden", mode !== "AIR_RAID");

  showCards(sch.rows || [], lesson, s.duty || {});
  requestAnimationFrame(() => fitDynamicTypography(mode));
  if(document.fonts?.ready){
    document.fonts.ready.then(() => fitDynamicTypography(mode)).catch(() => {});
  }
  updateWeather(s.weather || {});
  updateTvMobileQrUrl(s.config_public || {});
  updateTvMobileQr(mode, sch.phase);

  if(mode === "AIR_RAID" && s.alarm.sound_enabled){
    playOnce(alarmAudio, s.alarm.event_id, "lyceumtv.lastAlarmEvent", s.alarm.volume);
  }
  if(mode !== "AIR_RAID") alarmAudio.pause();

  if(mode === "ALL_CLEAR"){
    showMessage("ВІДБІЙ ПОВІТРЯНОЇ ТРИВОГИ", `Повернення до розкладу через ${s.all_clear.seconds} с`);
  } else if(["HOLIDAY","NO_SCHEDULE"].includes(sch.phase)){
    const title =
      sch.phase === "HOLIDAY" ? "КАНІКУЛИ" :
      sch.phase === "AFTER_SCHOOL" ? "ПІСЛЯ УРОКІВ" :
      "РОЗКЛАД";
    showMessage(title, sch.message || "");
  } else {
    hideMessage();
  }
  const info = $("afterSchoolInfo");
  if(info){
    info.classList.toggle("hidden", !infoActive);
    if(infoActive){
      const title = String(s.config_public?.slideshow_title || "").trim();
      const el = $("slideshowTitle");
      if(el) el.textContent = title || "ЖИТТЯ ЛІЦЕЮ";
    }
  }

  const progress = $("timerProgress")?.querySelector("span");
  if(sch.phase === "LESSON"){
    $("lessonBadge").textContent = `${lesson} УРОК`;
    $("timerLabel").textContent = "ДО КІНЦЯ УРОКУ";
    $("timerValue").textContent = mmss(sch.seconds_to_lesson_end);
    if(progress){
      const remain=Math.max(0,Number(sch.seconds_to_lesson_end)||0);
      const done=Math.max(0,Math.min(100,(1-remain/Math.max(1,Number(sch.lesson_duration_seconds)||2700))*100));
      progress.style.width=`${done.toFixed(1)}%`;
    }
  } else if(sch.phase === "BREAK"){
    $("lessonBadge").textContent = "ПЕРЕРВА";
    $("timerLabel").textContent = `ДО ПОЧАТКУ ${lesson} УРОКУ`;
    $("timerValue").textContent = mmss(sch.seconds_to_next_lesson);
    if(progress)progress.style.width="0%";
  } else if(sch.phase === "BEFORE_SCHOOL"){
    $("lessonBadge").textContent = "ДО УРОКІВ";
    $("timerLabel").textContent = `ДО ПОЧАТКУ ${lesson} УРОКУ`;
    $("timerValue").textContent = mmss(sch.seconds_to_next_lesson);
    if(progress)progress.style.width="0%";
  } else {
    $("lessonBadge").textContent = lesson ? `${lesson} УРОК` : "РОЗКЛАД";
    $("timerLabel").textContent = "";
    $("timerValue").textContent = "--:--";
    if(progress)progress.style.width="0%";
  }

  const announcement = $("announcement");
  // After lessons, announcements are shown only in the information card.
  // Keep the animation running across frequent state polls.
  const tickerText = mode === "NORMAL" && sch.phase === "BREAK"
    ? String(s.announcement || "").trim() : "";
  if(tickerText){
    announcement.classList.remove("hidden");
    const speed = Math.max(50, Math.min(250, Number(s.config_public?.announcement_ticker_speed) || 115));
    if(announcement.dataset.tickerText !== tickerText){
      announcement.dataset.tickerText = tickerText;
      const track = document.createElement("span");
      track.className = "announcement-ticker-track";
      track.textContent = "ОГОЛОШЕННЯ  •  " + tickerText;
      announcement.replaceChildren(track);
    }
    const track = announcement.querySelector(".announcement-ticker-track");
    if(track){
      const distance = track.scrollWidth + announcement.clientWidth;
      const seconds = distance / speed;
      announcement.style.setProperty("--ticker-start", `${announcement.clientWidth}px`);
      announcement.style.setProperty("--ticker-seconds", `${seconds.toFixed(2)}s`);
    }
  }else{
    announcement.classList.add("hidden");
    delete announcement.dataset.tickerText;
    announcement.replaceChildren();
  }
}

async function tick(){
  try{
    const r = await fetch("/api/state", {cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const state=await r.json();
    render(state);
    localStorage.setItem("lyceumtv.lastGoodState",JSON.stringify(state));
    $("offlineBadge")?.classList.add("hidden");
  }catch(_){
    try{
      const cached=JSON.parse(localStorage.getItem("lyceumtv.lastGoodState")||"null");
      if(cached)render(cached);
    }catch(__){}
    $("offlineBadge")?.classList.remove("hidden");
  }
  setTimeout(tick,1000);
}

function hideSignageOverlay(){
  $("signageOverlay")?.classList.add("hidden");
  const box=$("signageOverlayMedia");if(box)box.innerHTML="";
}
async function smartSignageTick(){
  try{
    const r=await fetch(`/api/signage/current?screen=${encodeURIComponent(screenId)}`,{cache:"no-store"});
    if(!r.ok)throw new Error();
    const d=await r.json();
    if(["AIR_RAID","SILENCE"].includes(currentTvMode)||!$("afterSchoolInfo")?.classList.contains("hidden")||!d||d.mode==="schedule"){hideSignageOverlay()}
    else{
      const overlay=$("signageOverlay"),mediaBox=$("signageOverlayMedia");
      overlay?.classList.remove("hidden");mediaBox.innerHTML="";
      if(d.mode==="media"&&d.media){
        const m=d.media;
        $("signageOverlayTitle").textContent=m.title||d.rule?.name||"LyceumTV";
        $("signageOverlayMessage").textContent=m.message||"";
        if(m.url){
          mediaBox.innerHTML=m.media_kind==="video"
            ?`<video src="${String(m.url).replace(/"/g,"&quot;")}" autoplay muted loop playsinline></video>`
            :`<img src="${String(m.url).replace(/"/g,"&quot;")}" alt="">`;
        }
      }else if(d.mode==="welcome"){
        $("signageOverlayTitle").textContent=d.rule?.name||"ЛАСКАВО ПРОСИМО";
        $("signageOverlayMessage").textContent="Lyceum Smart Campus";
      }else if(d.mode==="events"){
        $("signageOverlayTitle").textContent="ПОДІЇ ЛІЦЕЮ";
        try{
          const cr=await fetch("/api/campus",{cache:"no-store"}),campus=await cr.json();
          const events=campus.events||[];
          $("signageOverlayMessage").textContent=events.length
            ?events.map(x=>`${x.start_time||""} ${x.title||""}`).join("   •   ")
            :"Сьогодні запланованих подій немає";
        }catch(_){$("signageOverlayMessage").textContent="Актуальні події ліцею"}
      }
    }
  }catch(_){}
  setTimeout(smartSignageTick,10000);
}
function clearMusicFade(){
  if(musicFadeTimer){clearInterval(musicFadeTimer);musicFadeTimer=null}
}
function musicFadeTo(target, seconds=1, done=null){
  clearMusicFade();
  target=Math.max(0,Math.min(1,Number(target)||0));
  const from=Math.max(0,Math.min(1,Number(musicAudio.volume)||0));
  const duration=Math.max(0,Number(seconds)||0);
  if(duration<=0||Math.abs(from-target)<0.005){
    musicAudio.volume=target;
    if(done)done();
    return;
  }
  const started=Date.now();
  musicFadeTimer=setInterval(()=>{
    const p=Math.min(1,(Date.now()-started)/(duration*1000));
    musicAudio.volume=from+(target-from)*p;
    if(p>=1){
      clearMusicFade();
      if(done)done();
    }
  },80);
}
function musicTargetVolume(policy=musicPolicy){
  if(!policy)return 0;
  let v=Math.max(0,Math.min(1,Number(policy.volume)||0));
  if(policy.phase==="BREAK"){
    const fadeBefore=Math.max(0,Number(policy.break_fade_before_end_seconds)||0);
    const remain=Math.max(0,Number(policy.seconds_to_next_lesson)||0);
    if(fadeBefore>0&&remain<=fadeBefore)v*=Math.max(0,remain/fadeBefore);
  }
  return v;
}
function isMusicTestActive(){
  return Date.now()<musicTestActiveUntil;
}
function musicTestRemaining(){
  return isMusicTestActive()?Math.max(0,Math.ceil((musicTestActiveUntil-Date.now())/1000)):0;
}
function musicStatus(){
  return {
    state:musicRuntimeState,
    track_id:musicTrack?.id||"",
    title:musicTrack?.title||"",
    artist:musicTrack?.artist||"",
    playlist:isMusicTestActive()?"test":(musicPolicy?.playlist||""),
    volume:Number(musicAudio.volume||0).toFixed(2),
    test_remaining:musicTestRemaining()
  };
}
function musicPauseForPriority(){
  clearMusicFade();
  musicAudio.pause();
  musicRuntimeState="priority-paused";
}
function clearMusicTestTimers(){
  if(musicTestStopTimer){clearTimeout(musicTestStopTimer);musicTestStopTimer=null}
  if(musicTestFadeTimer){clearTimeout(musicTestFadeTimer);musicTestFadeTimer=null}
}
function finishMusicTest(reason="test-finished", refresh=true){
  clearMusicTestTimers();
  musicTestActiveUntil=0;
  const stopNow=()=>{
    musicAudio.pause();
    musicAudio.volume=0;
    musicRuntimeState=reason;
    if(refresh)setTimeout(()=>refreshMusicPolicy(),250);
  };
  if(!musicAudio.paused)musicFadeTo(0,0.8,stopNow);else stopNow();
}
function musicEnforceSafety(){
  const phaseAllowsMusic=["BREAK","AFTER_SCHOOL"].includes(currentTvPhase);
  if(currentTvMode!=="NORMAL"){
    if(!systemEventAudio.paused){
      systemEventAudio.pause();
      try{systemEventAudio.currentTime=0}catch(_){}
    }
    if(isMusicTestActive())finishMusicTest(`test-blocked-${currentTvMode}`,false);
    musicPriorityBusy=true;
    musicPauseForPriority();
    return;
  }
  if(systemEventAudio.paused)musicPriorityBusy=false;

  // Safe Music Test may run during a lesson, but never during a non-NORMAL
  // safety mode. The 15-second timer is the hard upper bound.
  if(isMusicTestActive())return;

  if(!phaseAllowsMusic){
    clearMusicFade();
    musicAudio.pause();
    musicRuntimeState="stopped";
  }
  if(currentTvPhase==="AFTER_SCHOOL"&&musicPolicy?.after_school_until){
    const now=new Date(),hhmm=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    if(hhmm>=musicPolicy.after_school_until){
      clearMusicFade();musicAudio.pause();musicAudio.volume=0;musicRuntimeState="stopped";
    }
  }
}
async function startSafeMusicTest(payload={}){
  if(currentTvMode!=="NORMAL"){
    musicRuntimeState=`test-blocked-${currentTvMode}`;
    return false;
  }
  if(musicPriorityBusy || !systemEventAudio.paused){
    musicRuntimeState="test-blocked-system-audio";
    return false;
  }
  const track={
    id:String(payload.track_id||"test"),
    title:String(payload.title||"Тест музики"),
    artist:String(payload.artist||""),
    url:String(payload.url||""),
    playlist:"test"
  };
  if(!track.url){
    musicRuntimeState="test-no-track";
    return false;
  }

  clearMusicTestTimers();
  clearMusicFade();
  musicAudio.pause();
  musicTrack=track;
  musicAudio.src=track.url;
  musicAudio.currentTime=0;
  musicAudio.load();

  const duration=Math.max(1,Math.min(15,Number(payload.duration)||15));
  const volume=Math.max(0,Math.min(1,Number(payload.volume??musicPolicy?.volume??0.35)));
  musicTestActiveUntil=Date.now()+duration*1000;
  musicAudio.volume=0;

  try{
    await musicAudio.play();
    musicRuntimeState="test-playing";
    musicFadeTo(volume,Math.min(1.2,Math.max(0.3,duration/5)));
  }catch(_){
    musicTestActiveUntil=0;
    musicRuntimeState="test-autoplay-blocked";
    return false;
  }

  const fadeLead=Math.min(1.2,Math.max(0.5,duration/5));
  musicTestFadeTimer=setTimeout(()=>{
    if(isMusicTestActive())musicFadeTo(0,fadeLead);
  },Math.max(0,(duration-fadeLead)*1000));
  musicTestStopTimer=setTimeout(()=>{
    finishMusicTest("test-finished",true);
  },duration*1000+80);
  return true;
}

function chooseMusicTrack(forceNext=false){
  const tracks=Array.isArray(musicPolicy?.tracks)?musicPolicy.tracks:[];
  if(!tracks.length)return null;
  const currentIndex=tracks.findIndex(x=>x.id===musicTrack?.id);
  if(!forceNext&&currentIndex>=0)return tracks[currentIndex];
  if(musicPolicy?.shuffle){
    if(tracks.length===1)return tracks[0];
    let pool=tracks.filter(x=>x.id!==musicTrack?.id);
    return pool[Math.floor(Math.random()*pool.length)]||tracks[0];
  }
  return tracks[currentIndex>=0?(currentIndex+1)%tracks.length:0];
}
async function startMusicTrack(track, restart=false){
  if(!track||!track.url||musicPriorityBusy||currentTvMode!=="NORMAL")return;
  const changed=musicTrack?.id!==track.id || musicAudio.src!==new URL(track.url,location.origin).href;
  if(changed){
    musicTrack=track;
    musicAudio.src=track.url;
    musicAudio.currentTime=0;
    musicAudio.load();
  }else if(restart){
    try{musicAudio.currentTime=0}catch(_){}
  }
  const target=musicTargetVolume();
  const fade=Math.max(0,Number(musicPolicy?.fade_seconds)||0);
  if(musicAudio.paused){
    musicAudio.volume=fade>0?0:target;
    try{
      await musicAudio.play();
      musicRuntimeState="playing";
      if(fade>0)musicFadeTo(target,fade);
    }catch(_){
      musicRuntimeState="autoplay-blocked";
    }
  }else{
    musicRuntimeState="playing";
    musicAudio.volume=target;
  }
}
function stopMusic(fade=true){
  if(musicAudio.paused){
    musicRuntimeState=musicManualState==="pause"?"paused":"stopped";
    return;
  }
  const seconds=fade?Math.max(0,Number(musicPolicy?.fade_seconds)||0):0;
  const finish=()=>{musicAudio.pause();musicAudio.volume=0;musicRuntimeState=musicManualState==="pause"?"paused":"stopped"};
  if(seconds>0)musicFadeTo(0,seconds,finish);else finish();
}
async function musicPlayNext(){
  const next=chooseMusicTrack(true);
  if(next)await startMusicTrack(next,true);
}
async function applyMusicPolicy(policy){
  musicPolicy=policy||{};
  if(isMusicTestActive())return;
  const key=`${musicPolicy.allowed?"on":"off"}:${musicPolicy.phase||""}:${musicPolicy.playlist||""}:${musicPolicy.reason||""}`;
  if(key!==musicPolicyKey){
    musicPolicyKey=key;
    musicManualState="auto";
  }
  if(!musicPolicy.allowed||musicPriorityBusy||currentTvMode!=="NORMAL"){
    stopMusic(true);
    return;
  }
  if(musicManualState==="pause"){
    musicAudio.pause();musicRuntimeState="paused";return;
  }
  if(musicManualState==="stop"){
    stopMusic(true);return;
  }
  const track=chooseMusicTrack(false)||chooseMusicTrack(true);
  if(!track){stopMusic(true);return}
  if(musicTrack?.id!==track.id || musicAudio.paused)await startMusicTrack(track,false);
  else musicFadeTo(musicTargetVolume(),1);
}
async function refreshMusicPolicy(){
  try{
    const r=await fetch("/api/music/state",{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    await applyMusicPolicy(await r.json());
  }catch(_){
    if(!isMusicTestActive()){
      musicRuntimeState="scheduler-offline";
      clearMusicFade();
      musicAudio.pause();
      musicAudio.volume=0;
    }
  }
}
async function musicSchedulerTick(){
  await refreshMusicPolicy();
  setTimeout(musicSchedulerTick,5000);
}
async function handleMusicCommand(command,payload={}){
  if(command==="music-test"){
    await startSafeMusicTest(payload);
    return;
  }
  if(isMusicTestActive())finishMusicTest("test-cancelled",false);
  if(command==="music-play"){
    musicManualState="auto";
    if(musicPolicy?.allowed)await startMusicTrack(chooseMusicTrack(false)||chooseMusicTrack(true),false);
  }else if(command==="music-pause"){
    musicManualState="pause";clearMusicFade();musicAudio.pause();musicRuntimeState="paused";
  }else if(command==="music-stop"){
    musicManualState="stop";stopMusic(true);
  }else if(command==="music-next"){
    musicManualState="auto";await musicPlayNext();
  }
}
musicAudio.addEventListener("ended",()=>{
  if(isMusicTestActive()){finishMusicTest("test-finished",true);return}
  if(musicPolicy?.allowed&&musicManualState==="auto"&&!musicPriorityBusy)musicPlayNext()
});
musicAudio.addEventListener("error",()=>{musicRuntimeState="track-error";setTimeout(()=>{if(musicPolicy?.allowed)musicPlayNext()},1200)});

async function smartAudioTick(){
  try{
    if(["AIR_RAID","SILENCE"].includes(currentTvMode)){setTimeout(smartAudioTick,5000);return}
    const r=await fetch("/api/audio/current",{cache:"no-store"});
    if(r.ok){
      const d=await r.json(),e=d.event,key=d.event_key;
      if(e&&key&&localStorage.getItem("lyceumtv.lastAudioEvent")!==key){
        if(isMusicTestActive())finishMusicTest("test-interrupted-system-audio",false);
        musicPriorityBusy=true;
        musicPauseForPriority();
        systemEventAudio.src=e.url;
        systemEventAudio.volume=Math.max(0,Math.min(1,Number(e.volume??0.8)));
        const resume=()=>{
          musicPriorityBusy=false;
          setTimeout(()=>refreshMusicPolicy(),250);
        };
        systemEventAudio.onended=resume;
        systemEventAudio.onerror=resume;
        try{
          await systemEventAudio.play();
          localStorage.setItem("lyceumtv.lastAudioEvent",key);
        }catch(_){resume()}
      }
    }
  }catch(_){}
  setTimeout(smartAudioTick,5000);
}

const screenParams = new URLSearchParams(location.search);
const screenId = (screenParams.get("screen") || localStorage.getItem("lyceumtv.screenId") || "main-hall")
  .replace(/[^A-Za-z0-9._-]/g,"-").slice(0,48) || "main-hall";
const screenProfile = (screenParams.get("profile") || "schedule").slice(0,24);
localStorage.setItem("lyceumtv.screenId", screenId);

async function smartCampusHeartbeat(){
  try{
    const r = await fetch("/api/screen/heartbeat",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      cache:"no-store",
      body:JSON.stringify({
        id:screenId,
        name:screenId==="main-hall"?"Головний екран":screenId,
        profile:screenProfile,
        version:"3.4.1",
        music_status:musicStatus()
      })
    });
    if(!r.ok)return;
    const d=await r.json(), screen=d.screen||{};
    if(screen.command && screen.command_id){
      await fetch("/api/screen/ack",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:screenId,command_id:screen.command_id})
      }).catch(()=>{});
      if(["reload","restart","wake"].includes(screen.command)){
        location.reload();
        return;
      }
      if(["music-play","music-pause","music-next","music-stop","music-test"].includes(screen.command)){
        await handleMusicCommand(screen.command,screen.command_payload||{});
      }
    }
  }catch(_){}
  setTimeout(smartCampusHeartbeat,5000);
}

tick();
smartCampusHeartbeat();
smartSignageTick();
smartAudioTick();
musicSchedulerTick();
})();
