const DURATION_MS = 25 * 60 * 1000;

const screen = document.getElementById("screen");
const timerEl = document.getElementById("timer");
const mainButton = document.getElementById("main-button");
const resetButton = document.getElementById("reset-button");

let remainingMs = DURATION_MS;
let endTime = 0;
let intervalId = null;

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
