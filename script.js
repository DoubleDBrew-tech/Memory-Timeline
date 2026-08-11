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

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD2ZJqSiJr0uMb52RhdeClKkBNoncT1VdM",
  authDomain: "memory-timeline-f5e32.firebaseapp.com",
  projectId: "memory-timeline-f5e32",
  storageBucket: "memory-timeline-f5e32.firebasestorage.app",
  messagingSenderId: "596383895352",
  appId: "1:596383895352:web:9de8a283e3dc58ee727bcd"
};

// Initialize Firebase & Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Local memory cache for UI interaction
let loadedMemories = [];

// ================= 1. TIMELINE REAL-TIME LISTENERS =================
const memoriesQuery = query(collection(db, "memories"), orderBy("date", "asc"));

onSnapshot(memoriesQuery, (snapshot) => {
  const container = document.getElementById('timelineContainer');
  container.innerHTML = '';
  loadedMemories = [];

  if (snapshot.empty) {
    container.innerHTML = '<p class="text-center text-muted">No memories added yet. Click "Add Memory" above!</p>';
    return;
  }

  let index = 0;
  snapshot.forEach((docSnapshot) => {
    const item = { id: docSnapshot.id, ...docSnapshot.data() };
    loadedMemories.push(item);

    const side = index % 2 === 0 ? 'left' : 'right';
    const formattedDate = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    const element = document.createElement('div');
    element.className = `timeline-item ${side}`;
    element.innerHTML = `
      <div class="timeline-node"></div>
      <div class="card card-memory border-0 shadow-sm rounded-4" data-id="${item.id}">
        ${item.image ? `<img src="${item.image}" class="card-img-top rounded-top-4" style="height: 180px; object-fit: cover;">` : ''}
        <div class="card-body">
          <small class="text-primary fw-bold">${formattedDate}</small>
          <h5 class="card-title fw-bold mt-1">${item.title}</h5>
          <p class="card-text text-muted text-truncate">${item.note}</p>
        </div>
      </div>
    `;

    element.querySelector('.card-memory').addEventListener('click', () => openMemoryModal(item.id));
    container.appendChild(element);
    index++;
  });
});

function openMemoryModal(id) {
  const item = loadedMemories.find(m => m.id === id);
  if (!item) return;

  document.getElementById('memoryModalTitle').innerText = item.title;
  document.getElementById('memoryModalDate').innerText = new Date(item.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  document.getElementById('memoryModalNote').innerText = item.note;

  const imgEl = document.getElementById('memoryModalImage');
  if (item.image) {
    imgEl.src = item.image;
    imgEl.classList.remove('d-none');
  } else {
    imgEl.classList.add('d-none');
  }

  const audioContainer = document.getElementById('memoryModalAudioContainer');
  const audioEl = document.getElementById('memoryModalAudio');
  if (item.audio) {
    audioEl.src = item.audio;
    audioContainer.classList.remove('d-none');
  } else {
    audioContainer.classList.add('d-none');
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById('viewMemoryModal')).show();
}

document.getElementById('memoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
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
    bootstrap.Modal.getInstance(document.getElementById('addMemoryModal')).hide();
  } catch (err) {
    console.error("Error adding memory: ", err);
  }
});

// ================= 2. CAPSULE REAL-TIME LISTENERS =================
const capsulesQuery = query(collection(db, "capsules"), orderBy("unlockDate", "asc"));

onSnapshot(capsulesQuery, (snapshot) => {
  const container = document.getElementById('capsuleContainer');
  container.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (snapshot.empty) {
    container.innerHTML = '<p class="text-center text-muted">No capsules created yet.</p>';
    return;
  }

  snapshot.forEach((docSnapshot) => {
    const item = docSnapshot.data();
    const unlockDate = new Date(item.unlockDate);
    unlockDate.setHours(0, 0, 0, 0);
    const isUnlocked = today >= unlockDate;

    const timeDiff = unlockDate - today;
    const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4';
    
    if (isUnlocked) {
      col.innerHTML = `
        <div class="card capsule-card unlocked shadow-sm rounded-4 h-100">
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="badge bg-success"><i class="bi bi-unlock"></i> Unlocked</span>
              <small class="text-muted">${item.unlockDate}</small>
            </div>
            <h5 class="fw-bold">${item.title}</h5>
            <p class="card-text text-secondary mt-2 flex-grow-1" style="white-space: pre-line;">${item.content}</p>
          </div>
        </div>
      `;
    } else {
      col.innerHTML = `
        <div class="card capsule-card locked shadow-sm rounded-4 h-100 text-center p-3">
          <div class="card-body d-flex flex-column justify-content-center align-items-center">
            <i class="bi bi-lock-fill display-4 text-secondary mb-3"></i>
            <h5 class="fw-bold text-dark">${item.title}</h5>
            <p class="text-muted small mb-3">Unlocks on ${item.unlockDate}</p>
            <span class="badge bg-danger rounded-pill px-3 py-2">${daysRemaining} day(s) remaining</span>
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
    bootstrap.Modal.getInstance(document.getElementById('addCapsuleModal')).hide();
  } catch (err) {
    console.error("Error creating capsule: ", err);
  }
});

// ================= 3. BUCKET LIST REAL-TIME LISTENERS =================
const bucketQuery = query(collection(db, "bucketList"), orderBy("createdAt", "desc"));

onSnapshot(bucketQuery, (snapshot) => {
  const container = document.getElementById('bucketListContainer');
  container.innerHTML = '';

  if (snapshot.empty) {
    container.innerHTML = '<p class="text-center text-muted">No bucket list items added yet.</p>';
    return;
  }

  snapshot.forEach((docSnapshot) => {
    const item = { id: docSnapshot.id, ...docSnapshot.data() };
    const col = document.createElement('div');
    col.className = 'col-md-6';
    col.innerHTML = `
      <div class="card border-0 shadow-sm rounded-4 h-100 p-2">
        <div class="card-body d-flex align-items-start gap-3">
          <input class="form-check-input mt-1 fs-5 bucket-checkbox" type="checkbox" ${item.completed ? 'checked disabled' : ''} data-id="${item.id}">
          <div class="flex-grow-1">
            <span class="badge bg-light text-dark border mb-1">${item.category}</span>
            <h6 class="fw-bold m-0 ${item.completed ? 'text-decoration-line-through text-muted' : ''}">${item.title}</h6>
            ${item.completed && item.photo ? `<img src="${item.photo}" class="img-fluid rounded-3 mt-3 w-100" style="max-height:180px; object-fit:cover;">` : ''}
          </div>
        </div>
      </div>
    `;

    const checkbox = col.querySelector('.bucket-checkbox');
    if (!item.completed) {
      checkbox.addEventListener('change', () => promptCompleteGoal(item.id));
    }

    container.appendChild(col);
  });
});

function promptCompleteGoal(id) {
  document.getElementById('completeBucketId').value = id;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('completeBucketModal')).show();
}

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
    bootstrap.Modal.getInstance(document.getElementById('completeBucketModal')).hide();
  } catch (err) {
    console.error("Error updating goal: ", err);
  }
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
    bootstrap.Modal.getInstance(document.getElementById('addBucketModal')).hide();
  } catch (err) {
    console.error("Error adding goal: ", err);
  }
});
