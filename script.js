const DURATION_MS = 30 * 1000;

const screen = document.getElementById("screen");
const timerEl = document.getElementById("timer");
const mainButton = document.getElementById("main-button");
const resetButton = document.getElementById("reset-button");
const artEl = document.getElementById("art");
const artImage = document.getElementById("art-image");
const plaqueEl = document.getElementById("plaque");
const plaqueTitle = document.getElementById("plaque-title");
const plaqueArtist = document.getElementById("plaque-artist");
const plaqueYear = document.getElementById("plaque-year");
const plaqueLink = document.getElementById("plaque-link");

const SEARCH_URL =
  "https://collectionapi.metmuseum.org/public/collection/v1.1/search?departmentId=11&hasImages=true&limit=100";
const OBJECT_URL = "https://collectionapi.metmuseum.org/public/collection/v1/objects/";
const MAX_TRIES = 5;
const MAX_BLUR_PX = 30;
const ZOOM_PER_BLUR_PX = 0.013;

let remainingMs = DURATION_MS;
let endTime = 0;
let intervalId = null;
let paintingIds = null;
let currentPaintingId = null;
let currentDetails = null;
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
      return {
        id: id,
        imageUrl: object.primaryImageSmall,
        details: {
          title: (object.title || "").trim() || "Untitled",
          artist: (object.artistDisplayName || "").trim() || "Unknown artist",
          year: (object.objectDate || "").trim(),
          link: (object.objectURL || "").trim(),
        },
      };
    }
  }
  return null;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    artImage.onload = () => {
      artEl.style.setProperty("--ratio", artImage.naturalWidth / artImage.naturalHeight);
      resolve();
    };
    artImage.onerror = reject;
    artImage.src = url;
  });
}

// The details stay in memory and are only written onto the page at 00:00.
function renderDetails() {
  if (screen.dataset.state !== "finished" || !currentDetails) {
    return;
  }
  plaqueTitle.textContent = currentDetails.title;
  plaqueArtist.textContent = currentDetails.artist;
  plaqueYear.textContent = currentDetails.year;
  plaqueYear.hidden = currentDetails.year === "";
  const hasLink = currentDetails.link.startsWith("https://");
  plaqueLink.href = hasLink ? currentDetails.link : "";
  plaqueLink.hidden = !hasLink;
  plaqueEl.hidden = false;
}

function clearDetails() {
  plaqueEl.hidden = true;
  plaqueTitle.textContent = "";
  plaqueArtist.textContent = "";
  plaqueYear.textContent = "";
  plaqueYear.hidden = true;
  plaqueLink.removeAttribute("href");
  plaqueLink.hidden = true;
}

async function showNewPainting() {
  const thisRequest = ++paintingRequest;
  currentDetails = null;
  clearDetails();
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
    currentDetails = painting.details;
    artEl.dataset.art = "image";
    renderDetails();
  } catch (error) {
    if (thisRequest === paintingRequest) {
      artEl.dataset.art = "placeholder";
    }
  }
}

// The blur depends only on the share of time left, so it works for any
// timer length and follows the real clock like the numbers do.
function updateBlur() {
  const blur = MAX_BLUR_PX * (remainingMs / DURATION_MS);
  artEl.style.setProperty("--blur", blur.toFixed(2) + "px");
  artEl.style.setProperty("--zoom", (1 + blur * ZOOM_PER_BLUR_PX).toFixed(4));
}

function showTime() {
  updateBlur();
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
  renderDetails();
}

function resetTimer() {
  stopTicking();
  remainingMs = DURATION_MS;
  showTime();
  screen.dataset.state = "idle";
  mainButton.textContent = "Start";
  resetButton.hidden = false;
  clearDetails();
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

updateBlur();
showNewPainting();
