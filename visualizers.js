/*
 * visualizers.js
 * --------------
 * Given a variable name + its JSON snapshot ({t, v, ...}) from tracer.js,
 * decide what kind of data structure it looks like and build a DOM node
 * to represent it.
 */

const VALUE_KEYS = ["val", "value", "data", "item", "elem", "key", "num", "n"];
const NEXT_KEYS = ["next", "nxt", "nextnode", "next_node"];
const PREV_KEYS = ["prev", "previous", "prv"];
const LEFT_KEYS = ["left", "l", "lchild", "left_child"];
const RIGHT_KEYS = ["right", "r", "rchild", "right_child"];

function firstPresent(fields, keys) {
  for (const k of keys) if (k in fields) return k;
  // case-insensitive fallback
  const lower = {};
  Object.keys(fields).forEach((f) => (lower[f.toLowerCase()] = f));
  for (const k of keys) if (lower[k]) return lower[k];
  return null;
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === "class") node.className = attrs[k];
    else if (k === "text") node.textContent = attrs[k];
    else node.setAttribute(k, attrs[k]);
  }
  (children || []).forEach((c) => c && node.appendChild(c));
  return node;
}

function svgEl(tag, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

function formatScalar(snap) {
  if (!snap) return "?";
  switch (snap.t) {
    case "num": return String(snap.v);
    case "str": return '"' + snap.v + '"';
    case "bool": return snap.v ? "True" : "False";
    case "none": return "None";
    case "ref": return "↺ cycle";
    case "repr": return snap.v;
    case "list": case "tuple": return "[" + snap.v.map(formatScalar).join(", ") + "]";
    case "set": return "{" + snap.v.map(formatScalar).join(", ") + "}";
    case "map": return "{" + snap.v.map((p) => formatScalar(p[0]) + ": " + formatScalar(p[1])).join(", ") + "}";
    case "obj": return snap.cls + "(" + Object.keys(snap.v).map((k) => k + "=" + formatScalar(snap.v[k])).join(", ") + ")";
    default: return String(snap.v);
  }
}

function isNodeShapeObj(snap) {
  return snap && snap.t === "obj" &&
    (firstPresent(snap.v, LEFT_KEYS) || firstPresent(snap.v, RIGHT_KEYS) || firstPresent(snap.v, NEXT_KEYS));
}

/* ---------------- classification ---------------- */

function classify(name, snap) {
  if (!snap) return { kind: "scalar" };
  if (["num", "str", "bool", "none", "repr"].includes(snap.t)) return { kind: "scalar" };

  if (snap.t === "set") return { kind: "set" };
  if (snap.t === "map") return { kind: "map" };

  if (snap.t === "list" || snap.t === "tuple") {
    const els = snap.v;
    if (els.length > 0 && els.every(isNodeShapeObj)) {
      return { kind: "objlist" };
    }
    const n = name.toLowerCase();
    if (n.includes("heap")) return { kind: "heap" };
    if (n.includes("stack")) return { kind: "stack" };
    if (n.includes("queue") || n.startsWith("dq") || n.includes("deque")) return { kind: "queue" };
    return { kind: "array" };
  }

  if (snap.t === "obj") {
    const hasLeft = firstPresent(snap.v, LEFT_KEYS);
    const hasRight = firstPresent(snap.v, RIGHT_KEYS);
    const hasNext = firstPresent(snap.v, NEXT_KEYS);
    if (hasLeft || hasRight) return { kind: "tree" };
    if (hasNext) return { kind: "linkedlist" };
    return { kind: "object" };
  }

  return { kind: "scalar" };
}

const KIND_LABEL = {
  scalar: "scalar", array: "array", stack: "stack", queue: "queue",
  heap: "heap", set: "set", map: "hash map", linkedlist: "linked list",
  tree: "tree", object: "object", objlist: "list of objects",
};

/* ---------------- renderers ---------------- */

function renderScalar(snap) {
  return el("span", { class: "scalar-pill", text: formatScalar(snap) });
}

function renderArrayLike(items, mode) {
  const wrap = el("div", { class: "mode-" + mode });
  const row = el("div", { class: "box-row" });
  items.forEach((item, i) => {
    let tag = "";
    if (mode === "stack" && i === items.length - 1) tag = "TOP";
    if (mode === "queue" && i === 0) tag = "FRONT";
    if (mode === "queue" && i === items.length - 1 && items.length > 1) tag = "REAR";
    const cell = el("div", { class: "box-cell" }, [
      el("div", { class: "box-tag", text: tag }),
      el("div", { class: "box", text: formatScalar(item) }),
      el("div", { class: "box-idx", text: mode === "heap" ? "i=" + i : String(i) }),
    ]);
    row.appendChild(cell);
  });
  wrap.appendChild(row);
  if (items.length === 0) wrap.appendChild(el("div", { class: "box-idx", text: "(empty)" }));
  return wrap;
}

function renderMap(pairs) {
  if (pairs.length === 0) return el("div", { class: "box-idx", text: "(empty map)" });
  const table = el("table", { class: "map-table" });
  table.appendChild(el("tr", null, [el("th", { text: "key" }), el("th", { text: "value" })]));
  pairs.forEach((p) => {
    table.appendChild(el("tr", null, [
      el("td", { class: "k", text: formatScalar(p[0]) }),
      el("td", { class: "v", text: formatScalar(p[1]) }),
    ]));
  });
  return table;
}

function renderSet(items) {
  if (items.length === 0) return el("div", { class: "box-idx", text: "(empty set)" });
  const row = el("div", { class: "chip-row" });
  items.forEach((it) => row.appendChild(el("span", { class: "chip", text: formatScalar(it) })));
  return row;
}

function nodeValueText(snap) {
  const key = firstPresent(snap.v, VALUE_KEYS);
  if (key) return formatScalar(snap.v[key]);
  // fall back to first scalar-ish field
  for (const k in snap.v) {
    const f = snap.v[k];
    if (f && ["num", "str", "bool"].includes(f.t)) return formatScalar(f);
  }
  return snap.cls;
}

function renderLinkedList(head) {
  const values = [];
  let cur = head;
  let guard = 0;
  let cyclic = false;
  while (cur && cur.t === "obj" && guard < 250) {
    values.push(nodeValueText(cur));
    const nk = firstPresent(cur.v, NEXT_KEYS);
    const nxt = nk ? cur.v[nk] : null;
    if (!nxt || nxt.t === "none") { cur = null; break; }
    if (nxt.t === "ref") { cyclic = true; cur = null; break; }
    cur = nxt;
    guard++;
  }

  const boxW = 56, boxH = 40, gap = 34, y = 20;
  const width = values.length * (boxW + gap) + 70;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} 70`, width: Math.min(width, 900), height: 70 });
  svg.appendChild(svgEl("defs")).appendChild(
    (() => {
      const marker = svgEl("marker", { id: "arrowhead", markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: "auto" });
      marker.appendChild(svgEl("path", { d: "M0,0 L6,3 L0,6 Z", fill: "#8592a3" }));
      return marker;
    })()
  );

  let x = 10;
  values.forEach((text, i) => {
    svg.appendChild(svgEl("rect", { x, y, width: boxW, height: boxH, rx: 6, class: "node-rect" }));
    const t = svgEl("text", { x: x + boxW / 2, y: y + boxH / 2 + 4, "text-anchor": "middle", class: "node-text" });
    t.textContent = text;
    svg.appendChild(t);
    if (i < values.length - 1 || cyclic) {
      const lineEnd = i < values.length - 1 ? x + boxW + gap : x + boxW + 20;
      svg.appendChild(svgEl("line", { x1: x + boxW, y1: y + boxH / 2, x2: lineEnd, y2: y + boxH / 2, class: "edge-line" }));
    }
    x += boxW + gap;
  });

  if (!cyclic) {
    const t = svgEl("text", { x: x + 4, y: y + boxH / 2 + 4, class: "node-null" });
    t.textContent = "None";
    svg.appendChild(t);
  } else {
    const t = svgEl("text", { x: x - gap + 10, y: y - 6, class: "node-null" });
    t.textContent = "↺ cycles back";
    svg.appendChild(t);
  }

  const host = el("div", { class: "svg-host" }, [svg]);
  return host;
}

function treeHeight(node) {
  if (!node || node.t !== "obj") return 0;
  const lk = firstPresent(node.v, LEFT_KEYS), rk = firstPresent(node.v, RIGHT_KEYS);
  const l = lk ? node.v[lk] : null, r = rk ? node.v[rk] : null;
  return 1 + Math.max(treeHeight(l), treeHeight(r));
}

function renderTree(root) {
  const positions = [];
  const edges = [];
  let counter = { x: 0 };
  const spacingX = 54, spacingY = 60;

  function build(node, depth) {
    if (!node || node.t !== "obj") return null;
    const lk = firstPresent(node.v, LEFT_KEYS), rk = firstPresent(node.v, RIGHT_KEYS);
    const left = lk ? node.v[lk] : null, right = rk ? node.v[rk] : null;
    const leftPos = left && left.t === "obj" ? build(left, depth + 1) : null;

    const myX = counter.x++;
    const pos = { x: myX * spacingX + 30, y: depth * spacingY + 26, label: nodeValueText(node) };
    const bal = treeHeight(left) - treeHeight(right);
    pos.bal = bal;
    positions.push(pos);
    if (leftPos) edges.push([pos, leftPos]);

    const rightPos = right && right.t === "obj" ? build(right, depth + 1) : null;
    if (rightPos) edges.push([pos, rightPos]);

    return pos;
  }
  build(root, 0);

  const maxX = Math.max(30, ...positions.map((p) => p.x)) + 30;
  const maxY = Math.max(26, ...positions.map((p) => p.y)) + 30;
  const svg = svgEl("svg", { viewBox: `0 0 ${maxX} ${maxY}`, width: Math.min(maxX, 900), height: maxY });

  edges.forEach(([a, b]) => {
    svg.appendChild(svgEl("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "tree-edge" }));
  });
  positions.forEach((p) => {
    svg.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: 18, class: "tree-rect" }));
    const t = svgEl("text", { x: p.x, y: p.y + 4, "text-anchor": "middle", class: "node-text" });
    t.textContent = p.label;
    svg.appendChild(t);
    if (p.bal !== 0) {
      const bt = svgEl("text", { x: p.x + 20, y: p.y - 16, class: "balance-tag" });
      bt.textContent = (p.bal > 0 ? "+" : "") + p.bal;
      svg.appendChild(bt);
    }
  });

  return el("div", { class: "svg-host" }, [svg]);
}

function renderObject(snap) {
  const box = el("div", { class: "obj-box" });
  box.appendChild(el("div", { class: "obj-title", text: snap.cls }));
  Object.keys(snap.v).forEach((k) => {
    const row = el("div", { class: "obj-field" });
    row.innerHTML = `${k}: `;
    const b = document.createElement("b");
    b.textContent = formatScalar(snap.v[k]);
    row.appendChild(b);
    box.appendChild(row);
  });
  return box;
}

function renderObjList(items) {
  const row = el("div", { class: "chip-row" });
  items.forEach((it) => {
    row.appendChild(renderObject(it));
  });
  return row;
}

/* ---------------- entry point ---------------- */

function buildVarCard(name, snap) {
  const { kind } = classify(name, snap);
  const card = el("div", { class: "var-card" });
  const head = el("div", { class: "var-card-head" }, [
    el("span", { class: "var-name", text: name }),
    el("span", { class: "var-kind kind-" + (kind === "linkedlist" ? "list" : kind === "objlist" ? "list" : kind === "object" ? "scalar" : kind), text: KIND_LABEL[kind] || kind }),
  ]);
  const body = el("div", { class: "var-card-body" });

  try {
    switch (kind) {
      case "scalar": body.appendChild(renderScalar(snap)); break;
      case "array": body.appendChild(renderArrayLike(snap.v, "array")); break;
      case "stack": body.appendChild(renderArrayLike(snap.v, "stack")); break;
      case "queue": body.appendChild(renderArrayLike(snap.v, "queue")); break;
      case "heap": body.appendChild(renderArrayLike(snap.v, "heap")); break;
      case "set": body.appendChild(renderSet(snap.v)); break;
      case "map": body.appendChild(renderMap(snap.v)); break;
      case "linkedlist": body.appendChild(renderLinkedList(snap)); break;
      case "tree": body.appendChild(renderTree(snap)); break;
      case "object": body.appendChild(renderObject(snap)); break;
      case "objlist": body.appendChild(renderObjList(snap.v)); break;
      default: body.appendChild(renderScalar(snap));
    }
  } catch (e) {
    body.appendChild(el("span", { class: "scalar-pill", text: "(couldn't render: " + e.message + ")" }));
  }

  card.appendChild(head);
  card.appendChild(body);
  return card;
}
