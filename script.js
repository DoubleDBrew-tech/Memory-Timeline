import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyD2ZJqSiJr0uMb52RhdeClKkBNoncT1VdM",
  authDomain: "memory-timeline-f5e32.firebaseapp.com",
  projectId: "memory-timeline-f5e32",
  storageBucket: "memory-timeline-f5e32.firebasestorage.app",
  messagingSenderId: "596383895352",
  appId: "1:596383895352:web:9de8a283e3dc58ee727bcd"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const $ = id => document.getElementById(id);
const state = {
  memories: [], letters: [], capsules: [], bucketList: [], places: [], countdowns: []
};

const collections = {
  memories: "memories",
  letters: "letters",
  capsules: "capsules",
  bucketList: "bucketList",
  places: "places",
  countdowns: "countdowns"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function safeUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function setSyncStatus(status, text) {
  const dot = $("syncIndicator"), label = $("syncStatusText");
  if (!dot || !label) return;
  dot.className = `sync-dot ${status}`;
  label.textContent = text;
}

function showModal(id) {
  const el = $(id);
  if (el && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(el).show();
}

function hideModal(id) {
  const el = $(id);
  if (el && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(el).hide();
}

function resetForm(formId) {
  $(formId)?.reset();
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

async function uploadMedia(file, folder, onProgress) {
  if (!file) return null;

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) throw new Error("Only photos and videos can be uploaded.");

  const max = isVideo ? 500 * 1024 * 1024 : 25 * 1024 * 1024;
  if (file.size > max) {
    throw new Error(isVideo
      ? "Video is too large. Maximum supported size is 500 MB."
      : "Photo is too large. Maximum supported size is 25 MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file, { contentType: file.type });

  return await new Promise((resolve, reject) => {
    task.on("state_changed",
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        try {
          resolve({
            url: await getDownloadURL(task.snapshot.ref),
            path,
            type: file.type,
            name: file.name,
            size: file.size
          });
        } catch (e) { reject(e); }
      }
    );
  });
}

async function removeStorageFile(path) {
  if (!path) return;
  try { await deleteObject(ref(storage, path)); } catch (_) {}
}

async function saveDocument(collectionName, id, data) {
  if (id) {
    await updateDoc(doc(db, collectionName, id), { ...data, updatedAt: serverTimestamp() });
    return id;
  }
  const created = await addDoc(collection(db, collectionName), { ...data, createdAt: serverTimestamp() });
  return created.id;
}

async function removeDocument(collectionName, id, mediaPaths = []) {
  for (const path of mediaPaths.filter(Boolean)) await removeStorageFile(path);
  await deleteDoc(doc(db, collectionName, id));
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
}

function editMemory(item) {
  $("memoryId").value = item.id;
  $("memTitle").value = item.title || "";
  $("memDate").value = item.date || todayString();
  $("memAudio").value = item.audio || "";
  $("memCaption").value = item.caption || "";
  $("memNote").value = item.note || "";
  $("memoryModalHeading").textContent = "Edit Memory";
  showModal("memoryModal");
}

async function deleteMemory(item) {
  if (!confirm(`Delete "${item.title || "this memory"}"?`)) return;
  await removeDocument("memories", item.id, [item.imagePath, item.videoPath]);
}

function renderMemories() {
  const container = $("timelineContainer");
  container.innerHTML = "";
  if (!state.memories.length) {
    container.innerHTML = `<div class="text-center py-5 text-muted">No memories yet.</div>`;
    return;
  }

  state.memories.forEach((item, index) => {
    const side = index % 2 === 0 ? "left" : "right";
    const media = item.image
      ? `<img src="${escapeHtml(safeUrl(item.image))}" class="card-img-top" style="height:180px;object-fit:cover" alt="">`
      : item.video
        ? `<video src="${escapeHtml(safeUrl(item.video))}" class="card-img-top" style="height:180px;object-fit:cover" controls></video>`
        : "";

    const div = document.createElement("div");
    div.className = `timeline-item ${side}`;
    div.innerHTML = `
      <div class="timeline-node"></div>
      <div class="card card-memory shadow-sm rounded-4 overflow-hidden">
        ${media}
        <div class="card-body">
          <small class="text-primary fw-bold">${escapeHtml(formatDate(item.date))}</small>
          <h5 class="fw-bold mt-1">${escapeHtml(item.title)}</h5>
          <p class="text-muted mb-2">${escapeHtml(item.note)}</p>
          <div class="action-row">
            <button class="btn btn-sm btn-outline-primary edit-memory"><i class="bi bi-pencil"></i> Edit</button>
            <button class="btn btn-sm btn-outline-danger delete-memory"><i class="bi bi-trash"></i> Delete</button>
          </div>
        </div>
      </div>`;
    div.querySelector(".edit-memory").onclick = () => editMemory(item);
    div.querySelector(".delete-memory").onclick = () => deleteMemory(item);
    container.appendChild(div);
  });
}

function editLetter(item) {
  $("letterId").value = item.id;
  $("letterTitle").value = item.title || "";
  $("letterContent").value = item.content || "";
  showModal("letterModal");
}

function renderLetters() {
  const c = $("lettersContainer");
  c.innerHTML = state.letters.length ? "" : `<div class="col-12 text-center text-muted py-5">No letters yet.</div>`;
  state.letters.forEach(item => {
    const col = document.createElement("div");
    col.className = "col-md-6";
    col.innerHTML = `
      <div class="card border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="card-body">
          <span class="badge bg-danger-subtle text-danger mb-2">Letter</span>
          <h5 class="fw-bold">${escapeHtml(item.title)}</h5>
          <p style="white-space:pre-line">${escapeHtml(item.content)}</p>
          <div class="action-row">
            <button class="btn btn-sm btn-outline-danger edit-letter"><i class="bi bi-pencil"></i> Edit</button>
            <button class="btn btn-sm btn-outline-secondary delete-letter"><i class="bi bi-trash"></i> Delete</button>
          </div>
        </div>
      </div>`;
    col.querySelector(".edit-letter").onclick = () => editLetter(item);
    col.querySelector(".delete-letter").onclick = async () => {
      if (confirm("Delete this letter?")) await deleteDoc(doc(db, "letters", item.id));
    };
    c.appendChild(col);
  });
}

function renderCapsules() {
  const c = $("capsuleContainer");
  c.innerHTML = state.capsules.length ? "" : `<div class="col-12 text-center text-muted py-5">No capsules yet.</div>`;
  const now = new Date(); now.setHours(0,0,0,0);

  state.capsules.forEach(item => {
    const unlock = new Date(`${item.unlockDate}T00:00:00`);
    const unlocked = now >= unlock;
    const col = document.createElement("div");
    col.className = "col-md-6 col-lg-4";
    col.innerHTML = `
      <div class="card capsule-card ${unlocked ? "unlocked" : "locked"} rounded-4 shadow-sm h-100 p-3">
        <div class="card-body d-flex flex-column">
          <span class="badge ${unlocked ? "bg-success" : "bg-danger"} align-self-start mb-2">${unlocked ? "Unlocked" : "Locked"}</span>
          <h5 class="fw-bold">${escapeHtml(item.title)}</h5>
          <small class="text-muted mb-3">${unlocked ? "Opened" : "Unlocks"}: ${escapeHtml(formatDate(item.unlockDate))}</small>
          ${unlocked ? `<p style="white-space:pre-line" class="flex-grow-1">${escapeHtml(item.content)}</p>` : `<div class="flex-grow-1 text-center py-3"><i class="bi bi-lock-fill display-5 text-secondary"></i></div>`}
          <div class="action-row">
            <button class="btn btn-sm btn-outline-danger edit-capsule"><i class="bi bi-pencil"></i> Edit</button>
            <button class="btn btn-sm btn-outline-secondary delete-capsule"><i class="bi bi-trash"></i> Delete</button>
          </div>
        </div>
      </div>`;
    col.querySelector(".edit-capsule").onclick = () => {
      $("capsuleId").value = item.id; $("capTitle").value = item.title || "";
      $("capUnlockDate").value = item.unlockDate || ""; $("capContent").value = item.content || "";
      showModal("capsuleModal");
    };
    col.querySelector(".delete-capsule").onclick = async () => {
      if (confirm("Delete this capsule?")) await deleteDoc(doc(db, "capsules", item.id));
    };
    c.appendChild(col);
  });
}

function renderBucket() {
  const c = $("bucketListContainer");
  c.innerHTML = state.bucketList.length ? "" : `<div class="col-12 text-center text-muted py-5">No bucket goals yet.</div>`;
  const total = state.bucketList.length, completed = state.bucketList.filter(x => x.completed).length;
  const pct = total ? Math.round(completed / total * 100) : 0;
  $("bucketProgress").innerHTML = `
    <div class="d-flex justify-content-between mb-1"><strong>Completion</strong><span>${completed}/${total} (${pct}%)</span></div>
    <div class="progress"><div class="progress-bar bg-success" style="width:${pct}%"></div></div>`;

  state.bucketList.forEach(item => {
    const photo = safeUrl(item.photo);
    const col = document.createElement("div");
    col.className = "col-md-6";
    col.innerHTML = `
      <div class="card border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="card-body">
          <span class="badge bg-light text-dark border mb-2">${escapeHtml(item.category)}</span>
          <h5 class="fw-bold ${item.completed ? "text-decoration-line-through text-muted" : ""}">${escapeHtml(item.title)}</h5>
          ${item.completed && photo ? `<img src="${escapeHtml(photo)}" class="img-fluid rounded-3 mt-2" style="max-height:200px;object-fit:cover;width:100%">` : ""}
          <div class="action-row">
            ${!item.completed ? `<button class="btn btn-sm btn-success complete-goal"><i class="bi bi-check-lg"></i> Complete</button>` : `<span class="badge bg-success align-self-center">Completed 🎉</span>`}
            <button class="btn btn-sm btn-outline-primary edit-goal"><i class="bi bi-pencil"></i> Edit</button>
            <button class="btn btn-sm btn-outline-danger delete-goal"><i class="bi bi-trash"></i> Delete</button>
          </div>
        </div>
      </div>`;
    col.querySelector(".edit-goal").onclick = () => {
      $("bucketId").value = item.id; $("bucketTitle").value = item.title || "";
      $("bucketCategory").value = item.category || "Travel"; showModal("bucketModal");
    };
    col.querySelector(".delete-goal").onclick = async () => {
      if (confirm("Delete this bucket goal?")) await removeDocument("bucketList", item.id, [item.photoPath]);
    };
    col.querySelector(".complete-goal")?.addEventListener("click", async () => {
      await updateDoc(doc(db, "bucketList", item.id), { completed: true, completedAt: serverTimestamp() });
    });
    c.appendChild(col);
  });
}

function editPlace(item) {
  $("placeId").value = item.id; $("placeName").value = item.name || "";
  $("placeAddress").value = item.address || ""; $("placeMapsUrl").value = item.mapsUrl || "";
  $("placeNotes").value = item.notes || ""; showModal("placeModal");
}

function renderPlaces() {
  const c = $("placesContainer");
  c.innerHTML = state.places.length ? "" : `<div class="col-12 text-center text-muted py-5">No places yet.</div>`;
  state.places.forEach(item => {
    const col = document.createElement("div"); col.className = "col-md-6 col-lg-4";
    const maps = safeUrl(item.mapsUrl);
    col.innerHTML = `
      <div class="card border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="card-body">
          <i class="bi bi-geo-alt-fill text-primary fs-3"></i>
          <h5 class="fw-bold mt-2">${escapeHtml(item.name)}</h5>
          <p class="text-muted">${escapeHtml(item.address)}</p>
          <p style="white-space:pre-line">${escapeHtml(item.notes)}</p>
          <div class="action-row">
            ${maps ? `<a class="btn btn-sm btn-outline-primary" href="${escapeHtml(maps)}" target="_blank" rel="noopener"><i class="bi bi-map"></i> Google Maps</a>` : ""}
            <button class="btn btn-sm btn-outline-primary edit-place"><i class="bi bi-pencil"></i> Edit</button>
            <button class="btn btn-sm btn-outline-danger delete-place"><i class="bi bi-trash"></i> Delete</button>
          </div>
        </div>
      </div>`;
    col.querySelector(".edit-place").onclick = () => editPlace(item);
    col.querySelector(".delete-place").onclick = async () => {
      if (confirm("Delete this place?")) await deleteDoc(doc(db, "places", item.id));
    };
    c.appendChild(col);
  });
}

function editCountdown(item) {
  $("countdownId").value = item.id; $("countdownTitle").value = item.title || "";
  $("countdownDate").value = item.targetDate || ""; $("countdownDescription").value = item.description || "";
  showModal("countdownModal");
}

function countdownText(target) {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "It's time! 🎉";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000) % 24;
  const mins = Math.floor(diff / 60000) % 60;
  const secs = Math.floor(diff / 1000) % 60;
  return `${days}d ${hours}h ${mins}m ${secs}s`;
}

function renderCountdowns() {
  const c = $("countdownsContainer");
  c.innerHTML = state.countdowns.length ? "" : `<div class="col-12 text-center text-muted py-5">No countdowns yet.</div>`;
  state.countdowns.forEach(item => {
    const col = document.createElement("div"); col.className = "col-md-6 col-lg-4";
    col.innerHTML = `
      <div class="card border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="card-body">
          <span class="badge bg-warning text-dark">Countdown</span>
          <h5 class="fw-bold mt-2">${escapeHtml(item.title)}</h5>
          <div class="countdown-number countdown-value" data-target="${escapeHtml(item.targetDate)}">${escapeHtml(countdownText(item.targetDate))}</div>
          <p class="text-muted">${escapeHtml(item.description)}</p>
          <div class="action-row">
            <button class="btn btn-sm btn-outline-primary edit-countdown"><i class="bi bi-pencil"></i> Edit</button>
            <button class="btn btn-sm btn-outline-danger delete-countdown"><i class="bi bi-trash"></i> Delete</button>
          </div>
        </div>
      </div>`;
    col.querySelector(".edit-countdown").onclick = () => editCountdown(item);
    col.querySelector(".delete-countdown").onclick = async () => {
      if (confirm("Delete this countdown?")) await deleteDoc(doc(db, "countdowns", item.id));
    };
    c.appendChild(col);
  });
}

function renderGallery() {
  const c = $("galleryContainer");
  const media = [];
  state.memories.forEach(x => {
    if (x.image) media.push({ url: x.image, type: "image", title: x.title, caption: x.caption });
    if (x.video) media.push({ url: x.video, type: "video", title: x.title, caption: x.caption });
  });
  state.bucketList.forEach(x => {
    if (x.photo) media.push({ url: x.photo, type: "image", title: `${x.title} — Completed`, caption: "Bucket-list celebration" });
  });

  c.innerHTML = media.length ? "" : `<div class="col-12 text-center text-muted py-5">No photos or videos uploaded yet.</div>`;
  media.forEach(item => {
    const col = document.createElement("div"); col.className = "col-sm-6 col-lg-4";
    const mediaEl = item.type === "image"
      ? `<img src="${escapeHtml(safeUrl(item.url))}" alt="">`
      : `<video src="${escapeHtml(safeUrl(item.url))}" controls preload="metadata"></video>`;
    col.innerHTML = `<div class="media-card">${mediaEl}<div class="media-card-body"><strong>${escapeHtml(item.title)}</strong><div class="text-muted small">${escapeHtml(item.caption || "")}</div></div></div>`;
    c.appendChild(col);
  });
}

const achievements = [
  ["memory-maker", "📸", "Memory Maker", "Add your first memory.", () => state.memories.length >= 1],
  ["storyteller", "💌", "Storyteller", "Create your first letter.", () => state.letters.length >= 1],
  ["timekeeper", "⏳", "Timekeeper", "Create your first capsule.", () => state.capsules.length >= 1],
  ["dream-builder", "🎯", "Dream Builder", "Create five bucket goals.", () => state.bucketList.length >= 5],
  ["dream-complete", "🏆", "Dream Achiever", "Complete a bucket goal.", () => state.bucketList.some(x => x.completed)],
  ["explorer", "🗺️", "Explorer", "Save your first place.", () => state.places.length >= 1],
  ["countdown", "⏰", "Counting Down", "Create your first countdown.", () => state.countdowns.length >= 1],
  ["media", "🎥", "Media Collector", "Upload a photo or video.", () => state.memories.some(x => x.image || x.video)]
];

function renderAchievements() {
  const c = $("achievementsContainer");
  let unlocked = 0;
  c.innerHTML = "";
  achievements.forEach(([id, icon, title, desc, test]) => {
    const ok = test(); if (ok) unlocked++;
    const col = document.createElement("div"); col.className = "col-sm-6 col-lg-3";
    col.innerHTML = `
      <div class="card achievement-card ${ok ? "" : "locked"} border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="card-body">
          <div class="achievement-icon">${icon}</div>
          <h6 class="fw-bold mt-2">${escapeHtml(title)}</h6>
          <p class="small text-muted">${escapeHtml(desc)}</p>
          <span class="badge ${ok ? "bg-success" : "bg-secondary"}">${ok ? "Unlocked" : "Locked"}</span>
        </div>
      </div>`;
    c.appendChild(col);
  });
  $("achievementScore").textContent = `${unlocked}/${achievements.length} unlocked`;
}

function allSearchItems() {
  return [
    ...state.memories.map(x => ({ type: "Memory", title: x.title, text: x.note, target: "timeline-pane" })),
    ...state.letters.map(x => ({ type: "Letter", title: x.title, text: x.content, target: "letters-pane" })),
    ...state.capsules.map(x => ({ type: "Capsule", title: x.title, text: x.content, target: "capsule-pane" })),
    ...state.bucketList.map(x => ({ type: "Bucket Goal", title: x.title, text: x.category, target: "bucket-pane" })),
    ...state.places.map(x => ({ type: "Place", title: x.name, text: `${x.address} ${x.notes}`, target: "places-pane" })),
    ...state.countdowns.map(x => ({ type: "Countdown", title: x.title, text: x.description, target: "countdowns-pane" }))
  ];
}

function runSearch() {
  const q = $("globalSearch").value.trim().toLowerCase();
  const box = $("searchResults");
  if (!q) { box.classList.add("d-none"); box.innerHTML = ""; return; }
  const results = allSearchItems().filter(x => `${x.title} ${x.text}`.toLowerCase().includes(q));
  box.classList.remove("d-none");
  box.innerHTML = results.length ? results.map(x => `
    <div class="search-result">
      <span class="badge bg-light text-dark border">${escapeHtml(x.type)}</span>
      <strong class="ms-2">${escapeHtml(x.title)}</strong>
      <div class="small text-muted">${escapeHtml(String(x.text || "").slice(0, 160))}</div>
    </div>`).join("") : `<div class="text-muted py-2">No matches found.</div>`;
}

function renderAll() {
  renderMemories(); renderLetters(); renderCapsules(); renderBucket();
  renderPlaces(); renderCountdowns(); renderGallery(); renderAchievements();
  runSearch();
}

function listen(collectionName, stateKey, orderField) {
  const q = query(collection(db, collectionName), orderBy(orderField, "desc"));
  onSnapshot(q, snap => {
    state[stateKey] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
    setSyncStatus("online", "Synced across devices");
  }, err => {
    console.error(collectionName, err);
    setSyncStatus("error", "Sync error");
  });
}

listen("memories", "memories", "date");
listen("letters", "letters", "createdAt");
listen("capsules", "capsules", "unlockDate");
listen("bucketList", "bucketList", "createdAt");
listen("places", "places", "createdAt");
listen("countdowns", "countdowns", "targetDate");

$("memoryForm").addEventListener("submit", async e => {
  e.preventDefault();
  const button = $("saveMemoryBtn");
  button.disabled = true;
  const progressBox = $("memoryUploadProgress");
  const bar = $("memoryUploadBar");
  progressBox.classList.remove("d-none");

  try {
    const id = $("memoryId").value;
    const old = state.memories.find(x => x.id === id);
    const data = {
      title: $("memTitle").value.trim(),
      date: $("memDate").value,
      audio: $("memAudio").value.trim(),
      caption: $("memCaption").value.trim(),
      note: $("memNote").value.trim()
    };

    const imageFile = $("memImage").files?.[0];
    const videoFile = $("memVideo").files?.[0];

    if (imageFile) {
      const media = await uploadMedia(imageFile, "memories/images", p => { bar.style.width = `${p}%`; bar.textContent = `Photo ${p}%`; });
      data.image = media.url; data.imagePath = media.path; data.imageType = media.type;
    }
    if (videoFile) {
      const media = await uploadMedia(videoFile, "memories/videos", p => { bar.style.width = `${p}%`; bar.textContent = `Video ${p}%`; });
      data.video = media.url; data.videoPath = media.path; data.videoType = media.type;
    }

    if (id) {
      if (!data.image) { data.image = old?.image || ""; data.imagePath = old?.imagePath || ""; }
      if (!data.video) { data.video = old?.video || ""; data.videoPath = old?.videoPath || ""; }
      await updateDoc(doc(db, "memories", id), { ...data, updatedAt: serverTimestamp() });
      if (imageFile && old?.imagePath) await removeStorageFile(old.imagePath);
      if (videoFile && old?.videoPath) await removeStorageFile(old.videoPath);
    } else {
      await saveDocument("memories", null, data);
    }

    resetForm("memoryForm"); $("memoryId").value = ""; $("memoryModalHeading").textContent = "Add Memory";
    progressBox.classList.add("d-none"); hideModal("memoryModal");
  } catch (err) {
    alert(`Unable to save memory.\n\n${err.message}`);
  } finally { button.disabled = false; }
});

$("letterForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("letterId").value;
  await saveDocument("letters", id || null, {
    title: $("letterTitle").value.trim(), content: $("letterContent").value.trim()
  });
  resetForm("letterForm"); hideModal("letterModal");
});

$("capsuleForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("capsuleId").value;
  await saveDocument("capsules", id || null, {
    title: $("capTitle").value.trim(), unlockDate: $("capUnlockDate").value,
    content: $("capContent").value.trim()
  });
  resetForm("capsuleForm"); hideModal("capsuleModal");
});

$("bucketForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("bucketId").value;
  const old = state.bucketList.find(x => x.id === id);
  await saveDocument("bucketList", id || null, {
    title: $("bucketTitle").value.trim(), category: $("bucketCategory").value,
    completed: old?.completed || false, photo: old?.photo || "", photoPath: old?.photoPath || ""
  });
  resetForm("bucketForm"); hideModal("bucketModal");
});

$("placeForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("placeId").value;
  await saveDocument("places", id || null, {
    name: $("placeName").value.trim(), address: $("placeAddress").value.trim(),
    mapsUrl: $("placeMapsUrl").value.trim(), notes: $("placeNotes").value.trim()
  });
  resetForm("placeForm"); hideModal("placeModal");
});

$("countdownForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("countdownId").value;
  await saveDocument("countdowns", id || null, {
    title: $("countdownTitle").value.trim(), targetDate: $("countdownDate").value,
    description: $("countdownDescription").value.trim()
  });
  resetForm("countdownForm"); hideModal("countdownModal");
});

$("globalSearch").addEventListener("input", runSearch);
$("clearSearch").addEventListener("click", () => { $("globalSearch").value = ""; runSearch(); });

setInterval(() => {
  document.querySelectorAll(".countdown-value").forEach(el => {
    el.textContent = countdownText(el.dataset.target);
  });
}, 1000);

document.querySelectorAll('[data-bs-dismiss="modal"]').forEach(btn => {
  btn.addEventListener("click", () => {
    const modal = btn.closest(".modal");
    if (modal) hideModal(modal.id);
  });
});

setSyncStatus("", "Connecting...");