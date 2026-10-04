// Intersect the entire movement segment with the checkpoint in its local frame.
export function crossesCheckpoint(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  x: number,
  z: number,
  yaw: number,
  halfWidth: number,
  halfDepth: number,
): boolean {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const local = (px: number, pz: number) => [
    cosine * (px - x) - sine * (pz - z),
    sine * (px - x) + cosine * (pz - z),
  ];
  const from = local(fromX, fromZ);
  const to = local(toX, toZ);
  let enter = 0;
  let exit = 1;
  for (const [axis, halfSize] of [halfWidth, halfDepth].entries()) {
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < 1e-10) {
      if (Math.abs(from[axis]) > halfSize + 1e-10) return false;
      continue;
    }
    const a = (-halfSize - from[axis]) / delta;
    const b = (halfSize - from[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit + 1e-10) return false;
  }
  return true;
}
