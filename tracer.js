/*
 * tracer.js
 * ---------
 * Turns arbitrary Python source into a sequence of "steps": one entry per
 * executed line, each carrying a JSON snapshot of every reachable variable
 * at that point.
 *
 * How it works:
 *  1. We insert a call to __trace__(lineNumber, locals()) before every
 *     eligible line of the user's source, preserving original indentation.
 *  2. A Python-side preamble (PREAMBLE below) defines __trace__ and a
 *     recursive, JSON-safe __snap__ serializer. Serialization happens
 *     entirely in Python so we never have to poke at Skulpt's internal
 *     object representation from JavaScript — much more robust.
 *  3. __trace__ prints the JSON wrapped in unique markers. Skulpt's stdout
 *     is captured by a JS callback; after the run finishes we split the
 *     captured text on those markers to recover ordinary print() output
 *     interleaved with trace frames.
 */

const TRACE_OPEN = "\u0001TRACE\u0001";
const TRACE_CLOSE = "\u0001ENDTRACE\u0001";
const MAX_STEPS = 4000;

const PREAMBLE = `
def __jenc__(o):
    if o is None:
        return "null"
    if o is True:
        return "true"
    if o is False:
        return "false"
    if isinstance(o, (int, float)):
        return str(o)
    if isinstance(o, str):
        s = o.replace(chr(92), chr(92)+chr(92))
        s = s.replace('"', chr(92)+'"')
        s = s.replace(chr(10), chr(92)+"n")
        s = s.replace(chr(9), chr(92)+"t")
        return '"' + s + '"'
    if isinstance(o, list):
        return "[" + ",".join([__jenc__(x) for x in o]) + "]"
    if isinstance(o, dict):
        parts = []
        for k in o:
            parts.append(__jenc__(str(k)) + ":" + __jenc__(o[k]))
        return "{" + ",".join(parts) + "}"
    return '"?"'

def __snap__(obj, _seen):
    if obj is None:
        return {"t": "none", "v": None}
    if obj is True or obj is False:
        return {"t": "bool", "v": obj}
    if isinstance(obj, (int, float)):
        return {"t": "num", "v": obj}
    if isinstance(obj, str):
        return {"t": "str", "v": obj}
    try:
        if callable(obj):
            return {"t": "repr", "v": "<function>"}
    except Exception:
        pass
    oid = id(obj)
    if oid in _seen:
        return {"t": "ref", "v": oid}
    if isinstance(obj, list):
        s2 = _seen + [oid]
        return {"t": "list", "v": [__snap__(x, s2) for x in obj]}
    if isinstance(obj, tuple):
        s2 = _seen + [oid]
        return {"t": "tuple", "v": [__snap__(x, s2) for x in obj]}
    if isinstance(obj, (set, frozenset)):
        s2 = _seen + [oid]
        return {"t": "set", "v": [__snap__(x, s2) for x in obj]}
    if isinstance(obj, dict):
        s2 = _seen + [oid]
        items = []
        for k in obj:
            items.append([__snap__(k, s2), __snap__(obj[k], s2)])
        return {"t": "map", "v": items}
    d = None
    try:
        d = obj.__dict__
    except Exception:
        d = None
    if d is not None:
        s2 = _seen + [oid]
        fields = {}
        for k in d:
            ks = str(k)
            if not ks.startswith("__"):
                try:
                    fields[ks] = __snap__(d[k], s2)
                except Exception:
                    fields[ks] = {"t": "repr", "v": "<error>"}
        cname = "object"
        try:
            cname = obj.__class__.__name__
        except Exception:
            cname = "object"
        return {"t": "obj", "cls": cname, "id": oid, "v": fields}
    try:
        return {"t": "repr", "v": repr(obj)}
    except Exception:
        return {"t": "repr", "v": "<unrepr>"}

__stepcount__ = 0
def __trace__(_ln, _locs):
    global __stepcount__
    __stepcount__ = __stepcount__ + 1
    if __stepcount__ > ${MAX_STEPS}:
        raise Exception("Step limit exceeded (possible infinite loop) — stopped after ${MAX_STEPS} steps.")
    _out = {}
    for _k in _locs:
        _ks = str(_k)
        if not _ks.startswith("__"):
            try:
                _out[_ks] = __snap__(_locs[_k], [])
            except Exception:
                _out[_ks] = {"t": "repr", "v": "<error>"}
    print("${TRACE_OPEN}" + __jenc__({"line": _ln, "vars": _out}) + "${TRACE_CLOSE}")

`;

const PREAMBLE_LINES = PREAMBLE.split("\n").length - 1;

/**
 * Scans the source for bracket / string continuation so we don't inject a
 * trace call in the middle of a multi-line statement.
 */
function analyzeContinuations(lines) {
  const continued = new Array(lines.length).fill(false);
  let depth = 0;
  let triple = null; // "'''" or '"""' if currently inside one, else null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const enteringDepth = depth;
    const enteringTriple = triple;
    let j = 0;
    while (j < line.length) {
      const c = line[j];
      if (triple) {
        if (line.substr(j, 3) === triple) { triple = null; j += 3; continue; }
        j++;
        continue;
      }
      if (c === '#') break;
      if (c === "'" || c === '"') {
        if (line.substr(j, 3) === c + c + c) { triple = c + c + c; j += 3; continue; }
        // skip a simple quoted literal on this line if it closes
        const quote = c;
        let k = j + 1;
        while (k < line.length && line[k] !== quote) {
          if (line[k] === '\\') k++;
          k++;
        }
        j = k + 1;
        continue;
      }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
      j++;
    }
    const backslashCont = /\\\s*$/.test(line) && !triple;
    continued[i] = (enteringDepth > 0) || !!enteringTriple || false;
    if (backslashCont) {
      if (i + 1 < lines.length) continued[i + 1] = true;
    }
  }
  return continued;
}

function instrument(source) {
  const rawLines = source.replace(/\r\n/g, "\n").split("\n");
  const continued = analyzeContinuations(rawLines);
  const out = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    const lineNo = i + 1;

    const isBlank = trimmed.length === 0;
    const isComment = trimmed.startsWith("#");
    const isContinuationOfPrev = continued[i];
    const attachesToAbove = /^(elif\b|else\b|except\b|finally\b)/.test(trimmed);

    if (!isBlank && !isComment && !isContinuationOfPrev && !attachesToAbove) {
      const indentMatch = line.match(/^[ \t]*/);
      const indent = indentMatch ? indentMatch[0] : "";
      out.push(`${indent}__trace__(${lineNo}, locals())`);
    }
    out.push(line);
  }

  return PREAMBLE + out.join("\n");
}

function parseTraceOutput(rawOutput) {
  const steps = [];
  let visibleStdout = "";
  let cursor = 0;

  while (true) {
    const openIdx = rawOutput.indexOf(TRACE_OPEN, cursor);
    if (openIdx === -1) {
      visibleStdout += rawOutput.slice(cursor);
      break;
    }
    visibleStdout += rawOutput.slice(cursor, openIdx);
    const closeIdx = rawOutput.indexOf(TRACE_CLOSE, openIdx);
    if (closeIdx === -1) break;
    const jsonText = rawOutput.slice(openIdx + TRACE_OPEN.length, closeIdx);
    cursor = closeIdx + TRACE_CLOSE.length;
    try {
      const parsed = JSON.parse(jsonText);
      steps.push({
        line: parsed.line,
        vars: parsed.vars,
        stdoutSoFar: visibleStdout,
      });
    } catch (e) {
      // skip malformed frame, keep going
    }
  }

  return { steps, finalStdout: visibleStdout };
}

/**
 * Runs `source` and resolves with { steps, finalStdout, error }.
 * error is a friendly string, or null on success.
 */
function runAndTrace(source) {
  return new Promise((resolve) => {
    let buffer = "";

    function outf(text) { buffer += text; }
    function builtinRead(x) {
      if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) {
        throw "File not found: '" + x + "'";
      }
      return Sk.builtinFiles["files"][x];
    }

    Sk.configure({
      output: outf,
      read: builtinRead,
      __future__: Sk.python3,
      execLimit: 15000,
    });

    let instrumented;
    try {
      instrumented = instrument(source);
    } catch (e) {
      resolve({ steps: [], finalStdout: "", error: "Could not prepare code: " + String(e) });
      return;
    }

    const myPromise = Sk.misceval.asyncToPromise(function () {
      return Sk.importMainWithBody("<user>", false, instrumented, true);
    });

    myPromise.then(
      function () {
        const { steps, finalStdout } = parseTraceOutput(buffer);
        resolve({ steps, finalStdout, error: null });
      },
      function (err) {
        const { steps, finalStdout } = parseTraceOutput(buffer);
        let msg = err.toString();
        // shift reported line numbers back so they match the user's original source
        msg = msg.replace(/on line (\d+)/, (m, n) => {
          const orig = parseInt(n, 10) - PREAMBLE_LINES;
          return orig > 0 ? `on line ${orig}` : m;
        });
        resolve({ steps, finalStdout, error: msg });
      }
    );
  });
}
