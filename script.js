import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =========================================================
   FIREBASE
   ========================================================= */

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

const state = {
  memories: [],
  capsules: [],
  bucketList: [],
  places: [],
  countdowns: [],
  currentMemoryId: "",
  search: ""
};

const $ = id => document.getElementById(id);

function showModal(id) {
  const el = $(id);
  if (el && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(el).show();
}

function hideModal(id) {
  const el = $(id);
  if (el && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(el).hide();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function safeUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(url, window.location.href);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch { return ""; }
}

function setSyncStatus(status, text) {
  if ($("syncIndicator")) $("syncIndicator").className = `sync-dot ${status}`;
  if ($("syncStatusText")) $("syncStatusText").textContent = text;
}

function formatDate(dateString) {
  if (!dateString) return "";
  const d = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(d.getTime()) ? dateString : d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

/* =========================================================
   GOOGLE DRIVE MEDIA STORAGE
   ---------------------------------------------------------
   Firebase remains the database/realtime-sync layer.
   Google Drive stores photos and videos.

   IMPORTANT:
   1. Set GOOGLE_DRIVE_CLIENT_ID below to your OAuth Web Client ID.
   2. The app requests the drive.file scope.
   3. Uploaded media is shared as "Anyone with the link" so
      normal <img> and <video> elements can display it.
      Do not use this mode for highly private media.
   ========================================================= */

const GOOGLE_DRIVE_CLIENT_ID = "PASTE_YOUR_GOOGLE_OAUTH_WEB_CLIENT_ID_HERE";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FOLDER_NAME = "Memory Vault Media";

const driveState = {
  accessToken: "",
  tokenExpiresAt: 0,
  client: null,
  folderId: "",
  connected: false
};

function setDriveStatus(connected, text) {
  const el = $("driveStatus");
  if (!el) return;
  el.innerHTML = connected
    ? `<i class="bi bi-cloud-check me-1"></i>Google Drive: ${escapeHtml(text || "Connected")}`
    : `<i class="bi bi-cloud-slash me-1"></i>Google Drive: ${escapeHtml(text || "Not connected")}`;
  el.classList.toggle("connected", connected);
}

function getSavedDriveConfig() {
  try {
    return {
      clientId: localStorage.getItem("memoryVaultGoogleClientId") || GOOGLE_DRIVE_CLIENT_ID,
      folderName: localStorage.getItem("memoryVaultGoogleFolderName") || DRIVE_FOLDER_NAME
    };
  } catch {
    return { clientId: GOOGLE_DRIVE_CLIENT_ID, folderName: DRIVE_FOLDER_NAME };
  }
}

function saveDriveConfig(clientId, folderName) {
  localStorage.setItem("memoryVaultGoogleClientId", clientId);
  localStorage.setItem("memoryVaultGoogleFolderName", folderName || DRIVE_FOLDER_NAME);
}

function driveIsAuthorized() {
  return !!driveState.accessToken && Date.now() < driveState.tokenExpiresAt - 30000;
}

function initGoogleDriveClient() {
  const config = getSavedDriveConfig();

  if (!config.clientId || config.clientId.includes("PASTE_YOUR_")) {
    setDriveStatus(false, "Client ID required");
    return false;
  }

  if (!window.google?.accounts?.oauth2) {
    setDriveStatus(false, "Google authorization is still loading...");
    return false;
  }

  driveState.client = google.accounts.oauth2.initTokenClient({
    client_id: config.clientId,
    scope: GOOGLE_DRIVE_SCOPE,
    callback: response => {
      if (response.error) {
        console.error("Google Drive OAuth error:", response);
        setDriveStatus(false, "Authorization failed");
        return;
      }
      driveState.accessToken = response.access_token;
      driveState.tokenExpiresAt = Date.now() + ((response.expires_in || 3600) * 1000);
      driveState.connected = true;
      setDriveStatus(true, "Connected");
      ensureDriveFolder().catch(error => {
        console.error(error);
        setDriveStatus(false, "Folder setup failed");
      });
    }
  });

  return true;
}

async function connectGoogleDrive(forcePrompt = false) {
  const config = getSavedDriveConfig();

  if (!config.clientId || config.clientId.includes("PASTE_YOUR_")) {
    $("googleDriveClientIdInput").value = config.clientId.includes("PASTE_YOUR_") ? "" : config.clientId;
    $("googleDriveFolderNameInput").value = config.folderName;
    showModal("driveSetupModal");
    return false;
  }

  if (!window.google?.accounts?.oauth2) {
    alert("Google authorization is still loading. Please wait a moment and try again.");
    return false;
  }

  if (!driveState.client) initGoogleDriveClient();
  if (!driveState.client) return false;

  if (driveIsAuthorized() && !forcePrompt) {
    await ensureDriveFolder();
    setDriveStatus(true, "Connected");
    return true;
  }

  return new Promise(resolve => {
    const oldCallback = driveState.client.callback;
    driveState.client.callback = response => {
      if (oldCallback) oldCallback(response);
      resolve(!response.error);
    };
    driveState.client.requestAccessToken({ prompt: forcePrompt ? "consent" : "" });
  });
}

async function driveFetch(url, options = {}) {
  if (!driveIsAuthorized()) {
    const ok = await connectGoogleDrive(false);
    if (!ok) throw new Error("Google Drive is not connected.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${driveState.accessToken}`);

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = body?.error?.message || message;
    } catch {}
    throw new Error(`Google Drive: ${message}`);
  }
  return response;
}

async function ensureDriveFolder() {
  if (driveState.folderId) return driveState.folderId;

  const config = getSavedDriveConfig();
  const folderName = config.folderName || DRIVE_FOLDER_NAME;

  const searchUrl =
    `https://www.googleapis.com/drive/v3/files?spaces=drive&` +
    `q=${encodeURIComponent(`name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)}` +
    `&fields=files(id,name)&pageSize=10`;

  const searchResponse = await driveFetch(searchUrl);
  const searchData = await searchResponse.json();

  if (searchData.files?.length) {
    driveState.folderId = searchData.files[0].id;
    return driveState.folderId;
  }

  const createResponse = await driveFetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder"
      })
    }
  );

  const folder = await createResponse.json();
  driveState.folderId = folder.id;
  return folder.id;
}

function drivePublicUrl(fileId) {
  return fileId
    ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
    : "";
}

async function makeDriveFileViewable(fileId) {
  // Required for <img>/<video> elements to access media without
  // attaching an OAuth Authorization header.
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "anyone",
        role: "reader"
      })
    }
  );

  return response.ok;
}

function uploadToDrive(file, folderName, onProgress = () => {}) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!file) return resolve({ url: "", path: "", id: "" });

      const ok = await connectGoogleDrive(false);
      if (!ok) throw new Error("Connect Google Drive before uploading media.");

      const folderId = await ensureDriveFolder();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const finalName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;

      // Step 1: start a Drive resumable upload.
      const initResponse = await driveFetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": file.type || "application/octet-stream",
            "X-Upload-Content-Length": String(file.size)
          },
          body: JSON.stringify({
            name: finalName,
            parents: [folderId],
            mimeType: file.type || "application/octet-stream"
          })
        }
      );

      const sessionUrl = initResponse.headers.get("Location");
      if (!sessionUrl) {
        throw new Error("Google Drive did not return a resumable upload session.");
      }

      // Step 2: upload with XMLHttpRequest so we get byte-level progress.
      const result = await new Promise((resolveUpload, rejectUpload) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sessionUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

        xhr.upload.onprogress = event => {
          if (event.lengthComputable) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolveUpload(JSON.parse(xhr.responseText));
            } catch {
              rejectUpload(new Error("Google Drive returned an invalid upload response."));
            }
          } else {
            rejectUpload(new Error(`Google Drive upload failed (${xhr.status}).`));
          }
        };

        xhr.onerror = () => rejectUpload(new Error("Network error while uploading to Google Drive."));
        xhr.onabort = () => rejectUpload(new Error("Google Drive upload was cancelled."));
        xhr.send(file);
      });

      const fileId = result.id;
      if (!fileId) throw new Error("Google Drive did not return a file ID.");

      // Make media directly renderable by <img> and <video>.
      await makeDriveFileViewable(fileId);

      onProgress(100);

      resolve({
        url: drivePublicUrl(fileId),
        path: fileId,       // Keep the existing Firestore field name.
        id: fileId,
        name: result.name || finalName
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function removeDriveFile(fileId) {
  if (!fileId) return;

  // If this is an old Firebase Storage path, Drive will return 400/404;
  // we intentionally ignore it so old memories are not broken.
  try {
    await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE" }
    );
  } catch (error) {
    console.warn("Drive cleanup skipped:", error.message);
  }
}

function setUploadProgress(percent, text = "Uploading media...") {
  const wrap = $("memoryUploadProgressWrap");
  if (!wrap) return;
  wrap.classList.remove("d-none");
  $("memoryUploadStatus").textContent = text;
  $("memoryUploadPercent").textContent = `${percent}%`;
  $("memoryUploadProgress").style.width = `${percent}%`;
}

function resetUploadProgress() {
  $("memoryUploadProgressWrap")?.classList.add("d-none");
  if ($("memoryUploadProgress")) $("memoryUploadProgress").style.width = "0%";
}

/* =========================================================
   REALTIME COLLECTION SUBSCRIPTIONS
   ========================================================= */

function subscribe(collectionName, target, orderField, render) {
  const q = query(collection(db, collectionName), orderBy(orderField, "asc"));
  onSnapshot(q, snapshot => {
    state[target] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
    renderAchievements();
    renderSearch();
    setSyncStatus("online", "Synced");
  }, error => {
    console.error(`${collectionName} realtime error:`, error);
    setSyncStatus("error", "Sync error");
  });
}

subscribe("memories", "memories", "date", renderTimeline);
subscribe("capsules", "capsules", "unlockDate", renderCapsules);
subscribe("bucketList", "bucketList", "createdAt", renderBucketList);
subscribe("places", "places", "createdAt", renderPlaces);
subscribe("countdowns", "countdowns", "targetDate", renderCountdowns);

/* =========================================================
   MEMORY TIMELINE + GALLERY
   ========================================================= */

function mediaMarkup(item, mode = "card") {
  const image = safeUrl(item.image);
  const video = safeUrl(item.video);
  if (mode === "gallery") {
    if (video) return `<video src="${escapeHtml(video)}" controls playsinline preload="metadata"></video>`;
    if (image) return `<img src="${escapeHtml(image)}" class="media-thumb" loading="lazy" alt="">`;
    return `<div class="d-flex align-items-center justify-content-center rounded-4 bg-light media-thumb"><i class="bi bi-file-earmark fs-1 text-muted"></i></div>`;
  }
  let out = "";
  if (image) out += `<img src="${escapeHtml(image)}" class="card-img-top rounded-top-4" style="height:180px;object-fit:cover" alt="" loading="lazy">`;
  if (video) out += `<video src="${escapeHtml(video)}" class="w-100 rounded-top-4" style="height:180px;object-fit:cover" controls playsinline preload="metadata"></video>`;
  return out;
}

function renderTimeline() {
  const container = $("timelineContainer");
  if (!container) return;
  container.innerHTML = "";

  if (!state.memories.length) {
    container.innerHTML = `<div class="text-center py-5 text-muted">No memories yet. Add your first one! 💜</div>`;
    return;
  }

  state.memories.forEach((item, index) => {
    const side = index % 2 === 0 ? "left" : "right";
    const el = document.createElement("div");
    el.className = `timeline-item ${side}`;
    el.innerHTML = `
      <div class="timeline-node" aria-hidden="true"></div>
      <button type="button" class="card card-memory shadow-sm rounded-4 text-start w-100 p-0">
        ${mediaMarkup(item)}
        <div class="card-body">
          <small class="text-primary fw-bold">${escapeHtml(formatDate(item.date))}</small>
          <h5 class="card-title fw-bold mt-1 mb-1">${escapeHtml(item.title)}</h5>
          <p class="card-text text-muted text-truncate mb-0">${escapeHtml(item.note)}</p>
          <div class="mt-2 d-flex gap-2 small text-muted">
            ${item.image ? '<span><i class="bi bi-image"></i> Photo</span>' : ''}
            ${item.video ? '<span><i class="bi bi-camera-video"></i> Video</span>' : ''}
            ${item.audio ? '<span><i class="bi bi-music-note"></i> Audio</span>' : ''}
          </div>
        </div>
      </button>`;
    el.querySelector(".card-memory").addEventListener("click", () => viewMemory(item.id));
    container.appendChild(el);
  });
}

function viewMemory(id) {
  const item = state.memories.find(x => x.id === id);
  if (!item) return;
  state.currentMemoryId = id;

  $("memoryModalTitle").textContent = item.title || "Untitled";
  $("memoryModalDate").textContent = formatDate(item.date);
  $("memoryModalNote").textContent = item.note || "";

  const media = $("memoryModalMedia");
  media.innerHTML = "";
  if (item.image) media.insertAdjacentHTML("beforeend", `<img src="${escapeHtml(safeUrl(item.image))}" class="img-fluid rounded-4 w-100 mb-3" style="max-height:420px;object-fit:contain" alt="">`);
  if (item.video) media.insertAdjacentHTML("beforeend", `<video src="${escapeHtml(safeUrl(item.video))}" class="w-100 rounded-4 mb-3" controls playsinline></video>`);

  const audio = $("memoryModalAudio");
  const audioBox = $("memoryModalAudioContainer");
  const audioUrl = safeUrl(item.audio);
  if (audioUrl) {
    audio.src = audioUrl;
    audioBox.classList.remove("d-none");
  } else {
    audio.pause(); audio.removeAttribute("src"); audio.load(); audioBox.classList.add("d-none");
  }
  showModal("viewMemoryModal");
}

$("editMemoryBtn").addEventListener("click", () => {
  const item = state.memories.find(x => x.id === state.currentMemoryId);
  if (!item) return;
  hideModal("viewMemoryModal");
  openMemoryEditor(item);
});

$("deleteMemoryBtn").addEventListener("click", async () => {
  const item = state.memories.find(x => x.id === state.currentMemoryId);
  if (!item) return;
  await deleteRecord("memories", item);
  hideModal("viewMemoryModal");
});

function openMemoryEditor(item = null) {
  $("memoryForm").reset();
  $("memoryId").value = item?.id || "";
  $("memoryExistingImage").value = item?.image || "";
  $("memoryExistingVideo").value = item?.video || "";
  $("memoryExistingImagePath").value = item?.imagePath || "";
  $("memoryExistingVideoPath").value = item?.videoPath || "";
  $("memoryFormTitle").textContent = item ? "Edit Memory" : "Add New Memory";
  $("saveMemoryBtn").innerHTML = item ? '<i class="bi bi-check2 me-1"></i>Update Memory' : '<i class="bi bi-cloud-arrow-up me-1"></i>Save Memory';
  if (item) {
    $("memTitle").value = item.title || "";
    $("memDate").value = item.date || "";
    $("memAudio").value = item.audio || "";
    $("memNote").value = item.note || "";
  }
  showModal("memoryModal");
}

document.querySelector('[data-bs-target="#memoryModal"]').addEventListener("click", () => openMemoryEditor());

$("memoryForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("saveMemoryBtn");
  button.disabled = true;
  try {
    const id = $("memoryId").value;
    let image = { url: $("memoryExistingImage").value, path: $("memoryExistingImagePath").value };
    let video = { url: $("memoryExistingVideo").value, path: $("memoryExistingVideoPath").value };

    const imageFile = $("memImage").files?.[0];
    const videoFile = $("memVideo").files?.[0];

    if (imageFile) {
      setUploadProgress(0, "Uploading photo...");
      image = await uploadToDrive(imageFile, "memories/photos", p => setUploadProgress(p, "Uploading photo..."));
    }
    if (videoFile) {
      setUploadProgress(0, "Uploading video...");
      video = await uploadToDrive(videoFile, "memories/videos", p => setUploadProgress(p, "Uploading large video..."));
    }

    const payload = {
      title: $("memTitle").value.trim(),
      date: $("memDate").value,
      image: image.url || "",
      imagePath: image.path || "",
      video: video.url || "",
      videoPath: video.path || "",
      audio: $("memAudio").value.trim(),
      note: $("memNote").value.trim(),
      updatedAt: serverTimestamp()
    };

    if (id) {
      await updateDoc(doc(db, "memories", id), payload);
      if (imageFile) await removeDriveFile($("memoryExistingImagePath").value);
      if (videoFile) await removeDriveFile($("memoryExistingVideoPath").value);
    } else {
      await addDoc(collection(db, "memories"), { ...payload, createdAt: serverTimestamp() });
    }

    event.target.reset();
    resetUploadProgress();
    hideModal("memoryModal");
  } catch (error) {
    console.error(error);
    alert(`Unable to save memory.\n\n${error.message}`);
  } finally {
    button.disabled = false;
    resetUploadProgress();
  }
});

function renderGallery() {
  const container = $("galleryContainer");
  if (!container) return;
  const mediaItems = state.memories.filter(x => x.image || x.video);
  container.innerHTML = mediaItems.length ? mediaItems.map(item => `
    <div class="col-6 col-md-4 col-lg-3 gallery-item">
      <div class="card border-0 shadow-sm rounded-4 p-2 h-100">
        ${mediaMarkup(item, "gallery")}
        <div class="pt-2 px-1">
          <div class="fw-semibold text-truncate">${escapeHtml(item.title)}</div>
          <small class="text-muted">${escapeHtml(formatDate(item.date))}</small>
        </div>
      </div>
    </div>`).join("") :
    `<div class="col-12 text-center text-muted py-5">No photos or videos uploaded yet.</div>`;
}

$("openGalleryBtn").addEventListener("click", () => {
  renderGallery();
  showModal("galleryModal");
});

/* =========================================================
   CAPSULES / LETTERS
   ========================================================= */

function renderCapsules() {
  const container = $("capsuleContainer");
  if (!container) return;
  const today = new Date(); today.setHours(0,0,0,0);
  container.innerHTML = state.capsules.length ? "" : `<div class="col-12 text-center text-muted py-5">No letters yet.</div>`;

  state.capsules.forEach(item => {
    const unlock = new Date(`${item.unlockDate}T00:00:00`);
    const unlocked = today >= unlock;
    const days = Math.max(0, Math.ceil((unlock - today) / 86400000));
    const col = document.createElement("div");
    col.className = "col-md-6 col-lg-4";
    col.innerHTML = `
      <div class="card capsule-card ${unlocked ? "border-success" : "border-secondary"} shadow-sm rounded-4 h-100 p-3">
        <div class="card-body p-0 d-flex flex-column">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="badge ${unlocked ? "bg-success" : "bg-secondary"}">${unlocked ? "Unlocked" : "Locked"}</span>
            <small class="text-muted">${escapeHtml(item.unlockDate)}</small>
          </div>
          <h5 class="fw-bold">${escapeHtml(item.title)}</h5>
          <p class="text-secondary flex-grow-1" style="white-space:pre-line">${unlocked ? escapeHtml(item.content) : "This letter is still sealed. 💌"}</p>
          ${!unlocked ? `<div class="text-muted small mb-3"><i class="bi bi-lock-fill me-1"></i>${days} day(s) left</div>` : ""}
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-primary rounded-pill flex-fill edit-capsule"><i class="bi bi-pencil"></i> Edit</button>
            <button class="btn btn-sm btn-outline-danger rounded-pill flex-fill delete-capsule"><i class="bi bi-trash"></i> Delete</button>
          </div>
        </div>
      </div>`;
    col.querySelector(".edit-capsule").addEventListener("click", () => openCapsuleEditor(item));
    col.querySelector(".delete-capsule").addEventListener("click", () => deleteRecord("capsules", item));
    container.appendChild(col);
  });
}

function openCapsuleEditor(item = null) {
  $("capsuleForm").reset();
  $("capsuleId").value = item?.id || "";
  $("capsuleFormTitle").textContent = item ? "Edit Letter / Capsule" : "Create Time Capsule / Letter";
  $("saveCapsuleBtn").textContent = item ? "Update Letter" : "Save Letter";
  if (item) {
    $("capTitle").value = item.title || "";
    $("capUnlockDate").value = item.unlockDate || "";
    $("capContent").value = item.content || "";
  }
  showModal("capsuleModal");
}
document.querySelector('[data-bs-target="#capsuleModal"]').addEventListener("click", () => openCapsuleEditor());
$("capsuleForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("capsuleId").value;
  const payload = {
    title: $("capTitle").value.trim(),
    unlockDate: $("capUnlockDate").value,
    content: $("capContent").value.trim(),
    updatedAt: serverTimestamp()
  };
  try {
    if (id) await updateDoc(doc(db, "capsules", id), payload);
    else await addDoc(collection(db, "capsules"), { ...payload, createdAt: serverTimestamp() });
    event.target.reset(); $("capsuleId").value = ""; hideModal("capsuleModal");
  } catch (e) { alert(`Unable to save letter.\n\n${e.message}`); }
});

/* =========================================================
   BUCKET LIST + COMPLETION TRACKING
   ========================================================= */

function renderBucketList() {
  const container = $("bucketListContainer");
  if (!container) return;
  container.innerHTML = state.bucketList.length ? "" : `<div class="col-12 text-center text-muted py-5">No bucket goals yet.</div>`;

  const total = state.bucketList.length;
  const completed = state.bucketList.filter(x => x.completed).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  $("bucketProgressText").textContent = `${completed} of ${total} goals completed • ${pct}%`;
  $("bucketProgressBar").style.width = `${pct}%`;

  state.bucketList.forEach(item => {
    const col = document.createElement("div");
    col.className = "col-md-6";
    col.innerHTML = `
      <div class="card border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="d-flex align-items-start gap-3">
          <input class="form-check-input fs-5 mt-1 bucket-check" type="checkbox" ${item.completed ? "checked" : ""}>
          <div class="flex-grow-1">
            <span class="badge bg-light text-dark border mb-1">${escapeHtml(item.category)}</span>
            <h6 class="fw-bold mb-1 ${item.completed ? "text-decoration-line-through text-muted" : ""}">${escapeHtml(item.title)}</h6>
            ${item.photo ? `<img src="${escapeHtml(safeUrl(item.photo))}" class="img-fluid rounded-3 mt-2" style="max-height:180px;object-fit:cover;width:100%" alt="">` : ""}
            <div class="d-flex gap-2 mt-3">
              <button class="btn btn-sm btn-outline-primary rounded-pill edit-bucket"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger rounded-pill delete-bucket"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        </div>
      </div>`;
    const check = col.querySelector(".bucket-check");
    check.addEventListener("change", () => {
      if (!item.completed) {
        $("completeBucketId").value = item.id;
        showModal("completeBucketModal");
      } else {
        updateDoc(doc(db, "bucketList", item.id), { completed: false, updatedAt: serverTimestamp() });
      }
    });
    col.querySelector(".edit-bucket").addEventListener("click", () => openBucketEditor(item));
    col.querySelector(".delete-bucket").addEventListener("click", () => deleteRecord("bucketList", item));
    container.appendChild(col);
  });
}

function openBucketEditor(item = null) {
  $("bucketForm").reset();
  $("bucketId").value = item?.id || "";
  $("bucketFormTitle").textContent = item ? "Edit Bucket Goal" : "Add Bucket Goal";
  if (item) { $("bucketTitle").value = item.title || ""; $("bucketCategory").value = item.category || "Travel"; }
  showModal("bucketModal");
}
document.querySelector('[data-bs-target="#bucketModal"]').addEventListener("click", () => openBucketEditor());
$("bucketForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("bucketId").value;
  const payload = { title: $("bucketTitle").value.trim(), category: $("bucketCategory").value, updatedAt: serverTimestamp() };
  try {
    if (id) await updateDoc(doc(db, "bucketList", id), payload);
    else await addDoc(collection(db, "bucketList"), { ...payload, completed: false, photo: "", photoPath: "", createdAt: serverTimestamp() });
    event.target.reset(); $("bucketId").value = ""; hideModal("bucketModal");
  } catch (e) { alert(`Unable to save goal.\n\n${e.message}`); }
});

$("completeBucketForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("completeBucketId").value;
  if (!id) return;
  const button = event.submitter;
  button.disabled = true;
  try {
    let photo = { url: "", path: "" };
    const file = $("completePhoto").files?.[0];
    if (file) photo = await uploadToDrive(file, "bucket-completions");
    const old = state.bucketList.find(x => x.id === id);
    await updateDoc(doc(db, "bucketList", id), {
      completed: true, photo: photo.url, photoPath: photo.path, completedAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    if (old?.photoPath && file) await removeDriveFile(old.photoPath);
    event.target.reset(); $("completeBucketId").value = ""; hideModal("completeBucketModal");
  } catch (e) {
    alert(`Unable to complete goal.\n\n${e.message}`);
  } finally { button.disabled = false; }
});

/* =========================================================
   PLACES + GOOGLE MAPS LINKS
   ========================================================= */

function mapsUrl(item) {
  const explicit = safeUrl(item.mapUrl);
  if (explicit) return explicit;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.name || "")}`;
}

function renderPlaces() {
  const container = $("placesContainer");
  if (!container) return;
  container.innerHTML = state.places.length ? "" : `<div class="col-12 text-center text-muted py-5">No places saved yet.</div>`;
  state.places.forEach(item => {
    const col = document.createElement("div");
    col.className = "col-md-6 col-lg-4";
    col.innerHTML = `
      <div class="card place-card border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="d-flex align-items-start gap-3">
          <div class="rounded-circle bg-primary-subtle p-3 text-primary"><i class="bi bi-geo-alt-fill fs-4"></i></div>
          <div class="flex-grow-1">
            <h5 class="fw-bold mb-1">${escapeHtml(item.name)}</h5>
            <p class="text-muted small mb-2">${escapeHtml(item.address)}</p>
            <p class="small text-secondary" style="white-space:pre-line">${escapeHtml(item.notes)}</p>
            <div class="d-flex gap-2 mt-3">
              <a class="btn btn-sm btn-primary rounded-pill flex-fill" target="_blank" rel="noopener" href="${escapeHtml(mapsUrl(item))}">
                <i class="bi bi-google me-1"></i>Google Maps
              </a>
              <button class="btn btn-sm btn-outline-primary rounded-pill edit-place"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger rounded-pill delete-place"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        </div>
      </div>`;
    col.querySelector(".edit-place").addEventListener("click", () => openPlaceEditor(item));
    col.querySelector(".delete-place").addEventListener("click", () => deleteRecord("places", item));
    container.appendChild(col);
  });
}

function openPlaceEditor(item = null) {
  $("placeForm").reset();
  $("placeId").value = item?.id || "";
  $("placeFormTitle").textContent = item ? "Edit Place" : "Add Place";
  if (item) {
    $("placeName").value = item.name || "";
    $("placeAddress").value = item.address || "";
    $("placeNotes").value = item.notes || "";
    $("placeMapUrl").value = item.mapUrl || "";
  }
  showModal("addPlaceModal");
}
document.querySelectorAll('[data-bs-target="#addPlaceModal"]').forEach(btn => btn.addEventListener("click", () => openPlaceEditor()));
$("placeForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("placeId").value;
  const payload = {
    name: $("placeName").value.trim(), address: $("placeAddress").value.trim(),
    notes: $("placeNotes").value.trim(), mapUrl: $("placeMapUrl").value.trim(), updatedAt: serverTimestamp()
  };
  try {
    if (id) await updateDoc(doc(db, "places", id), payload);
    else await addDoc(collection(db, "places"), { ...payload, createdAt: serverTimestamp() });
    event.target.reset(); $("placeId").value = ""; hideModal("addPlaceModal");
  } catch (e) { alert(`Unable to save place.\n\n${e.message}`); }
});

/* =========================================================
   COUNTDOWNS
   ========================================================= */

function countdownParts(target) {
  const diff = new Date(target).getTime() - Date.now();
  const seconds = Math.max(0, Math.floor(diff / 1000));
  return {
    diff, days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60
  };
}

function renderCountdowns() {
  const container = $("countdownsContainer");
  if (!container) return;
  container.innerHTML = state.countdowns.length ? "" : `<div class="col-12 text-center text-muted py-5">No countdowns yet.</div>`;
  state.countdowns.forEach(item => {
    const p = countdownParts(item.targetDate);
    const done = p.diff <= 0;
    const col = document.createElement("div");
    col.className = "col-md-6 col-lg-4";
    col.innerHTML = `
      <div class="card countdown-card border-0 shadow-sm rounded-4 h-100 p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <span class="badge ${done ? "bg-success" : "bg-danger"}">${done ? "It's time! 🎉" : "Counting down"}</span>
          <small class="text-muted">${escapeHtml(formatDateTime(item.targetDate))}</small>
        </div>
        <h4 class="fw-bold">${escapeHtml(item.title)}</h4>
        <p class="text-secondary">${escapeHtml(item.description)}</p>
        <div class="countdown-number display-6 fw-bold text-danger mb-3" data-countdown="${escapeHtml(item.id)}">
          ${done ? "00d 00h 00m 00s" : `${p.days}d ${String(p.hours).padStart(2,"0")}h ${String(p.minutes).padStart(2,"0")}m ${String(p.seconds).padStart(2,"0")}s`}
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary rounded-pill flex-fill edit-countdown"><i class="bi bi-pencil"></i> Edit</button>
          <button class="btn btn-sm btn-outline-danger rounded-pill flex-fill delete-countdown"><i class="bi bi-trash"></i> Delete</button>
        </div>
      </div>`;
    col.querySelector(".edit-countdown").addEventListener("click", () => openCountdownEditor(item));
    col.querySelector(".delete-countdown").addEventListener("click", () => deleteRecord("countdowns", item));
    container.appendChild(col);
  });
}

function tickCountdowns() {
  document.querySelectorAll("[data-countdown]").forEach(el => {
    const item = state.countdowns.find(x => x.id === el.dataset.countdown);
    if (!item) return;
    const p = countdownParts(item.targetDate);
    el.textContent = p.diff <= 0 ? "00d 00h 00m 00s" :
      `${p.days}d ${String(p.hours).padStart(2,"0")}h ${String(p.minutes).padStart(2,"0")}m ${String(p.seconds).padStart(2,"0")}s`;
  });
}
setInterval(tickCountdowns, 1000);

function openCountdownEditor(item = null) {
  $("countdownForm").reset();
  $("countdownId").value = item?.id || "";
  $("countdownFormTitle").textContent = item ? "Edit Countdown" : "Add Countdown";
  if (item) {
    $("countdownTitle").value = item.title || "";
    $("countdownDate").value = item.targetDate || "";
    $("countdownDescription").value = item.description || "";
  }
  showModal("addCountdownModal");
}
document.querySelectorAll('[data-bs-target="#addCountdownModal"]').forEach(btn => btn.addEventListener("click", () => openCountdownEditor()));
$("countdownForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("countdownId").value;
  const payload = {
    title: $("countdownTitle").value.trim(), targetDate: $("countdownDate").value,
    description: $("countdownDescription").value.trim(), updatedAt: serverTimestamp()
  };
  try {
    if (id) await updateDoc(doc(db, "countdowns", id), payload);
    else await addDoc(collection(db, "countdowns"), { ...payload, createdAt: serverTimestamp() });
    event.target.reset(); $("countdownId").value = ""; hideModal("addCountdownModal");
  } catch (e) { alert(`Unable to save countdown.\n\n${e.message}`); }
});

/* =========================================================
   ACHIEVEMENTS
   ========================================================= */

function renderAchievements() {
  const container = $("achievementsContainer");
  if (!container) return;

  const totalMedia = state.memories.filter(x => x.image || x.video).length;
  const completed = state.bucketList.filter(x => x.completed).length;
  const achievements = [
    ["first-memory", "First Memory", "Save your first memory.", state.memories.length >= 1, "bi-heart-fill"],
    ["five-memories", "Memory Keeper", "Save 5 memories.", state.memories.length >= 5, "bi-journal-heart-fill"],
    ["media", "Captured Moments", "Add a photo or video.", totalMedia >= 1, "bi-camera-fill"],
    ["five-media", "Storyteller", "Collect 5 media memories.", totalMedia >= 5, "bi-images"],
    ["first-goal", "Dreamer", "Create your first bucket goal.", state.bucketList.length >= 1, "bi-stars"],
    ["goal-complete", "Goal Getter", "Complete your first bucket goal.", completed >= 1, "bi-check-circle-fill"],
    ["three-goals", "Adventure Mode", "Complete 3 bucket goals.", completed >= 3, "bi-trophy-fill"],
    ["letter", "Love Letter", "Create your first letter/capsule.", state.capsules.length >= 1, "bi-envelope-heart-fill"],
    ["place", "Explorer", "Save your first place.", state.places.length >= 1, "bi-geo-alt-fill"],
    ["countdown", "Looking Forward", "Create your first countdown.", state.countdowns.length >= 1, "bi-hourglass-split"]
  ];

  container.innerHTML = achievements.map(a => `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="card achievement-card ${a[3] ? "unlocked" : "locked"} border-0 shadow-sm rounded-4 h-100 p-3 text-center">
        <i class="bi ${a[4]} display-6 ${a[3] ? "text-warning" : "text-secondary"}"></i>
        <h6 class="fw-bold mt-2">${escapeHtml(a[1])}</h6>
        <p class="small text-muted mb-0">${escapeHtml(a[2])}</p>
        <span class="badge ${a[3] ? "bg-warning text-dark" : "bg-light text-secondary"} mt-3">${a[3] ? "Unlocked" : "Locked"}</span>
      </div>
    </div>`).join("");
}

/* =========================================================
   GLOBAL SEARCH
   ========================================================= */

function searchText(item) {
  return Object.values(item).filter(v => typeof v === "string").join(" ").toLowerCase();
}

function renderSearch() {
  const queryText = state.search.trim().toLowerCase();
  const box = $("searchResults");
  if (!queryText) { box.classList.add("d-none"); return; }

  const groups = [
    ["Memory", state.memories, "bi-clock-history"],
    ["Letter", state.capsules, "bi-envelope-paper-heart"],
    ["Bucket Goal", state.bucketList, "bi-check2-square"],
    ["Place", state.places, "bi-geo-alt"],
    ["Countdown", state.countdowns, "bi-calendar-heart"]
  ];

  const matches = [];
  groups.forEach(([type, items, icon]) => items.forEach(item => {
    if (searchText(item).includes(queryText)) matches.push({ type, icon, item });
  }));

  box.classList.remove("d-none");
  box.innerHTML = `
    <div class="card border-0 shadow-sm rounded-4 p-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="fw-bold mb-0">Search results</h6><span class="badge bg-primary">${matches.length}</span>
      </div>
      ${matches.length ? matches.map(m => `
        <button class="search-result-card btn btn-light w-100 text-start mb-2 rounded-3" data-type="${escapeHtml(m.type)}" data-id="${escapeHtml(m.item.id)}">
          <i class="bi ${m.icon} text-primary me-2"></i>
          <strong>${escapeHtml(m.item.title || m.item.name || "Untitled")}</strong>
          <small class="text-muted ms-2">${escapeHtml(m.type)}</small>
        </button>`).join("") : `<div class="text-muted small py-2">Nothing found.</div>`}
    </div>`;

  box.querySelectorAll("[data-id]").forEach(btn => btn.addEventListener("click", () => {
    const type = btn.dataset.type, id = btn.dataset.id;
    if (type === "Memory") viewMemory(id);
    if (type === "Letter") { const x = state.capsules.find(i => i.id === id); if (x) openCapsuleEditor(x); }
    if (type === "Bucket Goal") { const x = state.bucketList.find(i => i.id === id); if (x) openBucketEditor(x); }
    if (type === "Place") { const x = state.places.find(i => i.id === id); if (x) openPlaceEditor(x); }
    if (type === "Countdown") { const x = state.countdowns.find(i => i.id === id); if (x) openCountdownEditor(x); }
  }));
}

$("globalSearch").addEventListener("input", e => { state.search = e.target.value; renderSearch(); });

/* =========================================================
   DELETE HELPER
   ========================================================= */

async function deleteRecord(collectionName, item) {
  try {
    await deleteDoc(doc(db, collectionName, item.id));
    if (item.imagePath) await removeDriveFile(item.imagePath);
    if (item.videoPath) await removeDriveFile(item.videoPath);
    if (item.photoPath) await removeDriveFile(item.photoPath);
  } catch (e) {
    console.error(e);
    alert(`Unable to delete item.\n\n${e.message}`);
  }
}

/* =========================================================
   PREVIEWS + MODAL RESET
   ========================================================= */

$("memImage").addEventListener("change", () => {
  const file = $("memImage").files?.[0];
  const img = $("memoryImagePreview");
  if (!file) { img.classList.add("d-none"); return; }
  img.src = URL.createObjectURL(file); img.classList.remove("d-none");
});

$("memVideo").addEventListener("change", () => {
  const file = $("memVideo").files?.[0];
  const video = $("memoryVideoPreview");
  if (!file) { video.classList.add("d-none"); return; }
  video.src = URL.createObjectURL(file); video.classList.remove("d-none");
});

$("completePhoto").addEventListener("change", () => {
  const file = $("completePhoto").files?.[0];
  const img = $("completePhotoPreview");
  if (!file) { img.classList.add("d-none"); return; }
  img.src = URL.createObjectURL(file); img.classList.remove("d-none");
});

["memoryModal", "capsuleModal", "bucketModal", "addPlaceModal", "addCountdownModal"].forEach(id => {
  $(id).addEventListener("hidden.bs.modal", () => {
    if (id === "memoryModal") {
      $("memoryForm").reset(); $("memoryId").value = ""; resetUploadProgress();
      $("memoryImagePreview").classList.add("d-none"); $("memoryVideoPreview").classList.add("d-none");
    }
    if (id === "capsuleModal") $("capsuleId").value = "";
    if (id === "bucketModal") $("bucketId").value = "";
    if (id === "addPlaceModal") $("placeId").value = "";
    if (id === "addCountdownModal") $("countdownId").value = "";
  });
});

setSyncStatus("online", "Connecting...");

/* =========================================================
   GOOGLE DRIVE UI
   ========================================================= */

$("connectDriveBtn")?.addEventListener("click", async () => {
  const config = getSavedDriveConfig();
  if (!config.clientId || config.clientId.includes("PASTE_YOUR_")) {
    $("googleDriveClientIdInput").value = "";
    $("googleDriveFolderNameInput").value = config.folderName || DRIVE_FOLDER_NAME;
    showModal("driveSetupModal");
    return;
  }

  try {
    const ok = await connectGoogleDrive(true);
    if (ok) setDriveStatus(true, "Connected");
  } catch (error) {
    console.error(error);
    alert(`Unable to connect Google Drive.\n\n${error.message}`);
  }
});

$("saveDriveSetupBtn")?.addEventListener("click", async () => {
  const clientId = $("googleDriveClientIdInput").value.trim();
  const folderName = $("googleDriveFolderNameInput").value.trim() || DRIVE_FOLDER_NAME;

  if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) {
    alert("Enter your Google OAuth Web Client ID.");
    return;
  }

  saveDriveConfig(clientId, folderName);
  driveState.client = null;
  driveState.accessToken = "";
  driveState.folderId = "";

  hideModal("driveSetupModal");

  try {
    initGoogleDriveClient();
    const ok = await connectGoogleDrive(true);
    if (ok) {
      await ensureDriveFolder();
      setDriveStatus(true, "Connected");
    }
  } catch (error) {
    console.error(error);
    alert(`Google Drive setup failed.\n\n${error.message}`);
  }
});

// Wait for Google Identity Services if the script loads after this module.
function waitForGoogleDrive() {
  if (window.google?.accounts?.oauth2) {
    const config = getSavedDriveConfig();
    if (config.clientId && !config.clientId.includes("PASTE_YOUR_")) {
      initGoogleDriveClient();
      setDriveStatus(false, "Ready to connect");
    } else {
      setDriveStatus(false, "Client ID required");
    }
    return;
  }
  setTimeout(waitForGoogleDrive, 250);
}
waitForGoogleDrive();