import * as T from "three";

// Severed limbs: the lost triangles baked in their last animated pose, thrown
// by the blow or the blast, tumbling and bouncing on the floor, then sinking
// away. One mesh per piece; geometry owned here, material shared.

const GRAVITY = 9.8;
const LIFETIME = 9;
const point = new T.Vector3(),
  axis = new T.Vector3(),
  turn = new T.Quaternion();

export class HordeGibs {
  constructor(scene, mobile = false) {
    this.scene = scene;
    this.items = [];
    this.limit = mobile ? 6 : 14;
    this.thrown = 0;
  }
  /**
   * Bake `triangles` (vertex index triples of the skinned mesh, in its
   * current pose) into a loose piece and throw it with `velocity` (m/s).
   * `cap` (optional object in world space) closes the torn end.
   */
  throw(mesh, triangles, material, velocity, cap = null) {
    if (triangles.length < 9) return null;
    const uv = mesh.geometry.attributes.uv;
    mesh.updateWorldMatrix(true, false);
    const remap = new Map(),
      positions = [],
      uvs = [],
      index = [];
    for (const v of triangles) {
      if (!remap.has(v)) {
        remap.set(v, remap.size);
        mesh.getVertexPosition(v, point).applyMatrix4(mesh.matrixWorld);
        positions.push(point.x, point.y, point.z);
        if (uv) uvs.push(uv.getX(v), uv.getY(v));
      }
      index.push(remap.get(v));
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    if (uv) geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeBoundingBox();
    const centre = geometry.boundingBox.getCenter(new T.Vector3());
    geometry.translate(-centre.x, -centre.y, -centre.z);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const size = geometry.boundingBox.getSize(new T.Vector3());
    const piece = new T.Mesh(geometry, material);
    piece.name = "horde-gib";
    piece.position.copy(centre);
    piece.castShadow = true;
    if (cap) {
      cap.position.sub(centre);
      piece.add(cap);
    }
    this.scene.add(piece);
    const item = {
      mesh: piece,
      velocity: velocity.clone(),
      spin: new T.Vector3(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 16,
      ),
      radius: Math.max(0.035, Math.min(size.x, size.y, size.z) * 0.5),
      age: 0,
      resting: false,
    };
    this.items.push(item);
    this.thrown++;
    while (this.items.length > this.limit) this.remove(this.items[0]);
    return item;
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const g = this.items[i],
        m = g.mesh;
      g.age += dt;
      if (!g.resting) {
        g.velocity.y -= GRAVITY * dt;
        m.position.addScaledVector(g.velocity, dt);
        const w = g.spin.length();
        if (w > 1e-3) {
          turn.setFromAxisAngle(axis.copy(g.spin).divideScalar(w), w * dt);
          m.quaternion.premultiply(turn);
        }
        if (m.position.y < g.radius) {
          m.position.y = g.radius;
          if (g.velocity.y < 0) g.velocity.y *= -0.28;
          g.velocity.x *= 0.6;
          g.velocity.z *= 0.6;
          g.spin.multiplyScalar(0.5);
          if (
            Math.abs(g.velocity.y) < 0.4 &&
            Math.hypot(g.velocity.x, g.velocity.z) < 0.3
          )
            g.resting = true;
        }
      }
      // The last second sinks the piece through the floor, like corpses.
      if (g.age > LIFETIME) {
        m.position.y -= dt * 0.3;
        if (g.age > LIFETIME + 1.2) this.remove(g);
      }
    }
  }
  remove(g) {
    this.scene.remove(g.mesh);
    g.mesh.geometry.dispose();
    const i = this.items.indexOf(g);
    if (i >= 0) this.items.splice(i, 1);
  }
  dispose() {
    for (const g of [...this.items]) this.remove(g);
  }
}
