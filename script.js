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
const retryButton = document.getElementById("retry-button");

const SEARCH_URL =
  "https://collectionapi.metmuseum.org/public/collection/v1.1/search?departmentId=11&hasImages=true&limit=100";
const OBJECT_URL = "https://collectionapi.metmuseum.org/public/collection/v1/objects/";
const MAX_TRIES = 5;
const REQUEST_TIMEOUT_MS = 10000;
const RETRY_PAUSE_MS = 1000;
const MAX_BLUR_PX = 30;
const ZOOM_PER_BLUR_PX = 0.013;

let remainingMs = DURATION_MS;
let endTime = 0;
let intervalId = null;
let paintingIds = null;
let currentPaintingId = null;
let currentDetails = null;
let paintingRequest = 0;

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gives up after 10 seconds, and treats "too many requests" or any other
// bad answer from the museum as a failure.
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error("Bad answer from the museum");
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function pickRandomId(triedIds) {
  const options = paintingIds.filter((id) => id !== currentPaintingId && !triedIds.has(id));
  if (options.length === 0) {
    throw new Error("No painting left to try");
  }
  return options[Math.floor(Math.random() * options.length)];
}

function isUsablePainting(object) {
  const type = (object.classification || "") + " " + (object.objectName || "");
  return (
    /painting/i.test(type) &&
    typeof object.primaryImageSmall === "string" &&
    object.primaryImageSmall.startsWith("https://")
  );
}

// Looks up one painting. Throws if the search or the painting record fails,
// or if the result is not a painting with a usable photo.
async function lookUpPainting(triedIds) {
  if (!paintingIds) {
    const searchData = await fetchJson(SEARCH_URL);
    if (!Array.isArray(searchData.objectIDs) || searchData.objectIDs.length === 0) {
      throw new Error("The search found nothing");
    }
    paintingIds = searchData.objectIDs;
  }
  const id = pickRandomId(triedIds);
  triedIds.add(id);
  const object = await fetchJson(OBJECT_URL + id);
  if (!isUsablePainting(object)) {
    throw new Error("Not a painting with a usable photo");
  }
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

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The picture is too slow")), REQUEST_TIMEOUT_MS);
    artImage.onload = () => {
      clearTimeout(timer);
      if (!artImage.naturalWidth || !artImage.naturalHeight) {
        reject(new Error("The picture is empty"));
        return;
      }
      artEl.style.setProperty("--ratio", artImage.naturalWidth / artImage.naturalHeight);
      resolve();
    };
    artImage.onerror = () => {
      clearTimeout(timer);
      reject(new Error("The picture failed to load"));
    };
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

// Quietly tries up to MAX_TRIES paintings, one after another, until one works.
// The details are only kept once the picture has loaded, so they always
// belong to the painting on the page.
async function showNewPainting() {
  const thisRequest = ++paintingRequest;
  currentDetails = null;
  clearDetails();
  artEl.dataset.art = "loading";
  const triedIds = new Set();
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const painting = await lookUpPainting(triedIds);
      if (thisRequest !== paintingRequest) {
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
      return;
    } catch (error) {
      if (thisRequest !== paintingRequest) {
        return;
      }
    }
    if (attempt < MAX_TRIES) {
      await pause(RETRY_PAUSE_MS);
      if (thisRequest !== paintingRequest) {
        return;
      }
    }
  }
  artEl.dataset.art = "failed";
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

retryButton.addEventListener("click", showNewPainting);

document.addEventListener("visibilitychange", () => {
  if (intervalId !== null) {
    tick();
  }
});

updateBlur();
showNewPainting();
