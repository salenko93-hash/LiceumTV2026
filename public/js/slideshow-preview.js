(() => {
"use strict";

const slideshow = window.afterSchoolSlideshow;
const files = document.getElementById("previewFiles");
const library = document.getElementById("previewLibrary");
const status = document.getElementById("previewStatus");
const localOnly = location.protocol === "file:" || new URLSearchParams(location.search).get("local") === "1";
let objectUrls = [];

function fit(){
  const width = window.visualViewport?.width || innerWidth;
  const height = window.visualViewport?.height || innerHeight;
  const scale = Math.min(width / 1920, height / 1080);
  document.getElementById("stage").style.transform =
    `translate3d(${(width - 1920 * scale) / 2}px,${(height - 1080 * scale) / 2}px,0) scale(${scale})`;
}

function releasePhotos(){
  for(const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
}


files.addEventListener("change", () => {
  const selected = [...files.files];
  const accepted = selected.filter(file =>
    /\.(jpe?g|png|webp)$/i.test(file.name) && file.size > 0 && file.size <= 15 * 1024 * 1024);
  if(!accepted.length){
    status.textContent = "Оберіть фото JPG, PNG або WEBP, до 15 МБ кожне.";
    return;
  }
  const urls = accepted.map(file => URL.createObjectURL(file));
  slideshow.setPhotos(accepted.map((file, i) => ({
    id: String(i), url:urls[i],
  })));
  releasePhotos();
  objectUrls = urls;
  files.value = "";
  status.textContent = `Локальний перегляд: ${accepted.length} фото, по 3 секунди. Фото не завантажуються на TV.` +
    (accepted.length < selected.length ? ` Пропущено файлів: ${selected.length - accepted.length}.` : "");
});

library.addEventListener("click", () => {
  slideshow.setPhotos(null);
  releasePhotos();
  status.textContent = "Фото з медіатеки. Якщо колекція порожня, оберіть фото з комп’ютера. Перегляд працює в будь-який день і час.";
});

document.getElementById("previewFullscreen").addEventListener("click", async () => {
  try{
    if(document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }catch(_){ status.textContent = "Браузер не дозволив повноекранний режим. Можна продовжити у звичайному вікні."; }
});
document.addEventListener("fullscreenchange", () => {
  document.getElementById("previewFullscreen").textContent = document.fullscreenElement ? "ВИЙТИ З ПОВНОГО ЕКРАНА" : "НА ВЕСЬ ЕКРАН";
});
window.addEventListener("resize", fit);
window.visualViewport?.addEventListener("resize", fit);
window.addEventListener("pagehide", () => {slideshow.setActive(false);releasePhotos();});
async function loadSlideshowTitle(){
  try{
    const response = await fetch("/api/slideshow", {cache:"no-store"});
    if(!response.ok) return;
    const payload = await response.json();
    const el = document.getElementById("slideshowTitle");
    if(el) el.textContent = String(payload.title || "").trim() || "ЖИТТЯ ЛІЦЕЮ";
  }catch(_){}
}
loadSlideshowTitle();
if(localOnly){
  slideshow.setPhotos([]);
  library.disabled = true;
  status.textContent = "Оберіть фото з комп’ютера. Цей перегляд працює без Raspberry Pi та без Інтернету.";
}
fit();
slideshow.setActive(true);
})();
