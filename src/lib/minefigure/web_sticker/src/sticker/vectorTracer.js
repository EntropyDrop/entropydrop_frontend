/**
 * Vector contour tracer: converts raster cutter masks into clean, ultra-compact SVG vector polygons.
 * Matches VTracer output with `width="210mm" height="297mm" viewBox="0 0 4200 5940"`.
 */

/**
 * Traces connected boundaries in a binary mask using Marching Squares contour extraction.
 * @param {Uint8Array} mask Binary grid of size width * height (1 = shape, 0 = background)
 * @param {number} width
 * @param {number} height
 * @returns {Array<Array<[number, number]>>} List of closed polygon loops
 */
export function traceContours(mask, width, height) {
  // Edge lookup table for 2x2 marching squares cells
  // Vertices of cell: (x, y), (x+1, y), (x+1, y+1), (x, y+1)
  // Segments: 0=top, 1=right, 2=bottom, 3=left
  const horizontalEdges = new Map(); // key: `${x},${y}` -> next edge
  const verticalEdges = new Map();

  // Find all boundary segments between foreground (1) and background (0)
  const segments = [];

  // Horizontal boundaries (between (x, y-1) and (x, y))
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x < width; x++) {
      const top = y > 0 ? mask[(y - 1) * width + x] : 0;
      const bot = y < height ? mask[y * width + x] : 0;
      if (top !== bot) {
        if (top === 1 && bot === 0) {
          // Edge from (x, y) to (x+1, y)
          segments.push([[x, y], [x + 1, y]]);
        } else {
          // Edge from (x+1, y) to (x, y)
          segments.push([[x + 1, y], [x, y]]);
        }
      }
    }
  }

  // Vertical boundaries (between (x-1, y) and (x, y))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x <= width; x++) {
      const left = x > 0 ? mask[y * width + (x - 1)] : 0;
      const right = x < width ? mask[y * width + x] : 0;
      if (left !== right) {
        if (left === 0 && right === 1) {
          // Edge from (x, y) to (x, y+1)
          segments.push([[x, y], [x, y + 1]]);
        } else {
          // Edge from (x, y+1) to (x, y)
          segments.push([[x, y + 1], [x, y]]);
        }
      }
    }
  }

  // Build adjacency map: fromKey -> Array<toKey>
  const adj = new Map();
  const pointMap = new Map();

  const key = (p) => `${p[0]},${p[1]}`;

  for (const [p1, p2] of segments) {
    const k1 = key(p1);
    const k2 = key(p2);
    pointMap.set(k1, p1);
    pointMap.set(k2, p2);

    if (!adj.has(k1)) adj.set(k1, []);
    adj.get(k1).push(k2);
  }

  // Traverse adjacency to form closed polygon loops
  const visitedEdges = new Set();
  const loops = [];

  for (const [k1, toList] of adj.entries()) {
    for (const k2 of toList) {
      const edgeKey = `${k1}->${k2}`;
      if (visitedEdges.has(edgeKey)) continue;

      const loop = [];
      let cur = k1;
      let next = k2;

      while (cur && next) {
        const eKey = `${cur}->${next}`;
        if (visitedEdges.has(eKey)) break;
        visitedEdges.add(eKey);

        loop.push(pointMap.get(cur));

        const nextList = adj.get(next);
        if (!nextList || nextList.length === 0) break;

        // Choose unvisited next edge
        let chosenNext = null;
        for (const candidate of nextList) {
          if (!visitedEdges.has(`${next}->${candidate}`)) {
            chosenNext = candidate;
            break;
          }
        }

        cur = next;
        next = chosenNext;

        if (cur === k1) {
          break; // Closed loop
        }
      }

      if (loop.length >= 3) {
        // Simplify collinear points along straight lines
        const simplified = simplifyCollinear(loop);
        if (simplified.length >= 3) {
          loops.push(simplified);
        }
      }
    }
  }

  return loops;
}

/**
 * Removes redundant points that lie along the same horizontal or vertical straight line.
 * @param {Array<[number, number]>} points
 * @returns {Array<[number, number]>}
 */
function simplifyCollinear(points, preserve = () => false) {
  if (points.length <= 2) return points;

  const result = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];

    const dx1 = cur[0] - prev[0];
    const dy1 = cur[1] - prev[1];
    const dx2 = next[0] - cur[0];
    const dy2 = next[1] - cur[1];

    // Check if vectors (dx1, dy1) and (dx2, dy2) are parallel in the same direction
    const isHorizontal = dy1 === 0 && dy2 === 0 && dx1 * dx2 > 0;
    const isVertical = dx1 === 0 && dx2 === 0 && dy1 * dy2 > 0;

    if (preserve(cur) || (!isHorizontal && !isVertical)) {
      result.push(cur);
    }
  }

  return result;
}

/**
 * Converts closed polygon loops to an SVG path 'd' attribute string.
 * @param {Array<Array<[number, number]>>} loops
 * @returns {string}
 */
export function loopsToSvgPathData(loops, coordinateScale = 1) {
  let pathD = '';
  for (const loop of loops) {
    if (loop.length < 3) continue;
    pathD += `M${loop[0][0] * coordinateScale},${loop[0][1] * coordinateScale} `;
    for (let i = 1; i < loop.length; i++) {
      pathD += `L${loop[i][0] * coordinateScale},${loop[i][1] * coordinateScale} `;
    }
    pathD += 'Z ';
  }
  return pathD.trim();
}

/**
 * Sample each layer on exactly the same trace grid.
 */
function traceCanvasMask(cutterCanvas, coordinateScale) {
  const w = cutterCanvas.width;
  const h = cutterCanvas.height;
  const traceW = Math.ceil(w / coordinateScale);
  const traceH = Math.ceil(h / coordinateScale);

  // Read the same source pixel for every layer. Browser drawImage downsampling
  // can filter alpha even with smoothing disabled, creating gaps between
  // complementary masks and turning one shared cut into two parallel cuts.
  // Bounded strips avoid allocating a full 100 MB A4 RGBA copy per layer.
  const ctx = cutterCanvas.getContext('2d', { willReadFrequently: true });
  const mask = new Uint8Array(traceW * traceH);
  const offset = Math.floor(coordinateScale / 2);
  const stripRows = 64;
  for (let row = 0; row < traceH; row += stripRows) {
    const end = Math.min(traceH, row + stripRows);
    const sourceY = Math.min(h - 1, row * coordinateScale + offset);
    const lastY = Math.min(h - 1, (end - 1) * coordinateScale + offset);
    const data = ctx.getImageData(0, sourceY, w, lastY - sourceY + 1).data;
    for (let y = row; y < end; y++) {
      const localY = Math.min(h - 1, y * coordinateScale + offset) - sourceY;
      for (let x = 0; x < traceW; x++) {
        const sourceX = Math.min(w - 1, x * coordinateScale + offset);
        mask[y * traceW + x] = data[(localY * w + sourceX) * 4 + 3] > 128 ? 1 : 0;
      }
    }
  }

  return { mask, width: traceW, height: traceH };
}

function cutterCanvases(source) {
  const canvases = Array.isArray(source) ? source : [source];
  const first = canvases[0];
  if (!first || canvases.some((canvas) => !canvas || canvas.width !== first.width || canvas.height !== first.height)) {
    throw new Error('切割图层必须具有相同的页面尺寸');
  }
  return canvases;
}

function simplifyOpenPath(points, preserve = () => false) {
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const straight = (a[0] === b[0] && b[0] === c[0] && (b[1] - a[1]) * (c[1] - b[1]) > 0)
      || (a[1] === b[1] && b[1] === c[1] && (b[0] - a[0]) * (c[0] - b[0]) > 0);
    if (preserve(b) || !straight) result.push(b);
  }
  result.push(points[points.length - 1]);
  return result;
}

/**
 * Build an undirected graph directly from mask boundaries. Unit edges make
 * full overlaps, partial overlaps and opposite winding the same edge, even
 * within one layer. No polygon closure can introduce an extra segment.
 */
function cutterGraph(canvases, coordinateScale) {
  const stride = Math.ceil(canvases[0].width / coordinateScale) + 1;
  const height = Math.ceil(canvases[0].height / coordinateScale);
  const union = new Uint8Array((stride - 1) * height);
  const keys = new Set();
  const edges = [];
  const connect = (a, b) => {
    edges.push({ a, b, virtual: false, outline: false });
  };
  const add = (x, y, vertical) => {
    const a = y * stride + x;
    const key = a * 2 + (vertical ? 1 : 0);
    if (keys.has(key)) return;
    keys.add(key);
    connect(a, a + (vertical ? stride : 1));
  };

  for (const canvas of canvases) {
    const { mask, width, height } = traceCanvasMask(canvas, coordinateScale);
    for (let i = 0; i < mask.length; i++) union[i] |= mask[i];
    for (let y = 0; y <= height; y++) {
      for (let x = 0; x < width; x++) {
        const above = y > 0 ? mask[(y - 1) * width + x] : 0;
        const below = y < height ? mask[y * width + x] : 0;
        if (above !== below) add(x, y, false);
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x <= width; x++) {
        const left = x > 0 ? mask[y * width + x - 1] : 0;
        const right = x < width ? mask[y * width + x] : 0;
        if (left !== right) add(x, y, true);
      }
    }
  }
  // The union supplies the complete silhouette and hole boundaries. Keep
  // these cycles together before attaching any internal layer interfaces.
  const width = stride - 1;
  for (const edge of edges) {
    const x = edge.a % stride;
    const y = Math.floor(edge.a / stride);
    if (edge.b - edge.a === 1) {
      const above = y > 0 ? union[(y - 1) * width + x] : 0;
      const below = y < height ? union[y * width + x] : 0;
      edge.outline = above !== below;
    } else {
      const left = x > 0 ? union[y * width + x - 1] : 0;
      const right = x < width ? union[y * width + x] : 0;
      edge.outline = left !== right;
    }
  }
  return { edges, stride, union, width, height };
}

function vectorPointKey(point) {
  return point.map((value) => Number(value.toFixed(8))).join(',');
}

/** Clip each unique mask edge against analytic circles, then add each arc once. */
function circularHoleGraph(source, circles, tolerance) {
  const epsilon = 1e-9;
  const tau = Math.PI * 2;
  const vertexPoints = [], vertexIds = new Map(), edgeIds = new Set(), edges = [];
  const key = vectorPointKey;
  const vertex = (point) => {
    const id = key(point);
    if (!vertexIds.has(id)) {
      vertexIds.set(id, vertexPoints.length);
      vertexPoints.push(point.map((value) => Number(value.toFixed(8))));
    }
    return vertexIds.get(id);
  };
  const connect = (start, end, outline) => {
    const a = vertex(start), b = vertex(end);
    if (a === b) return;
    const id = `${Math.min(a, b)},${Math.max(a, b)}`;
    if (edgeIds.has(id)) throw new Error('圆孔刀路包含重复线段，已停止生成');
    edgeIds.add(id);
    edges.push({ a, b, outline, virtual: false });
  };
  const cuts = circles.map(({ cx, cy, radius }) => {
    const point = [cx + radius, cy];
    return new Map([[key(point), { angle: 0, point }]]);
  });
  const inside = ([x, y], circle) => (x - circle.cx) ** 2 + (y - circle.cy) ** 2 < circle.radius ** 2;
  const sourcePoint = (id) => [id % source.stride, Math.floor(id / source.stride)];
  for (const edge of source.edges) {
    const a = sourcePoint(edge.a), b = sourcePoint(edge.b);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const at = (t) => [a[0] + t * dx, a[1] + t * dy];
    const parameters = [0, 1];
    for (const [index, circle] of circles.entries()) {
      const ox = a[0] - circle.cx, oy = a[1] - circle.cy;
      const aa = dx * dx + dy * dy, bb = 2 * (ox * dx + oy * dy);
      const cc = ox * ox + oy * oy - circle.radius ** 2;
      const discriminant = bb * bb - 4 * aa * cc;
      if (discriminant < -epsilon) continue;
      const root = Math.sqrt(Math.max(0, discriminant));
      for (let t of [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)]) {
        if (t < -epsilon || t > 1 + epsilon) continue;
        t = t < epsilon ? 0 : t > 1 - epsilon ? 1 : t;
        parameters.push(t);
        const point = at(t);
        let angle = Math.atan2(point[1] - circle.cy, point[0] - circle.cx);
        if (angle < 0) angle += tau;
        if (angle < epsilon || tau - angle < epsilon) angle = 0;
        cuts[index].set(key(point), { angle, point });
      }
    }
    parameters.sort((a, b) => a - b);
    for (let i = 1; i < parameters.length; i++) {
      const start = parameters[i - 1], end = parameters[i];
      if (end <= start || circles.some((circle) => inside(at((start + end) / 2), circle))) continue;
      connect(at(start), at(end), edge.outline);
    }
  }

  for (const [index, circle] of circles.entries()) {
    const intersections = [...cuts[index].values()].sort((a, b) => a.angle - b.angle);
    const onCircle = (angle) => [circle.cx + circle.radius * Math.cos(angle), circle.cy + circle.radius * Math.sin(angle)];
    // At least 128 segments per full circle; the sagitta is also bounded.
    const angleStep = Math.min(Math.PI / 64, 2 * Math.acos(Math.max(-1, 1 - tolerance / circle.radius)));
    for (let i = 0; i < intersections.length; i++) {
      const start = intersections[i], end = intersections[(i + 1) % intersections.length];
      const endAngle = end.angle + (i === intersections.length - 1 ? tau : 0);
      const span = endAngle - start.angle;
      if (span <= 0) continue;
      const middle = onCircle(start.angle + span / 2);
      const x = Math.floor(middle[0]), y = Math.floor(middle[1]);
      // A circle crossing existing transparent skin contributes only the arcs
      // bordering sticker material. Internal core/decor seams end on the arc.
      if (x < 0 || y < 0 || x >= source.width || y >= source.height || !source.union[y * source.width + x]) continue;
      if (circles.some((other, j) => j !== index && inside(middle, other))) continue;
      const count = Math.max(1, Math.ceil(span / angleStep));
      let previous = start.point;
      for (let j = 1; j <= count; j++) {
        const point = j === count ? end.point : onCircle(start.angle + span * j / count);
        connect(previous, point, true);
        previous = point;
      }
    }
  }
  return { edges, vertexPoints, vertexIds };
}

/** Join touching boundaries into edge-disjoint trails with no retracing. */
function graphTrails({ edges, adjacent, vertexPoints }) {
  const realEdgeCount = edges.length;
  const seenVertices = new Set();
  const components = [];
  const otherEnd = (edge, vertex) => edge.a === vertex ? edge.b : edge.a;
  for (const root of adjacent.keys()) {
    if (seenVertices.has(root)) continue;
    const vertices = [root];
    const odd = [];
    seenVertices.add(root);
    for (let i = 0; i < vertices.length; i++) {
      const vertex = vertices[i];
      const neighbors = adjacent.get(vertex);
      if (neighbors.length % 2) odd.push(vertex);
      for (const index of neighbors) {
        const next = otherEnd(edges[index], vertex);
        if (!seenVertices.has(next)) {
          seenVertices.add(next);
          vertices.push(next);
        }
      }
    }
    // Pair odd-degree junctions temporarily to obtain an Euler circuit. These
    // virtual links are removed below; they are never drawn or sent to a cutter.
    for (let i = 0; i < odd.length; i += 2) {
      const index = edges.length;
      edges.push({ a: odd[i], b: odd[i + 1], virtual: true });
      adjacent.get(odd[i]).push(index);
      adjacent.get(odd[i + 1]).push(index);
    }
    components.push({ root, open: odd.length > 0 });
  }

  const used = new Uint8Array(edges.length);
  const paths = [];
  let consumed = 0;
  for (const { root, open } of components) {
    const stack = [root];
    const incoming = [];
    const circuit = [];
    const circuitEdges = [];
    while (stack.length) {
      const vertex = stack[stack.length - 1];
      const previous = stack[stack.length - 2];
      let chosen = -1;
      let best = -Infinity;
      for (const index of adjacent.get(vertex)) {
        if (used[index]) continue;
        const edge = edges[index];
        const next = otherEnd(edge, vertex);
        // Prefer a straight continuation at a shared junction; postpone the
        // virtual links. Every real edge still appears exactly once.
        let straight = previous !== undefined && vertex - previous === next - vertex;
        if (vertexPoints && previous !== undefined) {
          const a = vertexPoints[previous], b = vertexPoints[vertex], c = vertexPoints[next];
          const dx1 = b[0] - a[0], dy1 = b[1] - a[1], dx2 = c[0] - b[0], dy2 = c[1] - b[1];
          straight = dx1 * dx2 + dy1 * dy2 > 0
            && Math.abs(dx1 * dy2 - dy1 * dx2) <= 1e-9 * Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2);
        }
        const score = edge.virtual ? -1 : straight ? 1 : 0;
        if (score > best) {
          chosen = index;
          best = score;
        }
      }
      if (chosen >= 0) {
        used[chosen] = 1;
        if (!edges[chosen].virtual) consumed++;
        incoming.push(chosen);
        stack.push(otherEnd(edges[chosen], vertex));
      } else {
        circuit.push(stack.pop());
        if (incoming.length) circuitEdges.push(incoming.pop());
      }
    }
    circuit.reverse();
    circuitEdges.reverse();
    if (!open) {
      paths.push({ vertices: circuit, closed: true });
      continue;
    }

    // Split at virtual links, including the wraparound. Shared networks remain
    // open instead of closing a core loop and leaving detached decor fragments.
    const cut = circuitEdges.findIndex((index) => edges[index].virtual);
    let run = [];
    const flush = () => {
      if (run.length > 1) paths.push({ vertices: run, closed: false });
      run = [];
    };
    for (let step = 1; step <= circuitEdges.length; step++) {
      const index = (cut + step) % circuitEdges.length;
      if (edges[circuitEdges[index]].virtual) {
        flush();
      } else {
        if (!run.length) run.push(circuit[index]);
        run.push(circuit[index + 1]);
      }
    }
    flush();
  }
  if (consumed !== realEdgeCount) throw new Error('刀路合并未覆盖全部唯一线段，已停止生成');
  return paths;
}

function subsetGraph(graph, outline) {
  const edges = graph.edges.filter((edge) => edge.outline === outline);
  const adjacent = new Map();
  for (const [index, edge] of edges.entries()) {
    for (const vertex of [edge.a, edge.b]) {
      if (!adjacent.has(vertex)) adjacent.set(vertex, []);
      adjacent.get(vertex).push(index);
    }
  }
  return { edges, adjacent, vertexPoints: graph.vertexPoints };
}

/** Splice each whole contour into one touching trail, without splitting it. */
function attachContours(contours, supplements) {
  const paths = supplements.filter((path) => !path.closed);
  const pending = contours.concat(supplements.filter((path) => path.closed));
  pending.sort((a, b) => b.vertices.length - a.vertices.length);
  const owners = new Map();
  const register = (path, vertices) => {
    for (const vertex of vertices) {
      if (!owners.has(vertex)) owners.set(vertex, new Set());
      owners.get(vertex).add(path);
    }
  };
  for (const path of paths) register(path, path.vertices);

  while (pending.length) {
    let progress = false;
    for (let i = 0; i < pending.length;) {
      const contour = pending[i];
      let target = null;
      let join = -1;
      for (let j = 0; j < contour.vertices.length - 1; j++) {
        for (const candidate of owners.get(contour.vertices[j]) ?? []) {
          if (!target || candidate.vertices.length > target.vertices.length) {
            target = candidate;
            join = j;
          }
        }
      }
      if (!target) {
        i++;
        continue;
      }
      const vertex = contour.vertices[join];
      const at = target.vertices.indexOf(vertex);
      const rotated = contour.vertices.slice(join, -1).concat(contour.vertices.slice(0, join + 1));
      target.vertices = target.vertices.slice(0, at).concat(rotated, target.vertices.slice(at + 1));
      target.outline ||= contour.outline;
      register(target, contour.vertices);
      pending.splice(i, 1);
      progress = true;
    }
    if (!progress) {
      // An isolated closed component has no open trail to attach to. Starting
      // with it also allows any other touching cycles to be absorbed next.
      const path = pending.shift();
      paths.push(path);
      register(path, path.vertices);
    }
  }
  return paths.sort((a, b) => Number(Boolean(b.outline)) - Number(Boolean(a.outline))
    || b.vertices.length - a.vertices.length);
}

/** Visit 10 mm high strips from top to bottom, taking the nearest stroke next. */
function orderPathsForCutting(paths, coordinateScale) {
  const bandHeight = Math.max(1, Math.round(200 / coordinateScale));
  const safeStartLength = Math.max(2, Math.ceil(40 / coordinateScale));
  const groups = new Map();
  const distance2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const midpoint = (a, b) => {
    const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
    if (a[0] === b[0]) return [a[0], Math.floor(y)];
    if (a[1] === b[1]) return [Math.floor(x), a[1]];
    return [x, y];
  };
  for (const [index, path] of paths.entries()) {
    const top = path.points.reduce((minimum, point) => Math.min(minimum, point[1]), Infinity);
    const band = Math.floor(top / bandHeight);
    if (!groups.has(band)) groups.set(band, []);
    groups.get(band).push({ path, index, top });
  }

  const ordered = [];
  let previous = [0, 0];
  for (const band of [...groups.keys()].sort((a, b) => a - b)) {
    const remaining = groups.get(band);
    while (remaining.length) {
      let best = null;
      for (const item of remaining) {
        const { points, closed } = item.path;
        let entries;
        if (!closed) {
          entries = [
            { start: points[0], end: points[points.length - 1], reverse: false },
            { start: points[points.length - 1], end: points[0], reverse: true },
          ];
        } else {
          const lengths = points.map((point, i) =>
            Math.hypot(point[0] - points[(i + 1) % points.length][0],
              point[1] - points[(i + 1) % points.length][1]));
          const longest = lengths.reduce((maximum, length) => Math.max(maximum, length), 0);
          entries = lengths.flatMap((length, i) => length >= safeStartLength
            ? [{ start: midpoint(points[i], points[(i + 1) % points.length]), edge: i }] : []);
          if (!entries.length) {
            const i = lengths.indexOf(longest);
            const a = points[i], b = points[(i + 1) % points.length];
            entries = [{ start: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], edge: -1 }];
          }
        }
        for (const entry of entries) {
          const candidate = { item, entry, cost: distance2(previous, entry.start) };
          if (!best || candidate.cost < best.cost
              || (candidate.cost === best.cost && (item.top < best.item.top
                || (item.top === best.item.top && item.index < best.item.index)))) best = candidate;
        }
      }
      const { item, entry } = best;
      remaining.splice(remaining.indexOf(item), 1);
      if (item.path.closed && entry.edge >= 0) {
        const points = item.path.points;
        item.path.points = [entry.start, ...points.slice(entry.edge + 1), ...points.slice(0, entry.edge + 1)];
        previous = entry.start;
      } else if (entry.reverse) {
        item.path.points.reverse();
        previous = entry.end;
      } else {
        previous = entry.end ?? entry.start;
      }
      ordered.push(item.path);
    }
  }
  return ordered;
}

/** Validate exact grid coverage, including implicit closing segments. */
function validatePathCoverage(paths, { edges, stride }) {
  const edgeKey = (a, b) => Math.min(a, b) * 2 + (Math.abs(b - a) === stride ? 1 : 0);
  const remaining = new Set(edges.map(({ a, b }) => edgeKey(a, b)));
  for (const { points, closed } of paths) {
    const count = points.length - (closed ? 0 : 1);
    for (let i = 0; i < count; i++) {
      const [x, y] = points[i];
      const [endX, endY] = points[(i + 1) % points.length];
      const dx = Math.sign(endX - x);
      const dy = Math.sign(endY - y);
      const length = Math.abs(endX - x) + Math.abs(endY - y);
      if ((dx && dy) || !length) throw new Error('刀路包含无效连接线，已停止生成');
      let vertex = y * stride + x;
      const step = dx + dy * stride;
      for (let j = 0; j < length; j++, vertex += step) {
        if (!remaining.delete(edgeKey(vertex, vertex + step))) {
          throw new Error('刀路包含重复边或额外连接线，已停止生成');
        }
      }
    }
  }
  if (remaining.size) throw new Error('刀路存在遗漏边，已停止生成');
}

function graphPaths(graph, coordinateScale, ordered = true) {
  const contours = graphTrails(subsetGraph(graph, true));
  if (contours.some((path) => !path.closed)) throw new Error('外轮廓未闭合，已停止生成');
  for (const contour of contours) contour.outline = true;
  const supplements = graphTrails(subsetGraph(graph, false));
  const point = (vertex) => graph.vertexPoints?.[vertex] ?? [vertex % graph.stride, Math.floor(vertex / graph.stride)];
  const degree = new Map();
  for (const { a, b } of graph.edges) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  const preserve = ([x, y]) => degree.get(graph.vertexPoints ? graph.vertexIds.get(vectorPointKey([x, y])) : y * graph.stride + x) !== 2;
  const trails = attachContours(contours, supplements);
  if (graph.vertexPoints) {
    const edgeKey = (a, b) => `${Math.min(a, b)},${Math.max(a, b)}`;
    const remaining = new Set(graph.edges.map(({ a, b }) => edgeKey(a, b)));
    for (const { vertices } of trails) for (let i = 1; i < vertices.length; i++) {
      if (!remaining.delete(edgeKey(vertices[i - 1], vertices[i]))) throw new Error('圆孔刀路包含重复边或额外连接线，已停止生成');
    }
    if (remaining.size) throw new Error('圆孔刀路存在遗漏边，已停止生成');
  }
  const paths = trails.map(({ vertices, closed }) => ({
    points: closed ? simplifyCollinear(vertices.slice(0, -1).map(point), preserve) : simplifyOpenPath(vertices.map(point), preserve),
    closed,
  }));
  if (!graph.vertexPoints) validatePathCoverage(paths, graph);
  if (!ordered) return paths;
  const result = orderPathsForCutting(paths, coordinateScale);
  if (!graph.vertexPoints) validatePathCoverage(result, graph);
  return result;
}

/** Exact circle/straight-edge intersections with a bounded smooth approximation. */
export function traceCutterPathsWithCircularHoles(source, circles, { tolerance = 0.1 } = {}) {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('圆孔刀路细分误差必须大于 0');
  if (circles.some(({ cx, cy, radius }) => ![cx, cy, radius].every(Number.isFinite) || radius <= 0)) throw new Error('圆孔刀路几何无效');
  const graph = circularHoleGraph(cutterGraph(cutterCanvases(source), 1), circles, tolerance);
  return graphPaths(graph, 1, false);
}

/**
 * Trace one mask or independent layer masks, preserving internal cutting seams.
 * All grid edges are unique; touching core/decor paths are joined without
 * adding connector cuts. Holes and internal layer interfaces remain intact.
 * Vector faces replace their raster masks and are sorted with the other cuts.
 * @returns {Array<{points: Array<[number, number]>, closed: boolean}>} Source coordinates.
 */
export function traceCutterPaths(source, { traceScale = 2, vectorPaths = [] } = {}) {
  const canvases = cutterCanvases(source);
  const coordinateScale = Math.max(1, Math.floor(traceScale));
  const paths = graphPaths(cutterGraph(canvases, coordinateScale), coordinateScale, !vectorPaths.length)
    .map(({ points, closed }) => ({ points: points.map(([x, y]) => [x * coordinateScale, y * coordinateScale]), closed }));
  if (!vectorPaths.length) return paths;
  // Clone stored vector paths: choosing an entry/reversing a stroke must not
  // mutate the page's geometry between preview, download and a cutting request.
  return orderPathsForCutting(paths.concat(vectorPaths.map(({ points, closed }) => ({ points: [...points], closed }))), 1);
}

/** Serialize the shared raster/vector geometry using only straight SVG lines. */
export function traceCutterPathData(source, options) {
  const paths = traceCutterPaths(source, options);
  const number = (value) => Number(value.toFixed(6));
  return paths.map(({ points, closed }) => {
    const commands = points.map(([x, y], index) => `${index ? 'L' : 'M'}${number(x)},${number(y)}`);
    return commands.join(' ') + (closed ? ' Z' : '');
  }).join(' ');
}

/**
 * Converts a cutter canvas into a vector SVG document string.
 * @param {HTMLCanvasElement | OffscreenCanvas | Array<HTMLCanvasElement | OffscreenCanvas>} source
 * @param {Object} options
 * @param {string} [options.fillColor='#2368A5']
 * @param {string} [options.strokeColor='none']
 * @param {number} [options.strokeWidth=1]
 * @param {number} [options.traceScale=2] Raster pixels per traced mask pixel.
 * @param {Array<{points: Array<[number, number]>, closed: boolean}>} [options.vectorPaths=[]]
 * @returns {string} Complete SVG XML string
 */
export function generateCutterSVG(source, {
  fillColor = '#2368A5',
  strokeColor = 'none',
  strokeWidth = 1,
  includeBackground = true,
  traceScale = 2,
  vectorPaths = [],
} = {}) {
  const first = cutterCanvases(source)[0];
  const w = first.width;
  const h = first.height;
  const pathD = traceCutterPathData(source, { traceScale, vectorPaths });

  const bgRect = includeBackground ? '<rect width="100%" height="100%" fill="white"/>\n' : '';
  const fillAttr = fillColor !== 'none' ? `fill="${fillColor}"` : 'fill="none"';
  const strokeAttr = strokeColor !== 'none' ? `stroke="${strokeColor}" stroke-width="${strokeWidth}"` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Minefigure Web Sticker SVG Vectorizer -->
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 ${w} ${h}">
${bgRect}<path d="${pathD}" ${fillAttr} ${strokeAttr} fill-rule="evenodd"/>
</svg>
`;
}

/** Shared export for preview downloads and the actual cutting request. */
export function generatePageCutterSVG(page, { includeBackground = true } = {}) {
  return generateCutterSVG(page.cutterLayers ?? page.cutterCanvas, {
    ...page.cutterTraceOptions,
    fillColor: 'none', strokeColor: '#2368A5', strokeWidth: 2, includeBackground,
  });
}

/** Preview uses exactly the same vector faces as SVG export and cutting. */
export function tracePageCutterPathData(page) {
  return traceCutterPathData(page.cutterLayers ?? page.cutterCanvas, page.cutterTraceOptions);
}
