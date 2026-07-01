# tracepy — step through Python, watch the structures move

A static, single-page site: paste Python on the left, press **Run**, and step
through the program line by line while the right pane renders every variable
as the data structure it actually is — array boxes, a stack with a TOP
pointer, a queue with FRONT/REAR, a linked list of connected nodes, a binary
tree / BST / AVL diagram with balance factors, a hash map table, a set of
chips, a heap.

It runs entirely in the browser (Python is executed via
[Skulpt](https://skulpt.org)) — no backend, no build step, so it deploys to
GitHub Pages as-is.

## Deploying to GitHub Pages

1. Create a new repo (or use an existing one) and add these files at the
   repo root: `index.html`, `style.css`, `app.js`, `tracer.js`,
   `visualizers.js`, `examples.js`.
2. Commit and push to `main`.
3. In the repo, go to **Settings → Pages**, set **Source** to
   `Deploy from a branch`, branch `main`, folder `/ (root)`, save.
4. GitHub gives you a URL like `https://<user>.github.io/<repo>/` a minute
   or two later. No build step, no dependencies to install.

Locally you can just open `index.html` in a browser, or run a static
server (`python -m http.server`) from this folder.

## How it works

- **Editor (left pane):** CodeMirror with Python syntax highlighting.
- **Execution:** your source is lightly instrumented — a trace call is
  inserted before every eligible line, at that line's own indentation —
  then run through Skulpt. Each trace call serializes every reachable
  variable to JSON *from the Python side* (a small recursive `__snap__`
  helper baked into the run), so the visualizer never has to guess at
  Skulpt's internal object layout.
- **Tape deck (footer):** the full run is captured up front as a list of
  steps, so stepping forward/back/scrubbing is instant — click any frame,
  drag through with Play, or use the arrow keys.
- **Right pane:** each variable gets classified by shape (and, as a
  tie-breaker, by name — `stack`, `queue`, `heap` in the variable name
  nudge the renderer) into one of: scalar, array, stack, queue, heap, set,
  hash map, linked list, tree, or a generic object card as a fallback.

## Supported structures out of the box

| Structure | How to write it | How it's shown |
|---|---|---|
| Array | a plain `list` | numbered boxes |
| Stack | a `list` used with `.append`/`.pop`, or named `stack` | boxes with a TOP marker |
| Queue | `collections.deque`, or a list named `queue`/`dq` | boxes with FRONT/REAR markers |
| Heap | `heapq` + a list named `heap` | array boxes, index-labelled |
| Hash map | a `dict` | key/value table |
| Set | a `set` | chips |
| Linked list | a class with a `next` (or `nxt`) attribute | chained boxes with arrows, cycle-aware |
| Binary tree / BST / AVL | a class with `left`/`right` attributes | node diagram with a balance-factor badge per node |

The **Examples** dropdown in the top bar has one ready-made snippet for
every row above.

## Known limitations (worth knowing before you paste something huge)

- Tracing captures state **before** each line runs, matching how a normal
  debugger's breakpoint works — so a card shows the effect of a line once
  you step past it, not on the line itself.
- Instrumentation is line-based, not a full AST rewrite. It correctly skips
  multi-line brackets/strings and `elif`/`else`/`except`/`finally` headers,
  but very unusual formatting (e.g. multiple statements separated by `;`
  on one line) will be traced as a single step.
- Inside a function call, the right pane shows that function's local
  variables (real debugger semantics) — not the whole program's state at
  once.
- A run is capped at 4000 traced steps to protect the browser from runaway
  loops; you'll get a clear message if that limit is hit.
- Recursion, closures, and generators work through Skulpt's own Python
  support — mainstream educational code (sorting, tree/list operations,
  BFS/DFS, hashing demos) runs well; obscure stdlib modules may not be
  available in Skulpt.
