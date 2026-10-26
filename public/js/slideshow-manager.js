(() => {
"use strict";

const input = document.getElementById("slideshowFiles");
const upload = document.getElementById("uploadSlideshow");
const status = document.getElementById("slideshowUploadStatus");
const list = document.getElementById("slideshowPhotoList");
if(!input || !upload || !status || !list) return;

async function api(path, body){
  const key = document.getElementById("roleKey").value.trim();
  const response = await fetch(path, {
    method: "POST", cache: "no-store",
    headers: {"Content-Type":"application/json", "X-Role-Key":key},
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if(!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

const photos = new Map();
window.renderSlideshowPhotos = media => {
  photos.clear();
  list.replaceChildren();
  for(const photo of media){
    if(!photo.after_school_slideshow || photo.media_kind !== "image") continue;
    photos.set(photo.id, photo);
    const card = document.createElement("article");
    card.className = "slideshow-photo";
    const image = document.createElement("img");
    image.src = photo.url;
    image.alt = photo.title || "Фото слайд-шоу";
    image.loading = "lazy";
    const title = document.createElement("b");
    title.textContent = photo.title || "Фото ліцею";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.textContent = "ПРИБРАТИ ЗІ СЛАЙД-ШОУ";
    button.dataset.slideshowRemove = photo.id;
    card.append(image, title, button);
    list.append(card);
  }
  if(!photos.size){
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Додайте фото — слайд-шоу автоматично з’явиться після уроків. Без фото фотогалерея не показується.";
    list.append(empty);
  }
};

function readFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
    reader.readAsDataURL(file);
  });
}

upload.addEventListener("click", async () => {
  const files = [...input.files];
  if(!files.length){ status.textContent = "Спочатку оберіть фото."; return; }
  upload.disabled = true;
  input.disabled = true;
  let saved = 0;
  const errors = [];
  try{
    for(const [index, file] of files.entries()){
      status.textContent = `Завантаження фото ${index + 1} з ${files.length}…`;
      try{
        if(!/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error("Потрібне фото JPG, PNG або WEBP");
        if(file.size > 15 * 1024 * 1024) throw new Error("Фото більше за 15 МБ");
        const data = await readFile(file);
        const uploaded = await api("/api/ops/media/upload", {file_name:file.name, data_base64:data});
        await api("/api/ops/item", {kind:"media", item:{
          title:file.name.replace(/\.[^.]+$/, ""), url:uploaded.url,
          media_kind:"image", active:true, duration:3, after_school_slideshow:true,
        }});
        saved++;
      }catch(error){ errors.push(`${file.name}: ${error.message}`); }
    }
    input.value = "";
    status.textContent = `Додано фото: ${saved} з ${files.length}. ` +
      (errors.length ? errors.join("; ") : "Показ після уроків — по 3 секунди.");
    document.getElementById("refresh").click();
  }finally{
    upload.disabled = false;
    input.disabled = false;
  }
});

list.addEventListener("click", async event => {
  const button = event.target.closest("[data-slideshow-remove]");
  if(!button) return;
  const photo = photos.get(button.dataset.slideshowRemove);
  if(!photo) return;
  button.disabled = true;
  try{
    await api("/api/ops/item", {kind:"media", item:{...photo, after_school_slideshow:false}});
    status.textContent = "Фото прибрано зі слайд-шоу. Файл залишається в медіатеці.";
    document.getElementById("refresh").click();
  }catch(error){
    status.textContent = error.message;
    button.disabled = false;
  }
});
})();
