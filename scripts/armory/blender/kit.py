# Hard-surface modelling kit for the Vesper armory (Blender 4.5 LTS).
#
# Everything is authored in the game's own frame: x to the right, y up and
# z toward the shooter, so the bore points down -z. glTF maps Blender
# (x, y, z) to (x, z, -y); a game point (x, y, z) therefore lives at Blender
# (x, -z, y). Units are metres at real scale.
#
# Parts are built from filleted 2D profiles (extruded prisms), lathes and
# boxes, cut with exact booleans, then receive an angle-limited bevel and
# weighted normals: the "mid-poly" hard-surface look, whose chamfers catch
# light without a baked normal map.
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree


def B(x, y, z):
    return Vector((x, -z, y))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def _link(ob, parent=None):
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def empty(name, pos=(0, 0, 0), parent=None, extras=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.01
    ob.location = B(*pos)
    _link(ob, parent)
    for k, v in (extras or {}).items():
        ob[k] = v
    return ob


# ---------------------------------------------------------------------------
# 2D outlines


def arc(cx, cy, r, a0, a1, n=8):
    """Points on an arc, angles in degrees, both ends included."""
    return [
        (cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
         cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)))
        for i in range(n + 1)
    ]


def fillet(points, radius=0.0, segments=5):
    """Round the corners of a closed polygon.

    points: (u, v) or (u, v, r). r > 0 rounds, r < 0 chamfers, 0 keeps the
    corner sharp. A scalar radius applies to corners without their own value.
    """
    pts = [(p[0], p[1], p[2] if len(p) > 2 else radius) for p in points]
    n = len(pts)
    out = []
    for i in range(n):
        ax, ay, _ = pts[i - 1]
        px, py, r = pts[i]
        bx, by, _ = pts[(i + 1) % n]
        if abs(r) < 1e-7:
            out.append((px, py))
            continue
        v1 = Vector((ax - px, ay - py))
        v2 = Vector((bx - px, by - py))
        l1, l2 = v1.length, v2.length
        if l1 < 1e-9 or l2 < 1e-9:
            out.append((px, py))
            continue
        v1 /= l1
        v2 /= l2
        cos = max(-1.0, min(1.0, v1.dot(v2)))
        theta = math.acos(cos)
        if theta < 1e-3 or theta > math.pi - 1e-3:
            out.append((px, py))
            continue
        if r < 0:
            d = min(-r, l1 * 0.49, l2 * 0.49)
            out.append((px + v1.x * d, py + v1.y * d))
            out.append((px + v2.x * d, py + v2.y * d))
            continue
        d = r / math.tan(theta / 2)
        d = min(d, l1 * 0.49, l2 * 0.49)
        rr = d * math.tan(theta / 2)
        t1 = Vector((px, py)) + v1 * d
        t2 = Vector((px, py)) + v2 * d
        bis = (v1 + v2).normalized()
        c = Vector((px, py)) + bis * math.sqrt(d * d + rr * rr)
        a1 = math.atan2(t1.y - c.y, t1.x - c.x)
        a2 = math.atan2(t2.y - c.y, t2.x - c.x)
        da = a2 - a1
        while da > math.pi:
            da -= 2 * math.pi
        while da < -math.pi:
            da += 2 * math.pi
        seg = max(2, int(segments * abs(da) / (math.pi / 2) + 0.5))
        for k in range(seg + 1):
            a = a1 + da * k / seg
            out.append((c.x + rr * math.cos(a), c.y + rr * math.sin(a)))
    # Drop coincident neighbours left by tight fillets.
    clean = []
    for p in out:
        if not clean or (abs(p[0] - clean[-1][0]) > 1e-7 or abs(p[1] - clean[-1][1]) > 1e-7):
            clean.append(p)
    if len(clean) > 2 and abs(clean[0][0] - clean[-1][0]) < 1e-7 and abs(clean[0][1] - clean[-1][1]) < 1e-7:
        clean.pop()
    return clean


def area2(points):
    return sum(points[i - 1][0] * points[i][1] - points[i][0] * points[i - 1][1] for i in range(len(points))) / 2


# ---------------------------------------------------------------------------
# Solids


def _finish_bm(bm, name, material=None, parent=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    _link(ob, parent)
    if material:
        set_material(ob, material)
    return ob


def prism(name, outline, x0, x1, axis="x", material=None, parent=None):
    """Extrude a closed outline.

    axis "x": outline is (z, y) (side view), extruded from x0 to x1.
    axis "y": outline is (x, z) (top view), extruded from y = x0 to x1.
    axis "z": outline is (x, y) (front view), extruded from z = x0 to x1.
    """
    pts = outline
    if area2(pts) < 0:
        pts = list(reversed(pts))
    bm = bmesh.new()

    def P(u, v, w):
        if axis == "x":
            return B(w, v, u)
        if axis == "y":
            return B(u, w, v)
        return B(u, v, w)

    a = [bm.verts.new(P(u, v, x0)) for u, v in pts]
    b = [bm.verts.new(P(u, v, x1)) for u, v in pts]
    n = len(pts)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    return _finish_bm(bm, name, material, parent)


def box(name, x0, x1, y0, y1, z0, z1, material=None, parent=None, r=0.0):
    outline = fillet([(z0, y0), (z1, y0), (z1, y1), (z0, y1)], r) if r else [(z0, y0), (z1, y0), (z1, y1), (z0, y1)]
    return prism(name, outline, x0, x1, "x", material, parent)


def lathe(name, profile, center=(0.0, 0.0), segments=32, material=None, parent=None, axis="z", phase=0.0):
    """Revolve (radius, position) pairs around an axis through center.

    axis "z": the axis runs along game z through (x, y) = center.
    axis "x": along x through (y, z) = center. axis "y": along y through (x, z).
    A radius of 0 closes that end on the axis.
    """
    bm = bmesh.new()
    rings = []
    for r, t in profile:
        if r <= 1e-7:
            rings.append([bm.verts.new(_axis_point(axis, center, 0, 0, t))])
            continue
        ring = []
        for k in range(segments):
            a = 2 * math.pi * k / segments + phase
            ring.append(bm.verts.new(_axis_point(axis, center, r * math.cos(a), r * math.sin(a), t)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        A, Bn = rings[i], rings[i + 1]
        if len(A) == 1 and len(Bn) == 1:
            continue
        if len(A) == 1:
            for k in range(segments):
                bm.faces.new((A[0], Bn[k], Bn[(k + 1) % segments]))
        elif len(Bn) == 1:
            for k in range(segments):
                bm.faces.new((A[k], Bn[0], A[(k + 1) % segments]))
        else:
            for k in range(segments):
                k2 = (k + 1) % segments
                bm.faces.new((A[k], A[k2], Bn[k2], Bn[k]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    return _finish_bm(bm, name, material, parent)


def _axis_point(axis, center, u, v, t):
    cx, cy = center
    if axis == "z":
        return B(cx + u, cy + v, t)
    if axis == "x":
        return B(t, cx + u, cy + v)
    return B(cx + u, t, cy + v)


def cylinder(name, r, t0, t1, center=(0.0, 0.0), segments=24, axis="z", material=None, parent=None, phase=None):
    return lathe(name, [(0, t0), (r, t0), (r, t1), (0, t1)], center, segments, material, parent, axis,
                 math.pi / segments if phase is None else phase)


def tube(name, r_out, r_in, t0, t1, center=(0.0, 0.0), segments=32, axis="z", material=None, parent=None):
    """Hollow cylinder (barrel, sleeve, scope ring)."""
    bm = bmesh.new()
    rings = []
    for r, t in ((r_out, t0), (r_out, t1), (r_in, t1), (r_in, t0)):
        rings.append([bm.verts.new(_axis_point(axis, center, r * math.cos(2 * math.pi * k / segments),
                                               r * math.sin(2 * math.pi * k / segments), t))
                      for k in range(segments)])
    for i in range(4):
        A, Bn = rings[i], rings[(i + 1) % 4]
        for k in range(segments):
            k2 = (k + 1) % segments
            bm.faces.new((A[k], A[k2], Bn[k2], Bn[k]))
    return _finish_bm(bm, name, material, parent)


def sweep(name, path, radius, segments=12, material=None, parent=None, closed=False):
    """Round wire along a polyline of game points (springs, wires, rings)."""
    bm = bmesh.new()
    pts = [Vector(p) for p in path]
    rings = []
    count = len(pts)
    for i, p in enumerate(pts):
        if closed:
            t = (pts[(i + 1) % count] - pts[i - 1]).normalized()
        else:
            t = (pts[min(i + 1, count - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
        n1 = t.cross(up).normalized()
        n2 = t.cross(n1).normalized()
        ring = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            q = p + (n1 * math.cos(a) + n2 * math.sin(a)) * radius
            ring.append(bm.verts.new(B(q.x, q.y, q.z)))
        rings.append(ring)
    last = count if closed else count - 1
    for i in range(last):
        A, Bn = rings[i], rings[(i + 1) % count]
        for k in range(segments):
            k2 = (k + 1) % segments
            bm.faces.new((A[k], A[k2], Bn[k2], Bn[k]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    return _finish_bm(bm, name, material, parent)


def loft(name, sections, material=None, parent=None, cap=True):
    """Skin a list of closed sections, each a list of game points with the
    same count (grips, stocks, organic transitions)."""
    bm = bmesh.new()
    rings = [[bm.verts.new(B(*p)) for p in s] for s in sections]
    n = len(sections[0])
    for i in range(len(rings) - 1):
        A, Bn = rings[i], rings[i + 1]
        for k in range(n):
            k2 = (k + 1) % n
            bm.faces.new((A[k], A[k2], Bn[k2], Bn[k]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    return _finish_bm(bm, name, material, parent)


# ---------------------------------------------------------------------------
# Operations


def _apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def boolean(ob, cutters, op="DIFFERENCE"):
    """Exact boolean with one or more cutter objects, applied at once. The
    cutters are deleted."""
    if not isinstance(cutters, (list, tuple)):
        cutters = [cutters]
    for c in cutters:
        m = ob.modifiers.new("bool", "BOOLEAN")
        m.operation = op
        m.solver = "EXACT"
        # Joined cutters may overlap each other (a slot plus its rounded end).
        m.use_self = True
        m.use_hole_tolerant = True
        m.object = c
        c.hide_render = True
        c.hide_viewport = True
        _apply_modifiers(ob)
    for c in cutters:
        me = c.data
        bpy.data.objects.remove(c, do_unlink=True)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)
    return ob


def union(ob, others):
    return boolean(ob, others, "UNION")


def intersect(ob, other):
    return boolean(ob, [other], "INTERSECT")


def join(obs, name=None):
    obs = [o for o in obs if o is not None]
    base = obs[0]
    if len(obs) > 1:
        ctx = {"object": base, "active_object": base, "selected_objects": obs,
               "selected_editable_objects": obs}
        with bpy.context.temp_override(**ctx):
            bpy.ops.object.join()
    if name:
        base.name = name
        base.data.name = name
    return base


def copy(ob, name=None, dx=0.0, dy=0.0, dz=0.0, mirror_x=False):
    c = ob.copy()
    c.data = ob.data.copy()
    c.name = name or ob.name + "_copy"
    _link(c, ob.parent)
    if mirror_x:
        me = c.data
        for v in me.vertices:
            v.co.x = -v.co.x
        me.flip_normals()
    if dx or dy or dz:
        for v in c.data.vertices:
            v.co += B(dx, dy, dz)
    return c


def move(ob, dx=0.0, dy=0.0, dz=0.0):
    off = B(dx, dy, dz)
    for v in ob.data.vertices:
        v.co += off
    return ob


def rotate(ob, degrees, axis="x", pivot=(0, 0, 0)):
    """Rotate mesh data around a game-space axis through pivot. Positive
    angles follow the right-hand rule in game space."""
    game_axis = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}[axis]
    b_axis = B(*game_axis)
    p = B(*pivot)
    m = Matrix.Translation(p) @ Matrix.Rotation(math.radians(degrees), 4, b_axis) @ Matrix.Translation(-p)
    ob.data.transform(m)
    ob.data.update()
    return ob


def scale(ob, sx=1.0, sy=1.0, sz=1.0, pivot=(0, 0, 0)):
    p = B(*pivot)
    m = Matrix.Diagonal((sx, sz, sy, 1.0))
    ob.data.transform(Matrix.Translation(p) @ m @ Matrix.Translation(-p))
    return ob


def array(ob, count, dx=0.0, dy=0.0, dz=0.0):
    """Repeat mesh data count times along an offset, merged in one object."""
    parts = [ob]
    for i in range(1, count):
        parts.append(copy(ob, None, dx * i, dy * i, dz * i))
    return join(parts, ob.name)


def set_material(ob, name):
    mat = bpy.data.materials.get(name) or _material(name)
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return ob


PRESETS = {
    # name: (base colour sRGB, metallic, roughness)
    "steel": ((0.20, 0.21, 0.22), 1.0, 0.42),
    "steel_dark": ((0.07, 0.075, 0.08), 0.9, 0.5),
    "steel_bright": ((0.62, 0.63, 0.64), 1.0, 0.28),
    "alloy": ((0.09, 0.09, 0.095), 0.7, 0.45),
    "polymer": ((0.045, 0.047, 0.048), 0.0, 0.62),
    "polymer_tan": ((0.36, 0.30, 0.22), 0.0, 0.6),
    "rubber": ((0.03, 0.03, 0.03), 0.0, 0.85),
    "wood": ((0.28, 0.14, 0.07), 0.0, 0.45),
    "g10": ((0.08, 0.075, 0.07), 0.0, 0.55),
    "brass": ((0.78, 0.58, 0.28), 1.0, 0.3),
    "copper": ((0.8, 0.45, 0.3), 1.0, 0.3),
    "glass": ((0.05, 0.08, 0.07), 0.0, 0.05),
    "lens": ((0.02, 0.03, 0.03), 0.0, 0.03),
    "tritium": ((0.6, 1.0, 0.5), 0.0, 0.4),
    "fiber": ((1.0, 0.35, 0.1), 0.0, 0.3),
    "emitter": ((0.2, 1.0, 0.9), 0.0, 0.3),
    "bone": ((0.72, 0.66, 0.55), 0.0, 0.55),
    "gold": ((0.85, 0.62, 0.25), 1.0, 0.25),
    "obsidian": ((0.01, 0.01, 0.012), 0.3, 0.12),
    "cloth": ((0.12, 0.12, 0.1), 0.0, 0.9),
    "shell_red": ((0.55, 0.1, 0.08), 0.0, 0.45),
    "alloy_grey": ((0.23, 0.24, 0.25), 0.3, 0.5),
}


def _material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    base = name.split(".")[0]
    color, metal, rough = PRESETS.get(base, ((0.5, 0.5, 0.5), 0.0, 0.5))
    lin = [c ** 2.2 for c in color]
    bsdf.inputs["Base Color"].default_value = (*lin, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if base in ("tritium", "fiber", "emitter"):
        bsdf.inputs["Emission Color"].default_value = (*lin, 1)
        bsdf.inputs["Emission Strength"].default_value = 3.0
    return mat


def bevel(ob, width=0.0006, segments=2, angle=30, profile=0.6, harden=True):
    m = ob.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    m.profile = profile
    m.use_clamp_overlap = True
    m.harden_normals = harden
    m.miter_outer = "MITER_ARC"
    return ob


def smooth(ob, angle=32):
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(angle))


def weighted(ob):
    m = ob.modifiers.new("weighted", "WEIGHTED_NORMAL")
    m.keep_sharp = True
    m.weight = 50
    m.mode = "FACE_AREA"
    return ob


def densify(ob, max_edge=0.009, rounds=5):
    """Split long edges so large flat faces carry interior vertices: the
    per-vertex wear layer (occlusion, edge wear) then fades within a few
    millimetres of an edge instead of spreading across a whole face."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    for _ in range(rounds):
        long = [e for e in bm.edges if e.calc_length() > max_edge]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bmesh.ops.beautify_fill(bm, faces=bm.faces, edges=[e for e in bm.edges if e.is_manifold and
                                                        e.calc_face_angle(1.0) < 0.001])
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def finish(ob, width=0.0006, segments=2, angle=30, harden=True, weighted_normals=True, dense=0):
    """Densify, bevel, weight normals and bake the modifiers into the mesh."""
    if dense:
        densify(ob, dense)
    smooth(ob, angle + 2)
    if width > 0:
        bevel(ob, width, segments, angle, harden=harden)
    if weighted_normals:
        weighted(ob)
    _apply_modifiers(ob)
    return ob


def set_origin(ob, pivot):
    """Move an object's origin to a game-space pivot, mesh left in place
    (the root sits at the origin, so the local offset is the pivot)."""
    p = B(*pivot)
    ob.data.transform(Matrix.Translation(-p))
    ob.location = p
    return ob


def part(name, meshes, pivot=(0, 0, 0), parent=None, extras=None):
    """A moving part: an empty at its pivot owning its meshes. The meshes sit
    at the empty's origin, so animating the empty rotates around the pivot
    whatever transform mesh quantization later gives to the mesh nodes."""
    meshes = meshes if isinstance(meshes, (list, tuple)) else [meshes]
    for ob in meshes:
        if ob.name == name:
            ob.name = name + "_mesh"
    holder = empty(name, pivot, parent, extras)
    p = B(*pivot)
    for ob in meshes:
        ob.data.transform(Matrix.Translation(-p))
        ob.location = (0, 0, 0)
        ob.parent = holder
    return holder


def triangles(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# ---------------------------------------------------------------------------
# Surface data: box-projected UVs (tiling detail maps) and the wear layer
# (ambient occlusion, convex edges, cavities) stored per vertex.


UV_RANGE = 16.0  # detail tiles stored in [0, 1]; the shader scales them back


def box_uv(ob, metres_per_tile=0.05, layer="detail"):
    """Second UV set: box projection in metres for the tiling detail maps."""
    me = ob.data
    uv = me.uv_layers.get(layer) or me.uv_layers.new(name=layer)
    s = 1.0 / metres_per_tile
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            uv.data[li].uv = (0.5 + u * s / UV_RANGE, 0.5 + v * s / UV_RANGE)


def unwrap(objects, margin=0.003):
    """First UV set: one non-overlapping atlas shared by every part of the
    weapon, texel density proportional to real size."""
    for ob in objects:
        me = ob.data
        while me.uv_layers:
            me.uv_layers.remove(me.uv_layers[0])
        me.uv_layers.new(name="atlas")
        me.uv_layers.active_index = 0
    view = bpy.context.view_layer
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objects:
        ob.select_set(True)
    view.objects.active = objects[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")


def _cycles(samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "METAL"
        prefs.refresh_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception:
        pass
    scene.cycles.samples = samples
    return scene


def bake_wear(objects, prefix, size=1024, ao_distance=0.02, cavity_distance=0.004, edge_radius=0.0012,
              samples=64):
    """Bake occlusion, cavity and convex-edge maps into the atlas.

    ao: ambient occlusion over ao_distance (every part occludes the others).
    cavity: occlusion over a few millimetres, i.e. creases and recesses.
    edge: angular difference between the true normal and a Cycles bevel
    normal of edge_radius, i.e. every sharp edge rounded into a band.
    Writes <prefix>-ao.png, -cavity.png and -edge.png."""
    scene = _cycles(samples)
    world = scene.world or bpy.data.worlds.new("bake")
    scene.world = world
    world.use_nodes = True
    view = bpy.context.view_layer
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objects:
        ob.select_set(True)
    view.objects.active = objects[0]
    mats = []
    for ob in objects:
        for slot in ob.material_slots:
            if slot.material and slot.material not in mats:
                mats.append(slot.material)
    bake = scene.render.bake
    bake.margin = max(4, size // 128)
    bake.use_clear = True
    outputs = {}

    def run(kind, image_name, **kw):
        img = bpy.data.images.new(image_name, size, size, alpha=False, float_buffer=False)
        img.colorspace_settings.name = "Non-Color"
        added = []
        for m in mats:
            n = m.node_tree.nodes.new("ShaderNodeTexImage")
            n.image = img
            m.node_tree.nodes.active = n
            added.append((m, n))
        bpy.ops.object.bake(type=kind, **kw)
        for m, n in added:
            m.node_tree.nodes.remove(n)
        path = f"{prefix}-{image_name}.png"
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        outputs[image_name] = path
        bpy.data.images.remove(img)

    world.light_settings.distance = ao_distance
    run("AO", "ao")
    world.light_settings.distance = cavity_distance
    run("AO", "cavity")
    # Edge mask: swap every material to an emission of (1 - N.Nbevel) * gain.
    saved = {}
    for m in mats:
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        saved[m] = [l.from_socket for l in out.inputs["Surface"].links]
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        bev = nt.nodes.new("ShaderNodeBevel")
        bev.samples = 16
        bev.inputs["Radius"].default_value = edge_radius
        dot = nt.nodes.new("ShaderNodeVectorMath")
        dot.operation = "DOT_PRODUCT"
        nt.links.new(geo.outputs["Normal"], dot.inputs[0])
        nt.links.new(bev.outputs["Normal"], dot.inputs[1])
        inv = nt.nodes.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        nt.links.new(dot.outputs["Value"], inv.inputs[1])
        gain = nt.nodes.new("ShaderNodeMath")
        gain.operation = "MULTIPLY"
        gain.use_clamp = True
        gain.inputs[1].default_value = 7.0
        nt.links.new(inv.outputs["Value"], gain.inputs[0])
        emit = nt.nodes.new("ShaderNodeEmission")
        nt.links.new(gain.outputs["Value"], emit.inputs["Color"])
        nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        m["_bake_nodes"] = [geo.name, bev.name, dot.name, inv.name, gain.name, emit.name]
    run("EMIT", "edge")
    for m in mats:
        nt = m.node_tree
        for name in m["_bake_nodes"]:
            nt.nodes.remove(nt.nodes[name])
        del m["_bake_nodes"]
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        for sock in saved[m]:
            nt.links.new(sock, out.inputs["Surface"])
    return outputs


def export_glb(path, root):
    bpy.ops.object.select_all(action="DESELECT")
    for ob in bpy.context.scene.objects:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_normals=True,
        export_texcoords=True,
        export_tangents=False,
        export_vertex_color="NONE",
        export_materials="EXPORT",
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )


def preview(path, target=(0, 0, 0), distance=0.6, yaw=-35, pitch=12, size=(1400, 820), samples=48, lens=85,
            hide=()):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "METAL"
        prefs.refresh_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception:
        pass
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    world = bpy.data.worlds.new("studio")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "LINEAR"
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0, math.radians(-90), 0)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.012, 0.014, 0.016, 1)
    ramp.color_ramp.elements[1].color = (0.18, 0.2, 0.22, 1)
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    t = B(*target)

    def light(name, energy, loc, size_, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy
        ld.size = size_
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.location = t + Vector(loc)
        d = t - lo.location
        lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    light("key", 60, (-0.9, -0.6, 1.1), 0.9, (1.0, 0.96, 0.9))
    light("rim", 45, (0.8, 1.0, 0.5), 0.5, (0.7, 0.85, 1.0))
    light("fill", 12, (0.9, -1.2, -0.2), 1.2, (1.0, 0.95, 0.9))
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = lens
    cam_data.clip_start = 0.01
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    yr, pr = math.radians(yaw), math.radians(pitch)
    # Orbit in game space: yaw around game y, pitch up.
    gx = math.sin(yr) * math.cos(pr) * distance
    gz = math.cos(yr) * math.cos(pr) * distance
    gy = math.sin(pr) * distance
    cam.location = t + B(gx, gy, gz)
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    hidden = []
    for ob in scene.objects:
        if ob.name in hide or ob.name.startswith("socket"):
            ob.hide_render = True
            hidden.append(ob)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for ob in (cam, *[o for o in scene.objects if o.type == "LIGHT"]):
        bpy.data.objects.remove(ob, do_unlink=True)
    for ob in hidden:
        ob.hide_render = False
