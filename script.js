import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

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

import {
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";


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

const storage = getStorage(app);

let loadedMemories = [];


/* =========================================================
   HELPERS
   ========================================================= */

const $ = (id) =>
  document.getElementById(id);


function showModal(id) {

  const el = $(id);

  if (!el) return;

  if (window.bootstrap?.Modal) {

    window.bootstrap.Modal
      .getOrCreateInstance(el)
      .show();

  }

}


function hideModal(id) {

  const el = $(id);

  if (!el) return;

  if (window.bootstrap?.Modal) {

    window.bootstrap.Modal
      .getOrCreateInstance(el)
      .hide();

  }

}


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

    const parsed =
      new URL(
        url,
        window.location.href
      );

    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    ) {

      return parsed.href;

    }

  } catch (_) {}

  return "";

}


/* =========================================================
   SYNC STATUS
   ========================================================= */

function setSyncStatus(
  status,
  text
) {

  const dot =
    $("syncIndicator");

  const label =
    $("syncStatusText");

  if (!dot || !label) return;

  dot.className =
    "sync-dot " + status;

  label.textContent =
    text;

}


/* =========================================================
   IMAGE UPLOAD
   ========================================================= */

async function uploadImage(
  file,
  folder,
  onProgress
) {
  if (!file) return "";

  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file.");
  }

  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Image is too large. Please choose an image under 25 MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
  const storageRef = ref(storage, `${folder}/${fileName}`);

  if (!onProgress) {
    await uploadBytes(storageRef, file, { contentType: file.type });
    return await getDownloadURL(storageRef);
  }

  return await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on(
      "state_changed",
      snapshot => {
        onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(storageRef));
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}


/* =========================================================
   IMAGE PREVIEW
   ========================================================= */

function setupImagePreview(
  inputId,
  imageId,
  containerId
) {

  const input =
    $(inputId);

  const image =
    $(imageId);

  const container =
    $(containerId);

  if (
    !input ||
    !image ||
    !container
  ) return;

  input.addEventListener(
    "change",
    () => {

      const file =
        input.files?.[0];

      if (!file) {

        image.removeAttribute(
          "src"
        );

        container.classList.add(
          "d-none"
        );

        return;

      }

      const reader =
        new FileReader();

      reader.onload = (event) => {

        image.src =
          event.target.result;

        container.classList.remove(
          "d-none"
        );

      };

      reader.readAsDataURL(
        file
      );

    }
  );

}


/* =========================================================
   MEMORY VIEW
   ========================================================= */

function viewMemory(id) {

  const item =
    loadedMemories.find(
      memory =>
        memory.id === id
    );

  if (!item) return;


  $("memoryModalTitle")
    .textContent =
    item.title ||
    "Untitled";


  $("memoryModalDate")
    .textContent =
    item.date
      ? new Date(
          `${item.date}T00:00:00`
        ).toLocaleDateString(
          "en-US",
          {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
          }
        )
      : "";


  $("memoryModalNote")
    .textContent =
    item.note || "";


  const image =
    $("memoryModalImage");

  const imageUrl =
    safeUrl(item.image);


  if (imageUrl) {

    image.src =
      imageUrl;

    image.classList.remove(
      "d-none"
    );

  } else {

    image.removeAttribute(
      "src"
    );

    image.classList.add(
      "d-none"
    );

  }


  const audioBox =
    $("memoryModalAudioContainer");

  const audio =
    $("memoryModalAudio");

  const audioUrl =
    safeUrl(item.audio);


  if (audioUrl) {

    audio.src =
      audioUrl;

    audioBox.classList.remove(
      "d-none"
    );

  } else {

    audio.pause();

    audio.removeAttribute(
      "src"
    );

    audio.load();

    audioBox.classList.add(
      "d-none"
    );

  }


  showModal(
    "viewMemoryModal"
  );

}


/* =========================================================
   REALTIME TIMELINE
   ========================================================= */

const memoriesQuery =
  query(
    collection(
      db,
      "memories"
    ),
    orderBy(
      "date",
      "asc"
    )
  );


onSnapshot(

  memoriesQuery,

  snapshot => {

    const container =
      $("timelineContainer");

    if (!container) return;

    container.innerHTML =
      "";

    loadedMemories =
      [];


    if (snapshot.empty) {

      container.innerHTML =
        `
          <div class="text-center py-4 text-muted">
            No memories added yet.
            Tap "Add Memory" to create one!
          </div>
        `;

      setSyncStatus(
        "online",
        "Synced"
      );

      return;

    }


    snapshot.forEach(
      (docSnap, index) => {

        const item = {
          id:
            docSnap.id,
          ...docSnap.data()
        };

        loadedMemories.push(
          item
        );


        const side =
          index % 2 === 0
            ? "left"
            : "right";


        const formattedDate =
          item.date
            ? new Date(
                `${item.date}T00:00:00`
              ).toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                }
              )
            : "";


        const imageUrl =
          safeUrl(
            item.image
          );


        const element =
          document.createElement(
            "div"
          );

        element.className =
          `timeline-item ${side}`;


        element.innerHTML =
          `
            <div
              class="timeline-node"
              aria-hidden="true">
            </div>

            <button
              type="button"
              class="card card-memory border-0 shadow-sm rounded-4 text-start w-100 p-0"
            >

              ${
                imageUrl
                  ? `
                    <img
                      src="${escapeHtml(imageUrl)}"
                      class="card-img-top rounded-top-4"
                      style="height:160px;object-fit:cover;"
                      alt=""
                    >
                  `
                  : ""
              }

              <div class="card-body">

                <small class="text-primary fw-bold">
                  ${escapeHtml(formattedDate)}
                </small>

                <h5 class="card-title fw-bold mt-1 mb-1">
                  ${escapeHtml(
                    item.title || ""
                  )}
                </h5>

                <p class="card-text text-muted text-truncate mb-0">
                  ${escapeHtml(
                    item.note || ""
                  )}
                </p>

              </div>

            </button>
          `;


        const card =
          element.querySelector(
            ".card-memory"
          );


        card.addEventListener(
          "click",
          () =>
            viewMemory(
              item.id
            )
        );


        container.appendChild(
          element
        );

      }
    );


    setSyncStatus(
      "online",
      "Synced"
    );

  },

  error => {

    console.error(
      "Memory realtime error:",
      error
    );

    setSyncStatus(
      "error",
      "Sync error"
    );

  }

);


/* =========================================================
   CAPSULES REALTIME
   ========================================================= */

const capsulesQuery =
  query(
    collection(
      db,
      "capsules"
    ),
    orderBy(
      "unlockDate",
      "asc"
    )
  );


onSnapshot(
  capsulesQuery,
  snapshot => {

    const container =
      $("capsuleContainer");

    if (!container) return;

    container.innerHTML =
      "";


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
        `
          <div class="col-12 text-center text-muted py-4">
            No capsules created yet.
          </div>
        `;

      return;

    }


    snapshot.forEach(
      docSnap => {

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
              (
                unlockDate -
                today
              ) /
              86400000
            )
          );


        const col =
          document.createElement(
            "div"
          );

        col.className =
          "col-md-6 col-lg-4";


        if (isUnlocked) {

          col.innerHTML =
            `
              <div class="card capsule-card unlocked shadow-sm rounded-4 h-100 p-3">

                <div class="card-body p-0 d-flex flex-column">

                  <div class="d-flex justify-content-between align-items-center mb-2">

                    <span class="badge bg-success">
                      <i class="bi bi-unlock me-1"></i>
                      Unlocked
                    </span>

                    <small class="text-muted">
                      ${escapeHtml(
                        item.unlockDate
                      )}
                    </small>

                  </div>

                  <h5 class="fw-bold mb-2">
                    ${escapeHtml(
                      item.title
                    )}
                  </h5>

                  <p
                    class="card-text text-secondary flex-grow-1"
                    style="white-space:pre-line;"
                  >
                    ${escapeHtml(
                      item.content
                    )}
                  </p>

                </div>

              </div>
            `;

        } else {

          col.innerHTML =
            `
              <div class="card capsule-card locked shadow-sm rounded-4 h-100 p-3 text-center">

                <div class="card-body p-0 d-flex flex-column justify-content-center align-items-center">

                  <i class="bi bi-lock-fill display-5 text-secondary mb-2"></i>

                  <h5 class="fw-bold">
                    ${escapeHtml(
                      item.title
                    )}
                  </h5>

                  <small class="text-muted mb-2">
                    Unlocks:
                    ${escapeHtml(
                      item.unlockDate
                    )}
                  </small>

                  <span class="badge bg-danger rounded-pill px-3 py-2">
                    ${daysLeft}
                    day(s) left
                  </span>

                </div>

              </div>
            `;

        }


        container.appendChild(
          col
        );

      }
    );

  },

  error => {

    console.error(
      "Capsule realtime error:",
      error
    );

  }
);


/* =========================================================
   BUCKET LIST REALTIME
   ========================================================= */

const bucketQuery =
  query(
    collection(
      db,
      "bucketList"
    ),
    orderBy(
      "createdAt",
      "desc"
    )
  );


onSnapshot(
  bucketQuery,
  snapshot => {

    const container =
      $("bucketListContainer");

    if (!container) return;

    container.innerHTML =
      "";


    if (snapshot.empty) {

      container.innerHTML =
        `
          <div class="col-12 text-center text-muted py-4">
            No bucket list items added yet.
          </div>
        `;

      return;

    }


    snapshot.forEach(
      docSnap => {

        const item = {
          id:
            docSnap.id,
          ...docSnap.data()
        };


        const col =
          document.createElement(
            "div"
          );

        col.className =
          "col-md-6";


        const photoUrl =
          safeUrl(
            item.photo
          );


        col.innerHTML =
          `
            <div class="card border-0 shadow-sm rounded-4 h-100 p-3">

              <div class="card-body p-0 d-flex align-items-start gap-3">

                <input
                  class="form-check-input fs-5 mt-1 bucket-check"
                  type="checkbox"
                  ${
                    item.completed
                      ? "checked disabled"
                      : ""
                  }
                >

                <div class="flex-grow-1">

                  <span class="badge bg-light text-dark border mb-1">
                    ${escapeHtml(
                      item.category
                    )}
                  </span>

                  <h6 class="fw-bold m-0 ${
                    item.completed
                      ? "text-decoration-line-through text-muted"
                      : ""
                  }">

                    ${escapeHtml(
                      item.title
                    )}

                  </h6>

                  ${
                    item.completed &&
                    photoUrl
                      ? `
                        <img
                          src="${escapeHtml(photoUrl)}"
                          class="img-fluid rounded-3 mt-3 w-100"
                          style="max-height:180px;object-fit:cover;"
                          alt=""
                        >
                      `
                      : ""
                  }

                </div>

              </div>

            </div>
          `;


        const checkbox =
          col.querySelector(
            ".bucket-check"
          );


        if (
          !item.completed
        ) {

          checkbox.addEventListener(
            "change",
            () => {

              $("completeBucketId")
                .value =
                item.id;

              showModal(
                "completeBucketModal"
              );

            }
          );

        }


        container.appendChild(
          col
        );

      }
    );

  },

  error => {

    console.error(
      "Bucket realtime error:",
      error
    );

  }
);


/* =========================================================
   SAVE MEMORY
   ========================================================= */

$("memoryForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const button =
        $("saveMemoryBtn");


      button.disabled =
        true;


      button.innerHTML =
        `
          <span
            class="spinner-border spinner-border-sm me-2">
          </span>

          Uploading...
        `;


      try {

        const file =
          $("memImage")
            .files?.[0];


        let imageUrl =
          "";


        if (file) {

          imageUrl =
            await uploadImage(
              file,
              "memories"
            );

        }


        await addDoc(
          collection(
            db,
            "memories"
          ),
          {

            title:
              $("memTitle")
                .value
                .trim(),

            date:
              $("memDate")
                .value,

            image:
              imageUrl,

            audio:
              $("memAudio")
                .value
                .trim(),

            note:
              $("memNote")
                .value
                .trim(),

            createdAt:
              serverTimestamp()

          }
        );


        event.target.reset();


        $(
          "memoryImagePreviewContainer"
        )
          .classList.add(
            "d-none"
          );


        hideModal(
          "addMemoryModal"
        );


      } catch (error) {

        console.error(
          "Error saving memory:",
          error
        );


        alert(
          "Unable to save memory.\n\n" +
          error.message
        );


      } finally {

        button.disabled =
          false;

        button.innerHTML =
          `
            <i class="bi bi-cloud-arrow-up me-1"></i>
            Save Memory
          `;

      }

    }
  );


/* =========================================================
   ADD CAPSULE
   ========================================================= */

$("capsuleForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const button =
        event.submitter;

      button.disabled =
        true;


      try {

        await addDoc(
          collection(
            db,
            "capsules"
          ),
          {

            title:
              $("capTitle")
                .value
                .trim(),

            unlockDate:
              $("capUnlockDate")
                .value,

            content:
              $("capContent")
                .value
                .trim(),

            createdAt:
              serverTimestamp()

          }
        );


        event.target.reset();

        hideModal(
          "addCapsuleModal"
        );


      } catch (error) {

        console.error(
          error
        );

        alert(
          "Unable to create capsule.\n\n" +
          error.message
        );


      } finally {

        button.disabled =
          false;

      }

    }
  );


/* =========================================================
   ADD BUCKET
   ========================================================= */

$("bucketForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const button =
        event.submitter;

      button.disabled =
        true;


      try {

        await addDoc(
          collection(
            db,
            "bucketList"
          ),
          {

            title:
              $("bucketTitle")
                .value
                .trim(),

            category:
              $("bucketCategory")
                .value,

            completed:
              false,

            photo:
              "",

            createdAt:
              serverTimestamp()

          }
        );


        event.target.reset();

        hideModal(
          "addBucketModal"
        );


      } catch (error) {

        console.error(
          error
        );

        alert(
          "Unable to add goal.\n\n" +
          error.message
        );


      } finally {

        button.disabled =
          false;

      }

    }
  );


/* =========================================================
   COMPLETE BUCKET + UPLOAD PHOTO
   ========================================================= */

$("completeBucketForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const id =
        $("completeBucketId")
          .value;


      if (!id) return;


      const button =
        event.submitter;

      button.disabled =
        true;


      try {

        const file =
          $("completePhoto")
            .files?.[0];


        let photoUrl =
          "";


        if (file) {

          button.innerHTML =
            `
              <span
                class="spinner-border spinner-border-sm me-2">
              </span>

              Uploading...
            `;


          photoUrl =
            await uploadImage(
              file,
              "bucket-completions"
            );

        }


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
              photoUrl

          }
        );


        event.target.reset();

        $("completeBucketId")
          .value =
          "";


        $("completePhotoPreviewContainer")
          .classList.add(
            "d-none"
          );


        hideModal(
          "completeBucketModal"
        );


      } catch (error) {

        console.error(
          error
        );

        alert(
          "Unable to complete goal.\n\n" +
          error.message
        );


      } finally {

        button.disabled =
          false;

        button.innerHTML =
          `
            <i class="bi bi-check-lg me-1"></i>
            Mark Complete
          `;

      }

    }
  );


/* =========================================================
   IMAGE PREVIEWS
   ========================================================= */

setupImagePreview(
  "memImage",
  "memoryImagePreview",
  "memoryImagePreviewContainer"
);


setupImagePreview(
  "completePhoto",
  "completePhotoPreview",
  "completePhotoPreviewContainer"
);


/* =========================================================
   REMOVE MEMORY PHOTO
   ========================================================= */

$("removeMemoryImage")
  ?.addEventListener(
    "click",
    () => {

      $("memImage")
        .value =
        "";

      $("memoryImagePreview")
        .removeAttribute(
          "src"
        );

      $("memoryImagePreviewContainer")
        .classList.add(
          "d-none"
        );

    }
  );


/* =========================================================
   MODAL CLOSE BUTTONS
   ========================================================= */

document
  .querySelectorAll(
    '[data-bs-dismiss="modal"]'
  )
  .forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const modal =
            button.closest(
              ".modal"
            );

          if (
            modal?.id
          ) {

            hideModal(
              modal.id
            );

          }

        }
      );

    }
  );

/* =========================================================
   ADDED FEATURES
   The original project code above is intentionally preserved.
   This layer adds CRUD, video uploads, gallery, search,
   letters, places, countdowns and achievements.
   ========================================================= */

const featureState = {
  letters: [],
  places: [],
  countdowns: []
};

function featureFormatDate(value) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function featureConfirm(message) {
  return window.confirm(message);
}

async function featureDeleteStoragePath(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (_) {
    // Existing files may not have a saved storage path.
  }
}

/* -------------------------
   MEMORY EDIT / DELETE
   ------------------------- */

function featureOpenMemoryEditor(item) {
  $("memTitle").value = item.title || "";
  $("memDate").value = item.date || "";
  $("memAudio").value = item.audio || "";
  $("memNote").value = item.note || "";
  $("memoryForm").dataset.editingId = item.id;
  $("memoryForm").dataset.editingImage = item.image || "";
  $("memoryForm").dataset.editingImagePath = item.imagePath || "";
  $("memoryForm").dataset.editingVideo = item.video || "";
  $("memoryForm").dataset.editingVideoPath = item.videoPath || "";

  const title = document.querySelector("#addMemoryModal .modal-title");
  if (title) title.textContent = "Edit Memory";
  const save = $("saveMemoryBtn");
  if (save) save.innerHTML = '<i class="bi bi-save me-1"></i> Save Changes';

  showModal("addMemoryModal");
}

async function featureDeleteMemory(item) {
  if (!featureConfirm(`Delete "${item.title || "this memory"}"?`)) return;

  if (item.imagePath) await featureDeleteStoragePath(item.imagePath);
  if (item.videoPath) await featureDeleteStoragePath(item.videoPath);

  await deleteDoc(doc(db, "memories", item.id));
}

/* Intercept the existing memory form only when it is in edit mode.
   Normal "Add Memory" continues through the original handler. */
$("memoryForm")?.addEventListener("submit", async event => {
  const id = $("memoryForm").dataset.editingId;
  if (!id) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const button = $("saveMemoryBtn");
  button.disabled = true;

  try {
    const old = loadedMemories.find(x => x.id === id) || {};

    let image = $("memoryForm").dataset.editingImage || old.image || "";
    let imagePath = $("memoryForm").dataset.editingImagePath || old.imagePath || "";
    let video = $("memoryForm").dataset.editingVideo || old.video || "";
    let videoPath = $("memoryForm").dataset.editingVideoPath || old.videoPath || "";

    const imageFile = $("memImage")?.files?.[0];
    const videoFile = $("memVideo")?.files?.[0];

    if (imageFile) {
      const oldPath = imagePath;
      image = await uploadImage(imageFile, "memories", p => {
        const bar = $("memoryVideoProgressBar");
        const box = $("memoryVideoProgress");
        if (box && bar) {
          box.classList.remove("d-none");
          bar.style.width = `${p}%`;
          bar.textContent = `Photo ${p}%`;
        }
      });
      imagePath = "";
      if (oldPath) await featureDeleteStoragePath(oldPath);
    }

    if (videoFile) {
      const oldPath = videoPath;
      const safeName = videoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
      const storageRef = ref(storage, `memories/videos/${fileName}`);

      if (videoFile.size > 500 * 1024 * 1024) {
        throw new Error("Video is too large. Maximum supported size is 500 MB.");
      }

      const box = $("memoryVideoProgress");
      const bar = $("memoryVideoProgressBar");
      box?.classList.remove("d-none");

      const result = await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, videoFile, { contentType: videoFile.type });
        task.on(
          "state_changed",
          snapshot => {
            const p = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            if (bar) {
              bar.style.width = `${p}%`;
              bar.textContent = `Video ${p}%`;
            }
          },
          reject,
          async () => resolve(await getDownloadURL(storageRef))
        );
      });

      video = result;
      videoPath = `memories/videos/${fileName}`;
      if (oldPath) await featureDeleteStoragePath(oldPath);
    }

    await updateDoc(doc(db, "memories", id), {
      title: $("memTitle").value.trim(),
      date: $("memDate").value,
      image,
      imagePath,
      video,
      videoPath,
      audio: $("memAudio").value.trim(),
      note: $("memNote").value.trim(),
      updatedAt: serverTimestamp()
    });

    $("memoryForm").reset();
    delete $("memoryForm").dataset.editingId;
    delete $("memoryForm").dataset.editingImage;
    delete $("memoryForm").dataset.editingImagePath;
    delete $("memoryForm").dataset.editingVideo;
    delete $("memoryForm").dataset.editingVideoPath;

    const title = document.querySelector("#addMemoryModal .modal-title");
    if (title) title.textContent = "Add New Memory";
    button.innerHTML = '<i class="bi bi-cloud-arrow-up me-1"></i> Save Memory';
    hideModal("addMemoryModal");
  } catch (error) {
    alert(`Unable to update memory.\n\n${error.message}`);
  } finally {
    button.disabled = false;
  }
}, true);

/* Add edit/delete controls to the original timeline cards after Firebase renders them. */
function featureDecorateMemoryCards() {
  document.querySelectorAll("#timelineContainer .timeline-item").forEach((row, index) => {
    if (row.querySelector(".feature-memory-actions")) return;
    const item = loadedMemories[index];
    if (!item) return;

    const card = row.querySelector(".card-memory");
    if (!card) return;

    const body = card.querySelector(".card-body");
    if (!body) return;

    const actions = document.createElement("div");
    actions.className = "feature-action-row feature-memory-actions";
    actions.innerHTML = `
      <button type="button" class="btn btn-sm btn-outline-primary">Edit</button>
      <button type="button" class="btn btn-sm btn-outline-danger">Delete</button>
    `;
    actions.children[0].onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      featureOpenMemoryEditor(item);
    };
    actions.children[1].onclick = async e => {
      e.preventDefault();
      e.stopPropagation();
      await featureDeleteMemory(item);
    };
    body.appendChild(actions);

    // Video thumbnail/player for memories added with the new uploader.
    if (item.video && !card.querySelector(".feature-memory-video")) {
      const video = document.createElement("video");
      video.className = "feature-memory-video w-100";
      video.controls = true;
      video.preload = "metadata";
      video.src = safeUrl(item.video);
      video.style.height = "180px";
      video.style.objectFit = "cover";
      card.insertBefore(video, body);
    }
  });
}

new MutationObserver(featureDecorateMemoryCards).observe($("timelineContainer"), { childList: true, subtree: true });

/* -------------------------
   EXISTING CAPSULE CRUD
   ------------------------- */

function featureDecorateCapsules() {
  document.querySelectorAll("#capsuleContainer .card").forEach((card, index) => {
    if (card.querySelector(".feature-capsule-actions")) return;

    const cards = Array.from(document.querySelectorAll("#capsuleContainer .card"));
    const item = featureCapsuleCache[index];
    if (!item) return;

    const body = card.querySelector(".card-body");
    if (!body) return;

    const actions = document.createElement("div");
    actions.className = "feature-action-row feature-capsule-actions";
    actions.innerHTML = `
      <button type="button" class="btn btn-sm btn-outline-danger">Edit</button>
      <button type="button" class="btn btn-sm btn-outline-secondary">Delete</button>
    `;
    actions.children[0].onclick = () => featureOpenCapsuleEditor(item);
    actions.children[1].onclick = async () => {
      if (featureConfirm("Delete this capsule?")) await deleteDoc(doc(db, "capsules", item.id));
    };
    body.appendChild(actions);
  });
}
let featureCapsuleCache = [];

function featureOpenCapsuleEditor(item) {
  $("capTitle").value = item.title || "";
  $("capUnlockDate").value = item.unlockDate || "";
  $("capContent").value = item.content || "";
  $("capsuleForm").dataset.editingId = item.id;
  const title = document.querySelector("#addCapsuleModal .modal-title");
  if (title) title.textContent = "Edit Time Capsule";
  const button = document.querySelector("#capsuleForm button[type=submit]");
  if (button) button.innerHTML = '<i class="bi bi-save me-1"></i> Save Changes';
  showModal("addCapsuleModal");
}

$("capsuleForm")?.addEventListener("submit", async event => {
  const id = $("capsuleForm").dataset.editingId;
  if (!id) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const button = event.submitter;
  button.disabled = true;
  try {
    await updateDoc(doc(db, "capsules", id), {
      title: $("capTitle").value.trim(),
      unlockDate: $("capUnlockDate").value,
      content: $("capContent").value.trim(),
      updatedAt: serverTimestamp()
    });
    $("capsuleForm").reset();
    delete $("capsuleForm").dataset.editingId;
    const title = document.querySelector("#addCapsuleModal .modal-title");
    if (title) title.textContent = "Create Time Capsule";
    hideModal("addCapsuleModal");
  } catch (error) {
    alert(`Unable to update capsule.\n\n${error.message}`);
  } finally {
    button.disabled = false;
  }
}, true);

/* -------------------------
   EXISTING BUCKET CRUD
   ------------------------- */

let featureBucketCache = [];

function featureDecorateBuckets() {
  document.querySelectorAll("#bucketListContainer .col-md-6").forEach((col, index) => {
    if (col.querySelector(".feature-bucket-actions")) return;
    const item = featureBucketCache[index];
    if (!item) return;

    const body = col.querySelector(".card-body");
    if (!body) return;

    const actions = document.createElement("div");
    actions.className = "feature-action-row feature-bucket-actions";
    actions.innerHTML = `
      <button type="button" class="btn btn-sm btn-outline-primary">Edit</button>
      <button type="button" class="btn btn-sm btn-outline-danger">Delete</button>
    `;
    actions.children[0].onclick = () => featureOpenBucketEditor(item);
    actions.children[1].onclick = async () => {
      if (featureConfirm("Delete this bucket goal?")) {
        await deleteDoc(doc(db, "bucketList", item.id));
      }
    };
    body.appendChild(actions);
  });
}

function featureOpenBucketEditor(item) {
  $("bucketTitle").value = item.title || "";
  $("bucketCategory").value = item.category || "Travel";
  $("bucketForm").dataset.editingId = item.id;
  const title = document.querySelector("#addBucketModal .modal-title");
  if (title) title.textContent = "Edit Bucket Goal";
  showModal("addBucketModal");
}

$("bucketForm")?.addEventListener("submit", async event => {
  const id = $("bucketForm").dataset.editingId;
  if (!id) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const button = event.submitter;
  button.disabled = true;
  try {
    const old = featureBucketCache.find(x => x.id === id) || {};
    await updateDoc(doc(db, "bucketList", id), {
      title: $("bucketTitle").value.trim(),
      category: $("bucketCategory").value,
      completed: old.completed || false,
      photo: old.photo || "",
      updatedAt: serverTimestamp()
    });
    $("bucketForm").reset();
    delete $("bucketForm").dataset.editingId;
    const title = document.querySelector("#addBucketModal .modal-title");
    if (title) title.textContent = "Add Bucket Goal";
    hideModal("addBucketModal");
  } catch (error) {
    alert(`Unable to update goal.\n\n${error.message}`);
  } finally {
    button.disabled = false;
  }
}, true);

/* -------------------------
   NEW LETTERS
   ------------------------- */

function featureListenLetters() {
  const q = query(collection(db, "letters"), orderBy("createdAt", "desc"));
  onSnapshot(q, snapshot => {
    featureState.letters = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    featureRenderLetters();
    featureRenderAllExtras();
  }, error => console.error("Letters realtime error:", error));
}

function featureRenderLetters() {
  const c = $("lettersContainer");
  if (!c) return;
  c.innerHTML = featureState.letters.length ? "" : `<div class="col-12 text-center text-muted py-5">No letters yet.</div>`;

  featureState.letters.forEach(item => {
    const col = document.createElement("div");
    col.className = "col-md-6";
    col.innerHTML = `
      <div class="card border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="card-body">
          <span class="badge bg-danger-subtle text-danger mb-2">Letter</span>
          <h5 class="fw-bold">${escapeHtml(item.title || "")}</h5>
          <p style="white-space:pre-line">${escapeHtml(item.content || "")}</p>
          <div class="feature-action-row">
            <button type="button" class="btn btn-sm btn-outline-danger edit-letter">Edit</button>
            <button type="button" class="btn btn-sm btn-outline-secondary delete-letter">Delete</button>
          </div>
        </div>
      </div>`;
    col.querySelector(".edit-letter").onclick = () => {
      $("featureLetterId").value = item.id;
      $("featureLetterTitle").value = item.title || "";
      $("featureLetterContent").value = item.content || "";
      showModal("featureLetterModal");
    };
    col.querySelector(".delete-letter").onclick = async () => {
      if (featureConfirm("Delete this letter?")) await deleteDoc(doc(db, "letters", item.id));
    };
    c.appendChild(col);
  });
}

$("featureLetterForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("featureLetterId").value;
  const data = {
    title: $("featureLetterTitle").value.trim(),
    content: $("featureLetterContent").value.trim(),
    updatedAt: serverTimestamp()
  };
  if (id) await updateDoc(doc(db, "letters", id), data);
  else await addDoc(collection(db, "letters"), { ...data, createdAt: serverTimestamp() });
  e.target.reset();
  hideModal("featureLetterModal");
});

$("addLetterButton")?.addEventListener("click", () => {
  $("featureLetterForm").reset();
  $("featureLetterId").value = "";
  showModal("featureLetterModal");
});

/* -------------------------
   PLACES
   ------------------------- */

function featureListenPlaces() {
  const q = query(collection(db, "places"), orderBy("createdAt", "desc"));
  onSnapshot(q, snapshot => {
    featureState.places = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    featureRenderPlaces();
    featureRenderAllExtras();
  }, error => console.error("Places realtime error:", error));
}

function featureRenderPlaces() {
  const c = $("placesContainer");
  if (!c) return;
  c.innerHTML = featureState.places.length ? "" : `<div class="col-12 text-center text-muted py-5">No places saved yet.</div>`;

  featureState.places.forEach(item => {
    const col = document.createElement("div");
    col.className = "col-md-6 col-lg-4";
    const maps = safeUrl(item.mapsUrl);
    col.innerHTML = `
      <div class="card border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="card-body">
          <i class="bi bi-geo-alt-fill text-primary fs-3"></i>
          <h5 class="fw-bold mt-2">${escapeHtml(item.name || "")}</h5>
          <p class="text-muted">${escapeHtml(item.address || "")}</p>
          <p style="white-space:pre-line">${escapeHtml(item.notes || "")}</p>
          <div class="feature-action-row">
            ${maps ? `<a class="btn btn-sm btn-outline-primary" href="${escapeHtml(maps)}" target="_blank" rel="noopener">Google Maps</a>` : ""}
            <button type="button" class="btn btn-sm btn-outline-primary edit-place">Edit</button>
            <button type="button" class="btn btn-sm btn-outline-danger delete-place">Delete</button>
          </div>
        </div>
      </div>`;
    col.querySelector(".edit-place").onclick = () => {
      $("featurePlaceId").value = item.id;
      $("featurePlaceName").value = item.name || "";
      $("featurePlaceAddress").value = item.address || "";
      $("featurePlaceMaps").value = item.mapsUrl || "";
      $("featurePlaceNotes").value = item.notes || "";
      showModal("featurePlaceModal");
    };
    col.querySelector(".delete-place").onclick = async () => {
      if (featureConfirm("Delete this place?")) await deleteDoc(doc(db, "places", item.id));
    };
    c.appendChild(col);
  });
}

$("featurePlaceForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("featurePlaceId").value;
  const data = {
    name: $("featurePlaceName").value.trim(),
    address: $("featurePlaceAddress").value.trim(),
    mapsUrl: $("featurePlaceMaps").value.trim(),
    notes: $("featurePlaceNotes").value.trim(),
    updatedAt: serverTimestamp()
  };
  if (id) await updateDoc(doc(db, "places", id), data);
  else await addDoc(collection(db, "places"), { ...data, createdAt: serverTimestamp() });
  e.target.reset();
  hideModal("featurePlaceModal");
});

$("addPlaceButton")?.addEventListener("click", () => {
  $("featurePlaceForm").reset();
  $("featurePlaceId").value = "";
  showModal("featurePlaceModal");
});

/* -------------------------
   COUNTDOWNS
   ------------------------- */

function featureListenCountdowns() {
  const q = query(collection(db, "countdowns"), orderBy("targetDate", "asc"));
  onSnapshot(q, snapshot => {
    featureState.countdowns = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    featureRenderCountdowns();
    featureRenderAllExtras();
  }, error => console.error("Countdown realtime error:", error));
}

function featureCountdownText(target) {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "It's time! 🎉";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000) % 24;
  const minutes = Math.floor(diff / 60000) % 60;
  const seconds = Math.floor(diff / 1000) % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function featureRenderCountdowns() {
  const c = $("countdownsContainer");
  if (!c) return;
  c.innerHTML = featureState.countdowns.length ? "" : `<div class="col-12 text-center text-muted py-5">No countdowns yet.</div>`;

  featureState.countdowns.forEach(item => {
    const col = document.createElement("div");
    col.className = "col-md-6 col-lg-4";
    col.innerHTML = `
      <div class="card border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="card-body">
          <span class="badge bg-warning text-dark">Countdown</span>
          <h5 class="fw-bold mt-2">${escapeHtml(item.title || "")}</h5>
          <div class="feature-countdown" data-feature-target="${escapeHtml(item.targetDate || "")}">${escapeHtml(featureCountdownText(item.targetDate))}</div>
          <p class="text-muted">${escapeHtml(item.description || "")}</p>
          <div class="feature-action-row">
            <button type="button" class="btn btn-sm btn-outline-primary edit-countdown">Edit</button>
            <button type="button" class="btn btn-sm btn-outline-danger delete-countdown">Delete</button>
          </div>
        </div>
      </div>`;
    col.querySelector(".edit-countdown").onclick = () => {
      $("featureCountdownId").value = item.id;
      $("featureCountdownTitle").value = item.title || "";
      $("featureCountdownDate").value = item.targetDate || "";
      $("featureCountdownDescription").value = item.description || "";
      showModal("featureCountdownModal");
    };
    col.querySelector(".delete-countdown").onclick = async () => {
      if (featureConfirm("Delete this countdown?")) await deleteDoc(doc(db, "countdowns", item.id));
    };
    c.appendChild(col);
  });
}

$("featureCountdownForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("featureCountdownId").value;
  const data = {
    title: $("featureCountdownTitle").value.trim(),
    targetDate: $("featureCountdownDate").value,
    description: $("featureCountdownDescription").value.trim(),
    updatedAt: serverTimestamp()
  };
  if (id) await updateDoc(doc(db, "countdowns", id), data);
  else await addDoc(collection(db, "countdowns"), { ...data, createdAt: serverTimestamp() });
  e.target.reset();
  hideModal("featureCountdownModal");
});

$("addCountdownButton")?.addEventListener("click", () => {
  $("featureCountdownForm").reset();
  $("featureCountdownId").value = "";
  showModal("featureCountdownModal");
});

setInterval(() => {
  document.querySelectorAll("[data-feature-target]").forEach(el => {
    el.textContent = featureCountdownText(el.dataset.featureTarget);
  });
}, 1000);

/* -------------------------
   GLOBAL SEARCH
   ------------------------- */

function featureSearchItems() {
  return [
    ...loadedMemories.map(x => ({ type: "Memory", title: x.title, text: x.note })),
    ...featureState.letters.map(x => ({ type: "Letter", title: x.title, text: x.content })),
    ...featureCapsuleCache.map(x => ({ type: "Capsule", title: x.title, text: x.content })),
    ...featureBucketCache.map(x => ({ type: "Bucket Goal", title: x.title, text: x.category })),
    ...featureState.places.map(x => ({ type: "Place", title: x.name, text: `${x.address || ""} ${x.notes || ""}` })),
    ...featureState.countdowns.map(x => ({ type: "Countdown", title: x.title, text: x.description }))
  ];
}

function featureRunSearch() {
  const q = $("globalSearch")?.value.trim().toLowerCase();
  const box = $("searchResults");
  if (!box) return;

  if (!q) {
    box.classList.add("d-none");
    box.innerHTML = "";
    return;
  }

  const results = featureSearchItems().filter(x =>
    `${x.title || ""} ${x.text || ""}`.toLowerCase().includes(q)
  );

  box.classList.remove("d-none");
  box.innerHTML = results.length
    ? results.map(x => `
      <div class="feature-search-result">
        <span class="badge bg-light text-dark border">${escapeHtml(x.type)}</span>
        <strong class="ms-2">${escapeHtml(x.title || "")}</strong>
        <div class="small text-muted">${escapeHtml(String(x.text || "").slice(0, 180))}</div>
      </div>`).join("")
    : `<div class="text-muted py-2">No matches found.</div>`;
}

$("globalSearch")?.addEventListener("input", featureRunSearch);
$("clearSearch")?.addEventListener("click", () => {
  $("globalSearch").value = "";
  featureRunSearch();
});

/* -------------------------
   GALLERY + ACHIEVEMENTS
   ------------------------- */

function featureRenderGallery() {
  const c = $("galleryContainer");
  if (!c) return;

  const media = [];
  loadedMemories.forEach(item => {
    if (item.image) media.push({ type: "image", url: item.image, title: item.title, caption: "Memory photo" });
    if (item.video) media.push({ type: "video", url: item.video, title: item.title, caption: "Memory video" });
  });
  featureBucketCache.forEach(item => {
    if (item.photo) media.push({ type: "image", url: item.photo, title: item.title, caption: "Bucket-list celebration" });
  });

  c.innerHTML = media.length ? "" : `<div class="col-12 text-center text-muted py-5">No photos or videos uploaded yet.</div>`;

  media.forEach(item => {
    const col = document.createElement("div");
    col.className = "col-sm-6 col-lg-4";
    col.innerHTML = `
      <div class="feature-media-card">
        ${item.type === "image"
          ? `<img src="${escapeHtml(safeUrl(item.url))}" alt="">`
          : `<video src="${escapeHtml(safeUrl(item.url))}" controls preload="metadata"></video>`}
        <div class="card-body">
          <strong>${escapeHtml(item.title || "")}</strong>
          <div class="text-muted small">${escapeHtml(item.caption || "")}</div>
        </div>
      </div>`;
    c.appendChild(col);
  });
}

const featureAchievements = [
  ["📸", "Memory Maker", "Add your first memory.", () => loadedMemories.length >= 1],
  ["💌", "Storyteller", "Create your first letter.", () => featureState.letters.length >= 1],
  ["⏳", "Timekeeper", "Create your first capsule.", () => featureCapsuleCache.length >= 1],
  ["🎯", "Dream Builder", "Create five bucket goals.", () => featureBucketCache.length >= 5],
  ["🏆", "Dream Achiever", "Complete a bucket goal.", () => featureBucketCache.some(x => x.completed)],
  ["🗺️", "Explorer", "Save your first place.", () => featureState.places.length >= 1],
  ["⏰", "Counting Down", "Create your first countdown.", () => featureState.countdowns.length >= 1],
  ["🎥", "Media Collector", "Upload a photo or video.", () => loadedMemories.some(x => x.image || x.video)]
];

function featureRenderAchievements() {
  const c = $("achievementsContainer");
  if (!c) return;

  let unlocked = 0;
  c.innerHTML = "";

  featureAchievements.forEach(([icon, title, description, test]) => {
    const ok = test();
    if (ok) unlocked++;

    const col = document.createElement("div");
    col.className = "col-sm-6 col-lg-3";
    col.innerHTML = `
      <div class="card feature-achievement ${ok ? "" : "locked"} border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="card-body">
          <div class="feature-achievement-icon">${icon}</div>
          <h6 class="fw-bold mt-2">${escapeHtml(title)}</h6>
          <p class="small text-muted">${escapeHtml(description)}</p>
          <span class="badge ${ok ? "bg-success" : "bg-secondary"}">${ok ? "Unlocked" : "Locked"}</span>
        </div>
      </div>`;
    c.appendChild(col);
  });

  $("achievementScore").textContent = `${unlocked}/${featureAchievements.length} unlocked`;
}

function featureRenderAllExtras() {
  featureRenderGallery();
  featureRenderAchievements();
  featureRunSearch();
}

/* Keep local caches synchronized by listening to the same Firestore collections. */
onSnapshot(
  query(collection(db, "capsules"), orderBy("unlockDate", "asc")),
  snapshot => {
    featureCapsuleCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    featureDecorateCapsules();
    featureRenderAllExtras();
  },
  error => console.error("Feature capsule cache error:", error)
);

onSnapshot(
  query(collection(db, "bucketList"), orderBy("createdAt", "desc")),
  snapshot => {
    featureBucketCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    featureDecorateBuckets();
    featureRenderAllExtras();
  },
  error => console.error("Feature bucket cache error:", error)
);

featureListenLetters();
featureListenPlaces();
featureListenCountdowns();

/* The original timeline listener repaints cards asynchronously. */
setInterval(() => {
  featureDecorateMemoryCards();
  featureDecorateCapsules();
  featureDecorateBuckets();
  featureRenderAllExtras();
}, 1200);

/* Reset the original modal wording when the user starts a brand-new item. */
$("addMemoryModal")?.addEventListener("show.bs.modal", () => {
  if (!$("memoryForm").dataset.editingId) {
    const title = document.querySelector("#addMemoryModal .modal-title");
    if (title) title.textContent = "Add New Memory";
    $("saveMemoryBtn").innerHTML = '<i class="bi bi-cloud-arrow-up me-1"></i> Save Memory';
  }
});

$("addCapsuleModal")?.addEventListener("show.bs.modal", () => {
  if (!$("capsuleForm").dataset.editingId) {
    const title = document.querySelector("#addCapsuleModal .modal-title");
    if (title) title.textContent = "Create Time Capsule";
  }
});

$("addBucketModal")?.addEventListener("show.bs.modal", () => {
  if (!$("bucketForm").dataset.editingId) {
    const title = document.querySelector("#addBucketModal .modal-title");
    if (title) title.textContent = "Add Bucket Goal";
  }
});

/* -------------------------
   MEDIA PREVIEW FOR VIDEO
   ------------------------- */

$("memVideo")?.addEventListener("change", () => {
  const file = $("memVideo").files?.[0];
  if (!file) return;
  if (!file.type.startsWith("video/")) {
    $("memVideo").value = "";
    alert("Please select a video file.");
    return;
  }
  if (file.size > 500 * 1024 * 1024) {
    $("memVideo").value = "";
    alert("Video is too large. Maximum supported size is 500 MB.");
  }
});
