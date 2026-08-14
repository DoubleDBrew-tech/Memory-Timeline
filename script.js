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

// Firebase Config
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

// Helper functions for Bootstrap Modal management
function showModal(modalId) {
  const el = document.getElementById(modalId);
  if (el && window.bootstrap) {
    const modal = window.bootstrap.Modal.getOrCreateInstance(el);
    modal.show();
  }
}

function hideModal(modalId) {
  const el = document.getElementById(modalId);
  if (el && window.bootstrap) {
    const modal = window.bootstrap.Modal.getInstance(el) || new window.bootstrap.Modal(el);
    modal.hide();
  }
}

// =========================================================
// CRITICAL FIX: EXPLICIT BUTTON LISTENERS FOR MOBILE/IPAD
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnOpenAddMemory").addEventListener("click", () => showModal("addMemoryModal"));
  document.getElementById("btnOpenAddCapsule").addEventListener("click", () => showModal("addCapsuleModal"));
  document.getElementById("btnOpenAddGoal").addEventListener("click", () => showModal("addBucketModal"));
});
// =========================================================

let loadedMemories = [];

// -------------------------------------------------------------
// 1. TIMELINE MODULE
// -------------------------------------------------------------
const memoriesQuery = query(collection(db, "memories"), orderBy("date", "asc"));

onSnapshot(memoriesQuery, (snapshot) => {
  const container = document.getElementById('timelineContainer');
  if (!container) return;
  container.innerHTML = '';
  loadedMemories = [];

  if (snapshot.empty) {
    container.innerHTML = '<div class="text-center py-4 text-muted">No memories added yet. Tap "Add Memory" to create one!</div>';
    return;
  }

  let index = 0;
  snapshot.forEach((docSnap) => {
    const item = { id: docSnap.id, ...docSnap.data() };
    loadedMemories.push(item);

    const side = index % 2 === 0 ? 'left' : 'right';
    const formattedDate = item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

    const element = document.createElement('div');
    element.className = `timeline-item ${side}`;
    element.innerHTML = `
      <div class="timeline-node"></div>
      <div class="card card-memory border-0 shadow-sm rounded-4" role="button">
        ${item.image ? `<img src="${item.image}" class="card-img-top rounded-top-4" style="height: 160px; object-fit: cover;">` : ''}
        <div class="card-body">
          <small class="text-primary fw-bold">${formattedDate}</small>
          <h5 class="card-title fw-bold mt-1 mb-1">${item.title || ''}</h5>
          <p class="card-text text-muted text-truncate mb-0">${item.note || ''}</p>
        </div>
      </div>
    `;

    element.querySelector('.card-memory').addEventListener('click', () => viewMemory(item.id));
    container.appendChild(element);
    index++;
  });
});

function viewMemory(id) {
  const item = loadedMemories.find(m => m.id === id);
  if (!item) return;

  document.getElementById('memoryModalTitle').innerText = item.title || 'Untitled';
  document.getElementById('memoryModalDate').innerText = item.date ? new Date(item.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
  document.getElementById('memoryModalNote').innerText = item.note || '';

  const imgEl = document.getElementById('memoryModalImage');
  if (item.image) {
    imgEl.src = item.image;
    imgEl.classList.remove('d-none');
  } else {
    imgEl.classList.add('d-none');
  }

  const audioBox = document.getElementById('memoryModalAudioContainer');
  const audioEl = document.getElementById('memoryModalAudio');
  if (item.audio) {
    audioEl.src = item.audio;
    audioBox.classList.remove('d-none');
  } else {
    audioBox.classList.add('d-none');
  }

  showModal('viewMemoryModal');
}

document.getElementById('memoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveMemoryBtn');
  btn.disabled = true;

  try {
    await addDoc(collection(db, "memories"), {
      title: document.getElementById('memTitle').value,
      date: document.getElementById('memDate').value,
      image: document.getElementById('memImage').value,
      audio: document.getElementById('memAudio').value,
      note: document.getElementById('memNote').value,
      createdAt: serverTimestamp()
    });

    e.target.reset();
    hideModal('addMemoryModal');
  } catch (err) {
    console.error("Error saving memory:", err);
    alert("Unable to save memory. Check Firestore rules.");
  } finally {
    btn.disabled = false;
  }
});

// -------------------------------------------------------------
// 2. CAPSULES MODULE
// -------------------------------------------------------------
const capsulesQuery = query(collection(db, "capsules"), orderBy("unlockDate", "asc"));

onSnapshot(capsulesQuery, (snapshot) => {
  const container = document.getElementById('capsuleContainer');
  if (!container) return;
  container.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (snapshot.empty) {
    container.innerHTML = '<div class="col-12 text-center text-muted py-4">No capsules created yet.</div>';
    return;
  }

  snapshot.forEach((docSnap) => {
    const item = docSnap.data();
    const unlockDate = new Date(item.unlockDate);
    unlockDate.setHours(0, 0, 0, 0);
    const isUnlocked = today >= unlockDate;

    const timeDiff = unlockDate - today;
    const daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4';

    if (isUnlocked) {
      col.innerHTML = `
        <div class="card capsule-card unlocked shadow-sm rounded-4 h-100 p-3">
          <div class="card-body p-0 d-flex flex-column">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="badge bg-success"><i class="bi bi-unlock me-1"></i>Unlocked</span>
              <small class="text-muted">${item.unlockDate}</small>
            </div>
            <h5 class="fw-bold mb-2">${item.title}</h5>
            <p class="card-text text-secondary flex-grow-1" style="white-space: pre-line;">${item.content}</p>
          </div>
        </div>
      `;
    } else {
      col.innerHTML = `
        <div class="card capsule-card locked shadow-sm rounded-4 h-100 p-3 text-center">
          <div class="card-body p-0 d-flex flex-column justify-content-center align-items-center">
            <i class="bi bi-lock-fill display-5 text-secondary mb-2"></i>
            <h5 class="fw-bold">${item.title}</h5>
            <small class="text-muted mb-2">Unlocks: ${item.unlockDate}</small>
            <span class="badge bg-danger rounded-pill px-3 py-2">${daysLeft} day(s) left</span>
          </div>
        </div>
      `;
    }
    container.appendChild(col);
  });
});

document.getElementById('capsuleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await addDoc(collection(db, "capsules"), {
      title: document.getElementById('capTitle').value,
      unlockDate: document.getElementById('capUnlockDate').value,
      content: document.getElementById('capContent').value,
      createdAt: serverTimestamp()
    });

    e.target.reset();
    hideModal('addCapsuleModal');
  } catch (err) {
    console.error("Error creating capsule:", err);
  }
});

// -------------------------------------------------------------
// 3. BUCKET LIST MODULE
// -------------------------------------------------------------
const bucketQuery = query(collection(db, "bucketList"), orderBy("createdAt", "desc"));

onSnapshot(bucketQuery, (snapshot) => {
  const container = document.getElementById('bucketListContainer');
  if (!container) return;
  container.innerHTML = '';

  if (snapshot.empty) {
    container.innerHTML = '<div class="col-12 text-center text-muted py-4">No bucket list items added yet.</div>';
    return;
  }

  snapshot.forEach((docSnap) => {
    const item = { id: docSnap.id, ...docSnap.data() };
    const col = document.createElement('div');
    col.className = 'col-md-6';
    col.innerHTML = `
      <div class="card border-0 shadow-sm rounded-4 h-100 p-3">
        <div class="card-body p-0 d-flex align-items-start gap-3">
          <input class="form-check-input fs-5 mt-1 bucket-check" type="checkbox" ${item.completed ? 'checked disabled' : ''}>
          <div class="flex-grow-1">
            <span class="badge bg-light text-dark border mb-1">${item.category}</span>
            <h6 class="fw-bold m-0 ${item.completed ? 'text-decoration-line-through text-muted' : ''}">${item.title}</h6>
            ${item.completed && item.photo ? `<img src="${item.photo}" class="img-fluid rounded-3 mt-3 w-100" style="max-height:180px; object-fit:cover;">` : ''}
          </div>
        </div>
      </div>
    `;

    const checkbox = col.querySelector('.bucket-check');
    if (!item.completed) {
      checkbox.addEventListener('change', () => {
        document.getElementById('completeBucketId').value = item.id;
        showModal('completeBucketModal');
      });
    }

    container.appendChild(col);
  });
});

document.getElementById('bucketForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await addDoc(collection(db, "bucketList"), {
      title: document.getElementById('bucketTitle').value,
      category: document.getElementById('bucketCategory').value,
      completed: false,
      photo: '',
      createdAt: serverTimestamp()
    });

    e.target.reset();
    hideModal('addBucketModal');
  } catch (err) {
    console.error("Error adding bucket goal:", err);
  }
});

document.getElementById('completeBucketForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('completeBucketId').value;
  const photoUrl = document.getElementById('completePhotoUrl').value;

  try {
    const docRef = doc(db, "bucketList", id);
    await updateDoc(docRef, {
      completed: true,
      photo: photoUrl
    });

    e.target.reset();
    hideModal('completeBucketModal');
  } catch (err) {
    console.error("Error completing goal:", err);
  }
});
