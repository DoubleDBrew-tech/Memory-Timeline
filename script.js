import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

let loadedMemories = [];

const $ = (id) => document.getElementById(id);

/* =========================================================
   MODAL HELPERS
   ========================================================= */

function showModal(id) {
  const el = $(id);
  if (!el) return;

  if (window.bootstrap?.Modal) {
    window.bootstrap.Modal.getOrCreateInstance(el).show();
  } else {
    // Fallback if Bootstrap JS fails to load
    el.classList.add("show");
    el.style.display = "block";
    el.removeAttribute("aria-hidden");
    document.body.classList.add("modal-open");
  }
}

function hideModal(id) {
  const el = $(id);
  if (!el) return;

  if (window.bootstrap?.Modal) {
    window.bootstrap.Modal.getOrCreateInstance(el).hide();
  } else {
    el.classList.remove("show");
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }
}

/* =========================================================
   SECURITY / URL HELPERS
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeUrl(value) {
  const url = String(value ?? "").trim();

  if (!url) return "";

  try {
    const parsed = new URL(url, window.location.href);

    if (["http:", "https:"].includes(parsed.protocol)) {
      return parsed.href;
    }
  } catch (_) {}

  return "";
}

/* =========================================================
   MANUAL BOOTSTRAP FALLBACKS
   ========================================================= */

function setupManualModalClose() {
  document.querySelectorAll('[data-bs-dismiss="modal"]').forEach((button) => {
    button.addEventListener("click", () => {
      const modal = button.closest(".modal");

      if (modal?.id) {
        hideModal(modal.id);
      }
    });
  });
}

function setupTabsFallback() {
  document
    .querySelectorAll('#appTabs [data-bs-toggle="tab"]')
    .forEach((button) => {

      button.addEventListener("click", () => {
        const target = button.getAttribute("data-bs-target");

        if (!target) return;

        document.querySelectorAll("#appTabs .nav-link").forEach((tab) => {
          tab.classList.toggle("active", tab === button);
        });

        document
          .querySelectorAll("#appTabsContent > .tab-pane")
          .forEach((pane) => {

            const active = `#${pane.id}` === target;

            pane.classList.toggle("show", active);
            pane.classList.toggle("active", active);
          });
      });

    });
}

/* =========================================================
   DIRECT BUTTON HANDLERS
   ========================================================= */

function setupActionButtons() {

  document
    .querySelectorAll('[data-bs-target="#addMemoryModal"]')
    .forEach((button) => {

      button.addEventListener("click", (event) => {
        event.preventDefault();
        showModal("addMemoryModal");
      });

    });

  document
    .querySelectorAll('[data-bs-target="#addCapsuleModal"]')
    .forEach((button) => {

      button.addEventListener("click", (event) => {
        event.preventDefault();
        showModal("addCapsuleModal");
      });

    });

  document
    .querySelectorAll('[data-bs-target="#addBucketModal"]')
    .forEach((button) => {

      button.addEventListener("click", (event) => {
        event.preventDefault();
        showModal("addBucketModal");
      });

    });
}

/* =========================================================
   MEMORY VIEW
   ========================================================= */

function viewMemory(id) {

  const item = loadedMemories.find((memory) => memory.id === id);

  if (!item) return;

  $("memoryModalTitle").textContent =
    item.title || "Untitled";

  $("memoryModalDate").textContent =
    item.date
      ? new Date(`${item.date}T00:00:00`).toLocaleDateString(
          "en-US",
          {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
          }
        )
      : "";

  $("memoryModalNote").textContent =
    item.note || "";

  const image = $("memoryModalImage");
  const imageUrl = safeUrl(item.image);

  if (imageUrl) {

    image.src = imageUrl;
    image.classList.remove("d-none");

  } else {

    image.removeAttribute("src");
    image.classList.add("d-none");

  }

  const audioBox = $("memoryModalAudioContainer");
  const audio = $("memoryModalAudio");
  const audioUrl = safeUrl(item.audio);

  if (audioUrl) {

    audio.src = audioUrl;
    audioBox.classList.remove("d-none");

  } else {

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audioBox.classList.add("d-none");

  }

  showModal("viewMemoryModal");
}

/* =========================================================
   TIMELINE
   ========================================================= */

function renderTimeline(snapshot) {

  const container = $("timelineContainer");

  if (!container) return;

  container.innerHTML = "";
  loadedMemories = [];

  if (snapshot.empty) {

    container.innerHTML =
      '<div class="text-center py-4 text-muted">' +
      'No memories added yet. Tap "Add Memory" to create one!' +
      '</div>';

    return;
  }

  snapshot.forEach((docSnap, index) => {

    const item = {
      id: docSnap.id,
      ...docSnap.data()
    };

    loadedMemories.push(item);

    const side =
      index % 2 === 0
        ? "left"
        : "right";

    const formattedDate =
      item.date
        ? new Date(`${item.date}T00:00:00`).toLocaleDateString(
            "en-US",
            {
              month: "short",
              day: "numeric",
              year: "numeric"
            }
          )
        : "";

    const element =
      document.createElement("div");

    element.className =
      `timeline-item ${side}`;

    const imageUrl =
      safeUrl(item.image);

    element.innerHTML = `
      <div
        class="timeline-node"
        aria-hidden="true">
      </div>

      <button
        type="button"
        class="card card-memory border-0 shadow-sm rounded-4 text-start w-100 p-0"
        aria-label="View ${escapeHtml(item.title || "memory")}">

        ${
          imageUrl
            ? `
              <img
                src="${escapeHtml(imageUrl)}"
                class="card-img-top rounded-top-4"
                style="height:160px;object-fit:cover;"
                alt="">
            `
            : ""
        }

        <div class="card-body">

          <small class="text-primary fw-bold">
            ${escapeHtml(formattedDate)}
          </small>

          <h5 class="card-title fw-bold mt-1 mb-1">
            ${escapeHtml(item.title || "")}
          </h5>

          <p class="card-text text-muted text-truncate mb-0">
            ${escapeHtml(item.note || "")}
          </p>

        </div>

      </button>
    `;

    const card =
      element.querySelector(".card-memory");

    if (card) {
      card.addEventListener("click", () => {
        viewMemory(item.id);
      });
    }

    container.appendChild(element);
  });
}

function startRealtimeListeners() {

  /* -------------------------
     MEMORIES
     ------------------------- */

  const memoriesQuery =
    query(
      collection(db, "memories"),
      orderBy("date", "asc")
    );

  onSnapshot(
    memoriesQuery,
    renderTimeline,
    (err) => {

      console.error(
        "Memories listener error:",
        err
      );

      const container =
        $("timelineContainer");

      if (container) {

        container.innerHTML =
          '<div class="alert alert-warning">' +
          'Could not load memories. Check your Firebase/Firestore configuration and rules.' +
          '</div>';

      }

    }
  );

  /* -------------------------
     CAPSULES
     ------------------------- */

  const capsulesQuery =
    query(
      collection(db, "capsules"),
      orderBy("unlockDate", "asc")
    );

  onSnapshot(
    capsulesQuery,
    (snapshot) => {

      const container =
        $("capsuleContainer");

      if (!container) return;

      container.innerHTML = "";

      const today =
        new Date();

      today.setHours(
        0,
        0,
        0,
        0
      );

      if (snapshot.empty) {

        container.innerHTML =
          '<div class="col-12 text-center text-muted py-4">' +
          'No capsules created yet.' +
          '</div>';

        return;
      }

      snapshot.forEach((docSnap) => {

        const item =
          docSnap.data();

        const unlockDate =
          new Date(
            `${item.unlockDate}T00:00:00`
          );

        unlockDate.setHours(
          0,
          0,
          0,
          0
        );

        const isUnlocked =
          today >= unlockDate;

        const daysLeft =
          Math.max(
            0,
            Math.ceil(
              (unlockDate - today) /
              86400000
            )
          );

        const col =
          document.createElement("div");

        col.className =
          "col-md-6 col-lg-4";

        if (isUnlocked) {

          col.innerHTML = `
            <div class="card capsule-card unlocked shadow-sm rounded-4 h-100 p-3">

              <div class="card-body p-0 d-flex flex-column">

                <div class="d-flex justify-content-between align-items-center mb-2">

                  <span class="badge bg-success">
                    <i class="bi bi-unlock me-1"></i>
                    Unlocked
                  </span>

                  <small class="text-muted">
                    ${escapeHtml(item.unlockDate)}
                  </small>

                </div>

                <h5 class="fw-bold mb-2">
                  ${escapeHtml(item.title)}
                </h5>

                <p
                  class="card-text text-secondary flex-grow-1"
                  style="white-space:pre-line;">

                  ${escapeHtml(item.content)}

                </p>

              </div>

            </div>
          `;

        } else {

          col.innerHTML = `
            <div class="card capsule-card locked shadow-sm rounded-4 h-100 p-3 text-center">

              <div class="card-body p-0 d-flex flex-column justify-content-center align-items-center">

                <i class="bi bi-lock-fill display-5 text-secondary mb-2"></i>

                <h5 class="fw-bold">
                  ${escapeHtml(item.title)}
                </h5>

                <small class="text-muted mb-2">
                  Unlocks: ${escapeHtml(item.unlockDate)}
                </small>

                <span class="badge bg-danger rounded-pill px-3 py-2">
                  ${daysLeft} day(s) left
                </span>

              </div>

            </div>
          `;

        }

        container.appendChild(col);

      });

    },

    (err) => {
      console.error(
        "Capsules listener error:",
        err
      );
    }
  );

  /* -------------------------
     BUCKET LIST
     ------------------------- */

  const bucketQuery =
    query(
      collection(db, "bucketList"),
      orderBy("createdAt", "desc")
    );

  onSnapshot(
    bucketQuery,
    (snapshot) => {

      const container =
        $("bucketListContainer");

      if (!container) return;

      container.innerHTML = "";

      if (snapshot.empty) {

        container.innerHTML =
          '<div class="col-12 text-center text-muted py-4">' +
          'No bucket list items added yet.' +
          '</div>';

        return;
      }

      snapshot.forEach((docSnap) => {

        const item = {
          id: docSnap.id,
          ...docSnap.data()
        };

        const col =
          document.createElement("div");

        col.className =
          "col-md-6";

        const photoUrl =
          safeUrl(item.photo);

        col.innerHTML = `
          <div class="card border-0 shadow-sm rounded-4 h-100 p-3">

            <div class="card-body p-0 d-flex align-items-start gap-3">

              <input
                class="form-check-input fs-5 mt-1 bucket-check"
                type="checkbox"
                ${item.completed ? "checked disabled" : ""}
                aria-label="Complete ${escapeHtml(item.title || "goal")}">

              <div class="flex-grow-1">

                <span class="badge bg-light text-dark border mb-1">
                  ${escapeHtml(item.category)}
                </span>

                <h6 class="fw-bold m-0 ${
                  item.completed
                    ? "text-decoration-line-through text-muted"
                    : ""
                }">

                  ${escapeHtml(item.title)}

                </h6>

                ${
                  item.completed && photoUrl
                    ? `
                      <img
                        src="${escapeHtml(photoUrl)}"
                        class="img-fluid rounded-3 mt-3 w-100"
                        style="max-height:180px;object-fit:cover;"
                        alt="">
                    `
                    : ""
                }

              </div>

            </div>

          </div>
        `;

        const checkbox =
          col.querySelector(".bucket-check");

        if (!item.completed) {

          checkbox?.addEventListener(
            "change",
            () => {

              $("completeBucketId").value =
                item.id;

              showModal(
                "completeBucketModal"
              );

            }
          );

        }

        container.appendChild(col);

      });

    },

    (err) => {
      console.error(
        "Bucket list listener error:",
        err
      );
    }
  );
}

/* =========================================================
   FORM: MEMORY
   ========================================================= */

async function addMemory(e) {

  e.preventDefault();

  const btn =
    $("saveMemoryBtn");

  if (btn) {
    btn.disabled = true;
  }

  try {

    await addDoc(
      collection(db, "memories"),
      {
        title:
          $("memTitle")?.value.trim() || "",

        date:
          $("memDate")?.value || "",

        image:
          $("memImage")?.value.trim() || "",

        audio:
          $("memAudio")?.value.trim() || "",

        note:
          $("memNote")?.value.trim() || "",

        createdAt:
          serverTimestamp()
      }
    );

    e.target.reset();

    hideModal(
      "addMemoryModal"
    );

  } catch (err) {

    console.error(
      "Error saving memory:",
      err
    );

    alert(
      `Unable to save memory.\n\n${
        err.message ||
        "Check your Firestore rules."
      }`
    );

  } finally {

    if (btn) {
      btn.disabled = false;
    }

  }
}

/* =========================================================
   FORM: CAPSULE
   ========================================================= */

async function addCapsule(e) {

  e.preventDefault();

  const button =
    e.submitter;

  if (button) {
    button.disabled = true;
  }

  try {

    await addDoc(
      collection(db, "capsules"),
      {
        title:
          $("capTitle").value.trim(),

        unlockDate:
          $("capUnlockDate").value,

        content:
          $("capContent").value.trim(),

        createdAt:
          serverTimestamp()
      }
    );

    e.target.reset();

    hideModal(
      "addCapsuleModal"
    );

  } catch (err) {

    console.error(
      "Error creating capsule:",
      err
    );

    alert(
      `Unable to create capsule.\n\n${
        err.message || ""
      }`
    );

  } finally {

    if (button) {
      button.disabled = false;
    }

  }
}

/* =========================================================
   FORM: BUCKET
   ========================================================= */

async function addBucket(e) {

  e.preventDefault();

  const button =
    e.submitter;

  if (button) {
    button.disabled = true;
  }

  try {

    await addDoc(
      collection(db, "bucketList"),
      {
        title:
          $("bucketTitle").value.trim(),

        category:
          $("bucketCategory").value,

        completed:
          false,

        photo:
          "",

        createdAt:
          serverTimestamp()
      }
    );

    e.target.reset();

    hideModal(
      "addBucketModal"
    );

  } catch (err) {

    console.error(
      "Error adding bucket goal:",
      err
    );

    alert(
      `Unable to add goal.\n\n${
        err.message || ""
      }`
    );

  } finally {

    if (button) {
      button.disabled = false;
    }

  }
}

/* =========================================================
   FORM: COMPLETE BUCKET
   ========================================================= */

async function completeBucket(e) {

  e.preventDefault();

  const id =
    $("completeBucketId").value;

  if (!id) return;

  const button =
    e.submitter;

  if (button) {
    button.disabled = true;
  }

  try {

    await updateDoc(
      doc(
        db,
        "bucketList",
        id
      ),
      {
        completed:
          true,

        photo:
          $("completePhotoUrl")
            .value
            .trim()
      }
    );

    e.target.reset();

    $("completeBucketId").value =
      "";

    hideModal(
      "completeBucketModal"
    );

  } catch (err) {

    console.error(
      "Error completing goal:",
      err
    );

    alert(
      `Unable to complete goal.\n\n${
        err.message || ""
      }`
    );

  } finally {

    if (button) {
      button.disabled = false;
    }

  }
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

function init() {

  setupManualModalClose();

  setupTabsFallback();

  setupActionButtons();

  $("memoryForm")
    ?.addEventListener(
      "submit",
      addMemory
    );

  $("capsuleForm")
    ?.addEventListener(
      "submit",
      addCapsule
    );

  $("bucketForm")
    ?.addEventListener(
      "submit",
      addBucket
    );

  $("completeBucketForm")
    ?.addEventListener(
      "submit",
      completeBucket
    );

  startRealtimeListeners();
}

if (
  document.readyState === "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    init,
    { once: true }
  );

} else {

  init();

}