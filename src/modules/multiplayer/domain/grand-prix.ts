type Point = readonly [number, number];
type Edge = readonly [number, number, number, number];

// Sector layouts are deliberately asymmetric; seeds vary corners, scale and chicanes.
const layouts: Point[][] = [
  [
    [0, 0],
    [110, 0],
    [120, 12],
    [120, 34],
    [96, 44],
    [60, 44],
    [60, 65],
    [100, 65],
    [105, 82],
    [70, 95],
    [30, 80],
    [12, 52],
    [30, 32],
    [0, 28],
  ],
  [
    [0, 0],
    [135, 0],
    [150, 18],
    [135, 36],
    [115, 34],
    [100, 24],
    [80, 28],
    [55, 70],
    [85, 85],
    [75, 104],
    [45, 110],
    [32, 94],
    [36, 68],
    [16, 55],
    [0, 24],
  ],
  [
    [0, 0],
    [120, 0],
    [128, 18],
    [102, 32],
    [90, 56],
    [115, 68],
    [98, 94],
    [75, 86],
    [70, 62],
    [48, 56],
    [52, 32],
    [30, 28],
    [22, 56],
    [38, 76],
    [26, 102],
    [0, 84],
  ],
  [
    [0, 0],
    [100, 0],
    [128, 24],
    [130, 52],
    [104, 66],
    [88, 54],
    [98, 30],
    [76, 25],
    [52, 55],
    [74, 85],
    [52, 106],
    [22, 98],
    [6, 76],
    [20, 52],
    [0, 30],
  ],
  [
    [0, 0],
    [140, 0],
    [148, 22],
    [110, 24],
    [85, 40],
    [118, 58],
    [116, 80],
    [76, 94],
    [52, 78],
    [58, 55],
    [36, 42],
    [16, 68],
    [0, 60],
  ],
];

function randomValues(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const mix = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

function roundedLoop(vertices: Point[], random: () => number): Point[] {
  const corners = vertices.map((point, i) => {
    const previous = vertices[(i + vertices.length - 1) % vertices.length];
    const next = vertices[(i + 1) % vertices.length];
    const incoming = distance(previous, point),
      outgoing = distance(point, next);
    const u: Point = [
      (point[0] - previous[0]) / incoming,
      (point[1] - previous[1]) / incoming,
    ];
    const v: Point = [
      (next[0] - point[0]) / outgoing,
      (next[1] - point[1]) / outgoing,
    ];
    const turn = Math.atan2(
      u[0] * v[1] - u[1] * v[0],
      u[0] * v[0] + u[1] * v[1],
    );
    const trim = Math.min(
      incoming * 0.38,
      outgoing * 0.38,
      (9 + random() * 9) * Math.tan(Math.abs(turn) / 2),
    );
    const radius = trim / Math.tan(Math.abs(turn) / 2);
    const start = mix(point, previous, trim / incoming);
    const end = mix(point, next, trim / outgoing);
    const center: Point = [
      start[0] - u[1] * Math.sign(turn) * radius,
      start[1] + u[0] * Math.sign(turn) * radius,
    ];
    return { start, end, center, radius, turn };
  });
  const scale = Math.max(
    1,
    7.5 / Math.min(...corners.map((corner) => corner.radius)),
  );
  const points: Point[] = [];
  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i];
    const angle = Math.atan2(
      corner.start[1] - corner.center[1],
      corner.start[0] - corner.center[0],
    );
    const steps = Math.max(
      2,
      Math.ceil((Math.abs(corner.turn) * corner.radius * scale) / 1.5),
    );
    for (let j = 0; j < steps; j++) {
      const theta = angle + (corner.turn * j) / steps;
      points.push([
        (corner.center[0] + Math.cos(theta) * corner.radius) * scale,
        (corner.center[1] + Math.sin(theta) * corner.radius) * scale,
      ]);
    }
    const next = corners[(i + 1) % corners.length].start;
    const straightSteps = Math.max(
      1,
      Math.ceil((distance(corner.end, next) * scale) / 1.5),
    );
    for (let j = 0; j < straightSteps; j++) {
      const point = mix(corner.end, next, j / straightSteps);
      points.push([point[0] * scale, point[1] * scale]);
    }
  }
  return points;
}

function roadEdges(points: Point[], halfWidth: number) {
  const sides = [-1, 1].map((side) =>
    points.map((point, i): Point => {
      const previous = points[(i + points.length - 1) % points.length];
      const next = points[(i + 1) % points.length];
      const length = distance(previous, next);
      return [
        point[0] - ((next[1] - previous[1]) / length) * halfWidth * side,
        point[1] + ((next[0] - previous[0]) / length) * halfWidth * side,
      ];
    }),
  );
  return points.flatMap((_, i): Edge[] =>
    sides.map((side): Edge => {
      const a = side[i],
        b = side[(i + 1) % side.length];
      return [a[0], a[1], b[0], b[1]];
    }),
  );
}

function crosses(a: Edge, b: Edge) {
  if (
    Math.max(a[0], a[2]) <= Math.min(b[0], b[2]) ||
    Math.max(b[0], b[2]) <= Math.min(a[0], a[2]) ||
    Math.max(a[1], a[3]) <= Math.min(b[1], b[3]) ||
    Math.max(b[1], b[3]) <= Math.min(a[1], a[3])
  )
    return false;
  const side = (x: number, z: number, edge: Edge) =>
    (edge[2] - edge[0]) * (z - edge[1]) - (edge[3] - edge[1]) * (x - edge[0]);
  return (
    side(b[0], b[1], a) * side(b[2], b[3], a) < -1e-8 &&
    side(a[0], a[1], b) * side(a[2], a[3], b) < -1e-8
  );
}

export function generateGrandPrix(seed: number) {
  const random = randomValues(seed);
  for (let attempt = 0; attempt < 32; attempt++) {
    const layout = layouts[Math.floor(random() * layouts.length)];
    const stretchX = 1.05 + random() * 0.35,
      stretchZ = 1.05 + random() * 0.35;
    const vertices: Point[] = layout.map(([x, z], i) => [
      x * stretchX + (i < 2 ? 0 : (random() - 0.5) * 6),
      z * stretchZ + (i < 2 ? 0 : (random() - 0.5) * 6),
    ]);
    if (random() < 0.65) {
      const end = vertices[1];
      const depth = 9 + random() * 7;
      vertices.splice(
        1,
        0,
        [end[0] * 0.4, 0],
        [end[0] * 0.55, -depth],
        [end[0] * 0.7, -depth],
      );
    }
    let points = roundedLoop(vertices, random);
    const length = points.reduce(
      (sum, point, i) => sum + distance(point, points[(i + 1) % points.length]),
      0,
    );
    if (length > 950) continue;
    const halfWidth = 3.5 + random() * 0.35;
    const edges = roadEdges(points, halfWidth);
    if (
      edges.some((edge, i) =>
        edges.slice(i + 1).some((other) => crosses(edge, other)),
      )
    )
      continue;

    // Put the grid at the midpoint of the longest straight, away from braking zones.
    let bestStart = 0,
      bestCount = 0,
      runStart = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1],
        b = points[i],
        c = points[i + 1];
      const cross =
        (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) > 1e-7) runStart = i;
      if (i - runStart > bestCount) {
        bestStart = runStart;
        bestCount = i - runStart;
      }
    }
    const start = bestStart + Math.floor(bestCount / 2);
    points = [...points.slice(start), ...points.slice(0, start)];
    const centerX =
      (Math.min(...points.map((p) => p[0])) +
        Math.max(...points.map((p) => p[0]))) /
      2;
    const centerZ =
      (Math.min(...points.map((p) => p[1])) +
        Math.max(...points.map((p) => p[1]))) /
      2;
    const rotation = random() * Math.PI * 2,
      mirror = random() < 0.5 ? -1 : 1;
    points = points.map(([x, z]): Point => [
      (x - centerX) * Math.cos(rotation) - (z - centerZ) * Math.sin(rotation),
      ((x - centerX) * Math.sin(rotation) +
        (z - centerZ) * Math.cos(rotation)) *
        mirror,
    ]);
    const cumulative = [0];
    points.forEach((point, i) =>
      cumulative.push(
        cumulative[i] + distance(point, points[(i + 1) % points.length]),
      ),
    );
    const pose = (index: number) => {
      const point = points[index],
        next = points[(index + 1) % points.length];
      return {
        x: point[0],
        z: point[1],
        yaw: Math.atan2(-(next[0] - point[0]), -(next[1] - point[1])),
      };
    };
    const checkpoints = Array.from({ length: 16 }, (_, i) => {
      const index =
        i === 15
          ? 0
          : cumulative.findIndex((value) => value >= (length * (i + 1)) / 16);
      const p = pose(index);
      return {
        x: p.x,
        z: p.z,
        yaw: p.yaw,
        halfWidth: halfWidth - 0.25,
        halfDepth: 0.5,
      };
    });
    return {
      spawn: pose(0),
      geometry: {
        kind: 'centerline-loop' as const,
        centerline: points,
        driveHalfWidth: halfWidth,
      },
      boundaries: roadEdges(points, halfWidth),
      checkpoints,
    };
  }
  throw new Error(`Unable to generate a valid circuit for seed ${seed}`);
}
