const DURATION_MS = 30 * 1000;

const screen = document.getElementById("screen");
const timerEl = document.getElementById("timer");
const mainButton = document.getElementById("main-button");
const resetButton = document.getElementById("reset-button");
const artEl = document.getElementById("art");
const artImage = document.getElementById("art-image");

const SEARCH_URL =
  "https://collectionapi.metmuseum.org/public/collection/v1.1/search?departmentId=11&hasImages=true&limit=100";
const OBJECT_URL = "https://collectionapi.metmuseum.org/public/collection/v1/objects/";
const MAX_TRIES = 5;

let remainingMs = DURATION_MS;
let endTime = 0;
let intervalId = null;
let paintingIds = null;
let currentPaintingId = null;
let paintingRequest = 0;

function pickRandomIds(ids, count) {
  const pool = ids.filter((id) => id !== currentPaintingId);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

async function findPaintingWithImage() {
  if (!paintingIds) {
    const searchResponse = await fetch(SEARCH_URL);
    const searchData = await searchResponse.json();
    paintingIds = searchData.objectIDs || [];
  }
  for (const id of pickRandomIds(paintingIds, MAX_TRIES)) {
    const objectResponse = await fetch(OBJECT_URL + id);
    const object = await objectResponse.json();
    if (object.primaryImageSmall) {
      return { id: id, imageUrl: object.primaryImageSmall };
    }
  }
  return null;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    artImage.onload = resolve;
    artImage.onerror = reject;
    artImage.src = url;
  });
}

async function showNewPainting() {
  const thisRequest = ++paintingRequest;
  artEl.dataset.art = "loading";
  try {
    const painting = await findPaintingWithImage();
    if (thisRequest !== paintingRequest) {
      return;
    }
    if (!painting) {
      artEl.dataset.art = "placeholder";
      return;
    }
    await loadImage(painting.imageUrl);
    if (thisRequest !== paintingRequest) {
      return;
    }
    currentPaintingId = painting.id;
    artEl.dataset.art = "image";
  } catch (error) {
    if (thisRequest === paintingRequest) {
      artEl.dataset.art = "placeholder";
    }
  }
}

function showTime() {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  timerEl.textContent = minutes + ":" + seconds;
}

function stopTicking() {
  clearInterval(intervalId);
  intervalId = null;
}

function finish() {
  stopTicking();
  screen.dataset.state = "finished";
  mainButton.textContent = "Restart session";
  resetButton.hidden = true;
}

function resetTimer() {
  stopTicking();
  remainingMs = DURATION_MS;
  showTime();
  screen.dataset.state = "idle";
  mainButton.textContent = "Start";
  resetButton.hidden = false;
}

// Works out the time left from the real clock, so it stays correct
// even when the browser slows down a background tab.
function tick() {
  remainingMs = Math.max(0, endTime - Date.now());
  showTime();
  if (remainingMs === 0) {
    finish();
  }
}

function startTicking() {
  endTime = Date.now() + remainingMs;
  intervalId = setInterval(tick, 250);
  screen.dataset.state = "running";
  mainButton.textContent = "Pause";
}

mainButton.addEventListener("click", () => {
  const state = screen.dataset.state;
  if (state === "running") {
    tick();
    if (screen.dataset.state !== "running") {
      return;
    }
    stopTicking();
    screen.dataset.state = "paused";
    mainButton.textContent = "Resume";
  } else if (state === "finished") {
    resetTimer();
    showNewPainting();
  } else {
    startTicking();
  }
});

resetButton.addEventListener("click", resetTimer);

document.addEventListener("visibilitychange", () => {
  if (intervalId !== null) {
    tick();
  }
});

showNewPainting();
