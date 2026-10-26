(() => {
"use strict";

const root = document.getElementById("afterSchoolSlideshow");
const panel = document.getElementById("afterSchoolInfo");
if(!root || !panel) return;
const layers = [...root.querySelectorAll(".after-school-slide")];
const INTERVAL_MS = 3000;
let active = false, photos = [], index = -1, layer = 0;
let slideTimer = null, refreshTimer = null, generation = 0, pending = false;
let currentUrl = "";
let localPhotos = null;
const failed = new Set();

function setSlideshowTitle(value){
  const el = document.getElementById("slideshowTitle");
  if(!el) return;
  const title = String(value || "").trim();
  el.textContent = title || "ЖИТТЯ ЛІЦЕЮ";
}

function showGallery(visible){
  root.classList.toggle("hidden", !visible);
  panel.classList.toggle("has-slideshow", visible);
}

function preload(photo){
  const image = new Image();
  image.src = photo.url;
}

function scheduleNext(){
  clearTimeout(slideTimer);
  slideTimer = setTimeout(advance, INTERVAL_MS);
}

function advance(){
  if(!active || pending || !photos.length) return;
  let next = index;
  for(let attempt = 0; attempt < photos.length; attempt++){
    next = (next + 1) % photos.length;
    if(!failed.has(photos[next].url)) break;
  }
  const photo = photos[next];
  if(failed.has(photo.url)){
    showGallery(false);
    return;
  }
  if(photo.url === currentUrl && photos.length === 1) return;
  pending = true;
  const token = generation;
  const target = layers[1 - layer];
  const image = target.querySelector("img");
  function finish(ok){
    if(token !== generation || !active) return;
    pending = false;
    if(!ok){
      failed.add(photo.url);
      advance();
      return;
    }
    index = next;
    currentUrl = photo.url;
    target.querySelector(".slide-backdrop").style.backgroundImage = `url(${JSON.stringify(photo.url)})`;
    image.alt = "Фото слайд-шоу";
    layers[layer].classList.remove("is-active");
    target.classList.add("is-active");
    layer = 1 - layer;
    showGallery(true);
    scheduleNext();
    const following = photos[(index + 1) % photos.length];
    if(following.url !== currentUrl) preload(following);
  }
  image.onload = () => finish(true);
  image.onerror = () => finish(false);
  image.src = photo.url;
}

async function refresh(){
  const token = generation;
  try{
    let items = localPhotos;
    if(items === null){
      const response = await fetch("/api/slideshow", {cache:"no-store"});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      setSlideshowTitle(payload.title);
      items = payload.items;
    }
    if(!active || token !== generation) return;
    const next = (Array.isArray(items) ? items : []).filter(photo =>
      photo && typeof photo.url === "string" &&
      (photo.url.startsWith("/media/") || /^https:\/\//i.test(photo.url) ||
        (localPhotos !== null && photo.url.startsWith("blob:"))));
    const changed = JSON.stringify(next) !== JSON.stringify(photos);
    if(changed){
      generation++;
      pending = false;
      clearTimeout(slideTimer);
    }
    photos = next;
    failed.clear();
    if(!photos.length){
      currentUrl = "";
      index = -1;
      showGallery(false);
    }else if(changed || !currentUrl){
      index = photos.findIndex(photo => photo.url === currentUrl);
      if(index < 0){
        currentUrl = "";
        advance();
      }
      else{
            scheduleNext();
      }
    }
  }catch(_){
    // Keep already loaded photos during a temporary network failure.
  }
}

window.afterSchoolSlideshow = {
  setPhotos(items){
    localPhotos = Array.isArray(items) ? items.slice() : null;
    generation++;
    pending = false;
    clearTimeout(slideTimer);
    photos = [];
    index = -1;
    currentUrl = "";
    failed.clear();
    showGallery(false);
    if(active) refresh();
  },
  setActive(value){
    if(active === value) return;
    active = value;
    generation++;
    pending = false;
    clearTimeout(slideTimer);
    clearInterval(refreshTimer);
    if(!active){
      showGallery(false);
      return;
    }
    if(currentUrl){showGallery(true);scheduleNext();}
    refresh();
    refreshTimer = setInterval(refresh, 30000);
  },
};
})();
