// Rasterizes a mesh in texture space: every covered texel receives the bind
// position, normal and primitive index of the surface point it maps to.
// Painting from these 3D attributes keeps blood, rot and wounds continuous
// across UV seams, whatever the atlas layout.

export function rasterizeUV({ width, height, primitives }) {
  const n = width * height;
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const part = new Int16Array(n).fill(-1);
  for (let pi = 0; pi < primitives.length; pi++) {
    const { indices, positions, normals, uvs } = primitives[pi];
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t],
        b = indices[t + 1],
        c = indices[t + 2];
      const ax = uvs[a * 2] * width,
        ay = uvs[a * 2 + 1] * height;
      const bx = uvs[b * 2] * width,
        by = uvs[b * 2 + 1] * height;
      const cx = uvs[c * 2] * width,
        cy = uvs[c * 2 + 1] * height;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))),
        maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))),
        maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(area) < 1e-12) continue;
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5,
            py = y + 0.5;
          let w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
          let w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
          let w2 = 1 - w0 - w1;
          // Slightly conservative coverage so seams receive a value.
          const eps = -0.02;
          if (w0 < eps || w1 < eps || w2 < eps) continue;
          const o = y * width + x;
          if (part[o] >= 0 && (w0 < 0 || w1 < 0 || w2 < 0)) continue;
          w0 = Math.max(0, w0);
          w1 = Math.max(0, w1);
          w2 = Math.max(0, w2);
          const s = w0 + w1 + w2;
          w0 /= s;
          w1 /= s;
          w2 /= s;
          for (let k = 0; k < 3; k++) {
            position[o * 3 + k] =
              positions[a * 3 + k] * w0 +
              positions[b * 3 + k] * w1 +
              positions[c * 3 + k] * w2;
            normal[o * 3 + k] =
              normals[a * 3 + k] * w0 +
              normals[b * 3 + k] * w1 +
              normals[c * 3 + k] * w2;
          }
          const nx = normal[o * 3],
            ny = normal[o * 3 + 1],
            nz = normal[o * 3 + 2];
          const l = Math.hypot(nx, ny, nz) || 1;
          normal[o * 3] = nx / l;
          normal[o * 3 + 1] = ny / l;
          normal[o * 3 + 2] = nz / l;
          part[o] = pi;
        }
    }
  }
  dilate({ width, height, position, normal, part }, 4);
  return { width, height, position, normal, part };
}

/** Grow covered texels into empty neighbours (texture filtering padding). */
function dilate(map, passes) {
  const { width, height, position, normal, part } = map;
  for (let p = 0; p < passes; p++) {
    const next = part.slice();
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const o = y * width + x;
        if (part[o] >= 0) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (part[q] < 0) continue;
          for (let k = 0; k < 3; k++) {
            position[o * 3 + k] = position[q * 3 + k];
            normal[o * 3 + k] = normal[q * 3 + k];
          }
          next[o] = part[q];
          break;
        }
      }
    part.set(next);
  }
}
