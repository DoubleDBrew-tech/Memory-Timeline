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
  getDownloadURL
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
  folder
) {

  if (!file) {
    return "";
  }

  if (!file.type.startsWith("image/")) {

    throw new Error(
      "Please select an image file."
    );

  }

  /*
     10 MB limit.
  */

  if (
    file.size >
    10 * 1024 * 1024
  ) {

    throw new Error(
      "Image is too large. Please choose an image under 10 MB."
    );

  }

  const safeName =
    file.name
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

  const fileName =
    `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}_${safeName}`;

  const storageRef =
    ref(
      storage,
      `${folder}/${fileName}`
    );

  await uploadBytes(
    storageRef,
    file,
    {
      contentType:
        file.type
    }
  );

  return await getDownloadURL(
    storageRef
  );

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