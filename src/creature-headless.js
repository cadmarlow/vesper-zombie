import * as T from "three";

const cache = new WeakMap();

// A continuous imported skin cannot lose its head by shrinking a bone alone:
// blended neck vertices stretch into a cone. Clip the bind geometry once, then
// attach the remaining neck to neck rather than to the destroyed head/jaw.
// Derived geometry is shared by all corpses and retained across LOD changes.
export function headlessGeometry(
  geometry,
  skeleton,
  cutHeight = 1.648,
  { removed: removedNames = ["head", "jaw"], neck: neckName = "neck" } = {},
) {
  if (cache.has(geometry)) return cache.get(geometry);
  const attributes = geometry.attributes;
  const count = attributes.position.count;
  const neck = skeleton.bones.findIndex((bone) => bone.name === neckName);
  const removed = new Set(
    skeleton.bones.flatMap((bone, i) =>
      removedNames.includes(bone.name) ? [i] : [],
    ),
  );
  const arrays = Object.fromEntries(
    Object.entries(attributes).map(([name, attribute]) => [
      name,
      // glTF commonly interleaves position/normal/UV in the same buffer. Read
      // components through Three.js so stride, offset and normalization apply.
      Array.from({ length: attribute.count * attribute.itemSize }, (_, i) =>
        attribute.getComponent(
          Math.floor(i / attribute.itemSize),
          i % attribute.itemSize,
        ),
      ),
    ]),
  );
  const index = geometry.index;
  const output = [];
  const intersections = new Map();
  const y = (i) => arrays.position[i * 3 + 1];
  function intersection(a, b) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (intersections.has(key)) return intersections.get(key);
    const t = (cutHeight - y(a)) / (y(b) - y(a));
    const next = arrays.position.length / 3;
    for (const [name, attribute] of Object.entries(attributes)) {
      if (name === "skinIndex" || name === "skinWeight") continue;
      const data = arrays[name];
      for (let c = 0; c < attribute.itemSize; c++)
        data.push(
          T.MathUtils.lerp(
            data[a * attribute.itemSize + c],
            data[b * attribute.itemSize + c],
            t,
          ),
        );
    }
    const influences = new Map();
    for (const [vertex, fraction] of [
      [a, 1 - t],
      [b, t],
    ])
      for (let c = 0; c < 4; c++) {
        const joint = arrays.skinIndex[vertex * 4 + c];
        const weight = arrays.skinWeight[vertex * 4 + c] * fraction;
        influences.set(joint, (influences.get(joint) || 0) + weight);
      }
    const strongest = [...influences].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = strongest.reduce((total, item) => total + item[1], 0);
    for (let c = 0; c < 4; c++) {
      arrays.skinIndex.push(strongest[c]?.[0] ?? 0);
      arrays.skinWeight.push((strongest[c]?.[1] ?? 0) / sum);
    }
    intersections.set(key, next);
    return next;
  }
  for (let i = 0; i < (index?.count ?? count); i += 3) {
    const triangle = [0, 1, 2].map((c) => (index ? index.getX(i + c) : i + c));
    const polygon = [];
    for (let c = 0; c < 3; c++) {
      const a = triangle[c],
        b = triangle[(c + 1) % 3];
      const insideA = y(a) <= cutHeight,
        insideB = y(b) <= cutHeight;
      if (insideA) polygon.push(a);
      if (insideA !== insideB) polygon.push(intersection(a, b));
    }
    for (let c = 1; c < polygon.length - 1; c++)
      output.push(polygon[0], polygon[c], polygon[c + 1]);
  }
  for (let i = 0; i < arrays.skinIndex.length; i++)
    if (removed.has(arrays.skinIndex[i])) arrays.skinIndex[i] = neck;
  const remap = new Map();
  const compactIndex = output.map((vertex) => {
    if (!remap.has(vertex)) remap.set(vertex, remap.size);
    return remap.get(vertex);
  });
  const vertices = [...remap.keys()];
  const result = new T.BufferGeometry();
  for (const [name, attribute] of Object.entries(attributes)) {
    const ArrayType = name === "skinIndex" ? Uint16Array : Float32Array;
    result.setAttribute(
      name,
      new T.BufferAttribute(
        new ArrayType(
          vertices.flatMap((vertex) =>
            arrays[name].slice(
              vertex * attribute.itemSize,
              (vertex + 1) * attribute.itemSize,
            ),
          ),
        ),
        attribute.itemSize,
        false,
      ),
    );
  }
  result.normalizeNormals();
  result.setIndex(compactIndex);
  cache.set(geometry, result);
  return result;
}
