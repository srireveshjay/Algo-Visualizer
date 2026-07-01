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
    matchBrackets: true,
    autoCloseBrackets: true,
    lineWrapping: false,
    scrollbarStyle: "overlay",
    placeholder: "# paste or write your python here…",
    gutters: ["CodeMirror-linenumbers", "cm-error-gutter", "cm-trace-gutter"],
  });
  cm.on("cursorActivity", updateStatusBar);
  cm.on("change", updateStatusBar);
  updateStatusBar();
}

function updateStatusBar() {
  const cur = cm.getCursor();
  el_("statusPos").textContent = `Ln ${cur.line + 1}, Col ${cur.ch + 1}`;
  const text = cm.getValue();
  const lines = cm.lineCount();
  el_("statusCounts").textContent = `${lines} line${lines === 1 ? "" : "s"} · ${text.length} char${text.length === 1 ? "" : "s"}`;
}

function flashCopyToast() {
  const t = el_("copyToast");
  t.classList.remove("hidden");
  clearTimeout(flashCopyToast._t);
  flashCopyToast._t = setTimeout(() => t.classList.add("hidden"), 1400);
}

function initToolbar() {
  el_("copyBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(cm.getValue());
    } catch (e) {
      cm.execCommand("selectAll");
      document.execCommand("copy");
    }
    flashCopyToast();
  });

  el_("clearBtn").addEventListener("click", () => {
    if (cm.getValue().trim() === "" || confirm("Clear the editor? This can't be undone.")) {
      cm.setValue("");
      resetRun();
      cm.focus();
    }
  });

  el_("downloadBtn").addEventListener("click", () => {
    const blob = new Blob([cm.getValue()], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "source.py";
    a.click();
    URL.revokeObjectURL(url);
  });

  el_("uploadBtn").addEventListener("click", () => el_("fileInput").click());
  el_("fileInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      cm.setValue(String(reader.result));
      resetRun();
      exampleSelect.value = "";
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  let wrapped = false;
  el_("wrapBtn").addEventListener("click", () => {
    wrapped = !wrapped;
    cm.setOption("lineWrapping", wrapped);
    el_("wrapBtn").classList.toggle("is-on", wrapped);
  });

  let fontSize = 13.5;
  function applyFontSize() {
    document.documentElement.style.setProperty("--code-size", fontSize + "px");
    cm.refresh();
  }
  el_("fontPlusBtn").addEventListener("click", () => {
    fontSize = Math.min(22, fontSize + 1);
    applyFontSize();
  });
  el_("fontMinusBtn").addEventListener("click", () => {
    fontSize = Math.max(10, fontSize - 1);
    applyFontSize();
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
  cm.clearGutter("cm-trace-gutter");
  if (lineNo && lineNo >= 1 && lineNo <= cm.lineCount()) {
    activeLineHandle = cm.addLineClass(lineNo - 1, "background", "cm-active-line");
    const marker = el("div", { class: "trace-arrow", text: "▶" });
    cm.setGutterMarker(lineNo - 1, "cm-trace-gutter", marker);
    cm.scrollIntoView({ line: lineNo - 1, ch: 0 }, 80);
  } else {
    activeLineHandle = null;
  }
}

let errorLineHandle = null;
let errorMark = null;
function clearErrorMark() {
  cm.clearGutter("cm-error-gutter");
  if (errorMark) { errorMark.clear(); errorMark = null; }
  errorLineHandle = null;
}
function markErrorLine(lineNo) {
  clearErrorMark();
  if (!lineNo || lineNo < 1 || lineNo > cm.lineCount()) return;
  const idx = lineNo - 1;
  cm.setGutterMarker(idx, "cm-error-gutter", el("div", { class: "error-gutter-dot" }));
  const lineText = cm.getLine(idx);
  const from = { line: idx, ch: 0 };
  const to = { line: idx, ch: lineText.length };
  errorMark = cm.markText(from, to, { className: "cm-error-underline" });
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
  clearErrorMark();
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
    const m = result.error.match(/on line (\d+)/);
    const errLine = m ? parseInt(m[1], 10) : null;
    if (errLine) {
      markErrorLine(errLine);
      errorBar.onclick = () => {
        cm.setCursor({ line: errLine - 1, ch: 0 });
        cm.scrollIntoView({ line: errLine - 1, ch: 0 }, 80);
        cm.focus();
      };
    } else {
      errorBar.onclick = null;
    }
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
initToolbar();
initExamples();
