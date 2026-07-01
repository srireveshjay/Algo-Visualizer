let cm;
let steps = [];
let currentStep = -1;
let playing = false;
let playTimer = null;

const el_ = (id) => document.getElementById(id);
const runBtn = el_("runBtn");
const prevBtn = el_("prevBtn");
const nextBtn = el_("nextBtn");
const playBtn = el_("playBtn");
const resetBtn = el_("resetBtn");
const speedRange = el_("speedRange");
const stepLabel = el_("stepLabel");
const tapeTrack = el_("tapeTrack");
const stateBoard = el_("stateBoard");
const consoleOut = el_("consoleOut");
const errorBar = el_("errorBar");
const exampleSelect = el_("exampleSelect");

function initEditor() {
  cm = CodeMirror(el_("editor"), {
    value: EXAMPLES["Array — bubble sort"],
    mode: "python",
    theme: "default",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    viewportMargin: Infinity,
  });
}

function initExamples() {
  Object.keys(EXAMPLES).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    exampleSelect.appendChild(opt);
  });
  exampleSelect.value = "Array — bubble sort";
  exampleSelect.addEventListener("change", () => {
    if (exampleSelect.value) {
      cm.setValue(EXAMPLES[exampleSelect.value]);
      resetRun();
    }
  });
}

let activeLineHandle = null;
function highlightLine(lineNo) {
  if (activeLineHandle !== null) {
    cm.removeLineClass(activeLineHandle, "background", "cm-active-line");
  }
  if (lineNo && lineNo >= 1 && lineNo <= cm.lineCount()) {
    activeLineHandle = cm.addLineClass(lineNo - 1, "background", "cm-active-line");
    cm.scrollIntoView({ line: lineNo - 1, ch: 0 }, 80);
  } else {
    activeLineHandle = null;
  }
}

function buildTape() {
  tapeTrack.innerHTML = "";
  if (steps.length === 0) {
    tapeTrack.appendChild(el("div", { class: "tape-empty", text: "the film strip fills up once you run some code — each frame is one executed line" }));
    return;
  }
  steps.forEach((s, i) => {
    const frame = el("div", { class: "frame", text: "L" + s.line });
    frame.title = "Step " + (i + 1) + " — line " + s.line;
    frame.addEventListener("click", () => goToStep(i));
    tapeTrack.appendChild(frame);
  });
}

function refreshTapeActive() {
  const frames = tapeTrack.querySelectorAll(".frame");
  frames.forEach((f, i) => {
    f.classList.toggle("active", i === currentStep);
    f.classList.toggle("visited", i <= currentStep);
  });
  const active = frames[currentStep];
  if (active) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  stepLabel.textContent = `${Math.max(currentStep + 1, 0)} / ${steps.length}`;
}

function renderState(step) {
  stateBoard.innerHTML = "";
  if (!step) {
    stateBoard.appendChild(el("div", { class: "empty-state" }, [
      (() => { const p = document.createElement("p"); p.textContent = "Run some code and each variable will get its own card here — arrays as boxes, linked lists as chained nodes, trees as diagrams, maps as tables."; return p; })(),
    ]));
    consoleOut.textContent = "";
    return;
  }
  const names = Object.keys(step.vars);
  if (names.length === 0) {
    stateBoard.appendChild(el("div", { class: "empty-state", text: "no local variables yet at this line" }));
  } else {
    names.forEach((name) => {
      stateBoard.appendChild(buildVarCard(name, step.vars[name]));
    });
  }
  consoleOut.textContent = step.stdoutSoFar || "";
  consoleOut.scrollTop = consoleOut.scrollHeight;
}

function goToStep(i) {
  if (i < 0 || i >= steps.length) return;
  currentStep = i;
  const step = steps[i];
  highlightLine(step.line);
  renderState(step);
  refreshTapeActive();
}

function resetRun() {
  stopPlaying();
  steps = [];
  currentStep = -1;
  buildTape();
  highlightLine(null);
  renderState(null);
  errorBar.classList.add("hidden");
  errorBar.textContent = "";
}

function stopPlaying() {
  playing = false;
  playBtn.textContent = "▶";
  if (playTimer) { clearTimeout(playTimer); playTimer = null; }
}

function tick() {
  if (!playing) return;
  if (currentStep >= steps.length - 1) { stopPlaying(); return; }
  goToStep(currentStep + 1);
  playTimer = setTimeout(tick, parseInt(speedRange.value, 10));
}

async function runCode() {
  resetRun();
  runBtn.disabled = true;
  runBtn.textContent = "running…";
  const source = cm.getValue();

  const result = await runAndTrace(source);
  steps = result.steps;

  runBtn.disabled = false;
  runBtn.textContent = "Run ▶";

  buildTape();

  if (result.error) {
    errorBar.classList.remove("hidden");
    errorBar.textContent = "⚠ " + result.error;
  }

  if (steps.length > 0) {
    goToStep(0);
  } else {
    renderState(null);
    if (!result.error) {
      consoleOut.textContent = result.finalStdout || "(no output)";
    }
  }
}

runBtn.addEventListener("click", runCode);
resetBtn.addEventListener("click", () => { if (steps.length) goToStep(0); stopPlaying(); });
nextBtn.addEventListener("click", () => { stopPlaying(); goToStep(currentStep + 1); });
prevBtn.addEventListener("click", () => { stopPlaying(); goToStep(currentStep - 1); });
playBtn.addEventListener("click", () => {
  if (steps.length === 0) return;
  if (playing) { stopPlaying(); return; }
  if (currentStep >= steps.length - 1) currentStep = -1;
  playing = true;
  playBtn.textContent = "⏸";
  tick();
});

document.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "TEXTAREA" || e.target.classList.contains("CodeMirror-code"))) return;
  if (e.key === "ArrowRight") { stopPlaying(); goToStep(currentStep + 1); }
  if (e.key === "ArrowLeft") { stopPlaying(); goToStep(currentStep - 1); }
});

initEditor();
initExamples();
