export interface TrackRecipe {
  version: 'rectangular-ring-v1' | 'curved-loop-v1' | 'technical-loop-v2';
  seed: number;
}

type TrackGeometry =
  | {
      kind: 'rectangular-ring';
      outerX: number;
      outerZ: number;
      innerX: number;
      innerZ: number;
    }
  | {
      kind: 'centerline-loop';
      centerline: Array<readonly [number, number]>;
      driveHalfWidth: number;
    };

export interface RaceTrack {
  recipe: TrackRecipe;
  spawn: { x: number; z: number; yaw: number };
  geometry: TrackGeometry;
  checkpoints: Array<{
    x: number;
    z: number;
    yaw: number;
    halfWidth: number;
    halfDepth: number;
  }>;
  boundaries: Array<readonly [number, number, number, number]>;
}

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

function halfStep(random: () => number, minimum: number, maximum: number) {
  return Math.round((minimum + random() * (maximum - minimum)) * 2) / 2;
}

export function parseTrackRecipe(value: unknown): TrackRecipe {
  if (!value || typeof value !== 'object') return prototypeTrackRecipe;
  const recipe = value as Record<string, unknown>;
  if (
    (recipe.version !== 'rectangular-ring-v1' &&
      recipe.version !== 'curved-loop-v1' &&
      recipe.version !== 'technical-loop-v2') ||
    !Number.isSafeInteger(recipe.seed) ||
    (recipe.seed as number) < 0 ||
    (recipe.seed as number) > 2_147_483_647
  ) {
    throw new Error('Invalid track recipe');
  }
  return { version: recipe.version, seed: recipe.seed as number };
}

function generateCurvedTrack(recipe: TrackRecipe): RaceTrack {
  const random = randomValues(recipe.seed);
  const technical = recipe.version === 'technical-loop-v2';
  const radiusX = technical
    ? halfStep(random, 50, 65)
    : halfStep(random, 14, 19);
  const radiusZ = halfStep(random, technical ? 60 : 17, technical ? 75 : 24);
  const driveHalfWidth = halfStep(random, 3.25, 4.25);
  const waveTwo = 0.06 + random() * 0.08;
  const waveThree = 0.04 + random() * 0.07;
  const phaseTwo = random() * Math.PI * 2;
  const phaseThree = random() * Math.PI * 2;
  const harmonic = technical ? 4 + Math.floor(random() * 3) : 0;
  const wave = technical ? 0.09 + random() * 0.035 : 0;
  const phase = technical ? random() * Math.PI * 2 : 0;
  let scale = 1;
  const sampleCount = technical ? 240 : 72;

  const pointAt = (angle: number): readonly [number, number] => {
    const radius =
      1 +
      waveTwo * Math.sin(angle * 2 + phaseTwo) +
      waveThree * Math.sin(angle * 3 + phaseThree) +
      wave * Math.sin(angle * harmonic + phase);
    return [
      scale * radiusX * radius * Math.cos(angle),
      scale * radiusZ * radius * Math.sin(angle),
    ];
  };
  const tangentAt = (angle: number): readonly [number, number] => {
    const before = pointAt(angle - 0.001);
    const after = pointAt(angle + 0.001);
    const dx = after[0] - before[0];
    const dz = after[1] - before[1];
    const length = Math.hypot(dx, dz);
    return [dx / length, dz / length];
  };
  // Keep tight bends wide enough for the road offsets and a car to turn.
  if (technical) {
    let minimumRadius = Infinity;
    for (let i = 0; i < sampleCount; i++) {
      const angle = (i / sampleCount) * Math.PI * 2;
      const a = pointAt(angle - 0.005),
        b = pointAt(angle),
        c = pointAt(angle + 0.005);
      const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const cross = Math.abs(
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      );
      if (cross > 1e-10)
        minimumRadius = Math.min(minimumRadius, (ab * bc * ac) / (2 * cross));
    }
    scale = Math.max(1, 8.5 / minimumRadius);
  }

  const centerline = Array.from({ length: sampleCount }, (_, index) =>
    pointAt((index / sampleCount) * Math.PI * 2),
  );
  const left: Array<readonly [number, number]> = [];
  const right: Array<readonly [number, number]> = [];
  centerline.forEach((point, index) => {
    const previous = centerline[(index - 1 + sampleCount) % sampleCount];
    const next = centerline[(index + 1) % sampleCount];
    const tangentX = next[0] - previous[0];
    const tangentZ = next[1] - previous[1];
    const length = Math.hypot(tangentX, tangentZ);
    const normalX = -tangentZ / length;
    const normalZ = tangentX / length;
    left.push([
      point[0] + normalX * driveHalfWidth,
      point[1] + normalZ * driveHalfWidth,
    ]);
    right.push([
      point[0] - normalX * driveHalfWidth,
      point[1] - normalZ * driveHalfWidth,
    ]);
  });
  const boundaries: Array<readonly [number, number, number, number]> = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const next = (index + 1) % sampleCount;
    boundaries.push([
      left[index][0],
      left[index][1],
      left[next][0],
      left[next][1],
    ]);
    boundaries.push([
      right[index][0],
      right[index][1],
      right[next][0],
      right[next][1],
    ]);
  }
  const checkpointAngles = technical
    ? Array.from(
        { length: 16 },
        (_, index) => (((index + 1) % 16) / 16) * Math.PI * 2,
      )
    : [Math.PI, Math.PI * 1.5, 0, Math.PI * 0.5];
  const checkpoints = checkpointAngles.map((angle) => {
    const point = pointAt(angle);
    const tangent = tangentAt(angle);
    const normalX = -tangent[1];
    const normalZ = tangent[0];
    return {
      x: point[0],
      z: point[1],
      yaw: Math.atan2(-normalZ, normalX),
      halfWidth: driveHalfWidth - 0.25,
      halfDepth: 0.5,
    };
  });
  const spawnAngle = technical ? 0 : Math.PI - 0.35;
  const spawn = pointAt(spawnAngle);
  const spawnTangent = tangentAt(spawnAngle);
  return {
    recipe: { ...recipe },
    spawn: {
      x: spawn[0],
      z: spawn[1],
      yaw: Math.atan2(-spawnTangent[0], -spawnTangent[1]),
    },
    geometry: { kind: 'centerline-loop', centerline, driveHalfWidth },
    checkpoints,
    boundaries,
  };
}

function generateRectangularTrack(recipe: TrackRecipe): RaceTrack {
  const geometry = {
    kind: 'rectangular-ring' as const,
    outerX: 13.35,
    outerZ: 23.35,
    innerX: 6.65,
    innerZ: 16.65,
  };
  const { outerX, outerZ, innerX, innerZ } = geometry;
  return {
    recipe: { ...recipe },
    spawn: { x: -10, z: 13, yaw: 0 },
    geometry,
    checkpoints: [
      { x: -10, z: 0, yaw: 0, halfWidth: 3.7, halfDepth: 0.5 },
      { x: 0, z: -20, yaw: Math.PI / 2, halfWidth: 3.7, halfDepth: 0.5 },
      { x: 10, z: 0, yaw: 0, halfWidth: 3.7, halfDepth: 0.5 },
      { x: 0, z: 20, yaw: Math.PI / 2, halfWidth: 3.7, halfDepth: 0.5 },
    ],
    boundaries: [
      [-outerX, -outerZ, -outerX, outerZ],
      [outerX, -outerZ, outerX, outerZ],
      [-outerX, -outerZ, outerX, -outerZ],
      [-outerX, outerZ, outerX, outerZ],
      [-innerX, -innerZ, -innerX, innerZ],
      [innerX, -innerZ, innerX, innerZ],
      [-innerX, -innerZ, innerX, -innerZ],
      [-innerX, innerZ, innerX, innerZ],
    ],
  };
}

export function generateTrack(recipe: TrackRecipe): RaceTrack {
  return recipe.version === 'rectangular-ring-v1'
    ? generateRectangularTrack(recipe)
    : generateCurvedTrack(recipe);
}

export const prototypeTrackRecipe: TrackRecipe = {
  version: 'rectangular-ring-v1',
  seed: 42_170,
};
