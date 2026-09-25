# First-person arms from the Rocketbox Military_Male_01 avatar (MIT):
# sleeves and tactical gloves only, one Catmull-Clark level for the fingers,
# the upper-body chain kept (pelvis to head) so the runtime can seat the
# eyes on the camera and hang the arms from anatomically placed shoulders.
#   blender -b --factory-startup --python arms.py -- in.fbx out.glb out.json
import bpy, bmesh, sys, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out_glb, out_json = argv[0], argv[1], argv[2]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=False)
for o in list(bpy.context.scene.objects):
    if o.type == "EMPTY":
        bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.context.scene.objects:
    o.animation_data_clear()
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bones = arm.data.bones
world = arm.matrix_world

SIDES = ("L", "R")
CHAIN = ["Bip01", "Bip01 Pelvis", "Bip01 Spine", "Bip01 Spine1", "Bip01 Spine2", "Bip01 Neck", "Bip01 Head"]
KEEP = set(CHAIN)
for s in SIDES:
    KEEP |= {f"Bip01 {s} Clavicle", f"Bip01 {s} UpperArm", f"Bip01 {s} Forearm", f"Bip01 {s} Hand"}
    for f in range(5):
        KEEP |= {f"Bip01 {s} Finger{f}", f"Bip01 {s} Finger{f}1", f"Bip01 {s} Finger{f}2"}
KEEP = {b for b in KEEP if b in bones}
LIMB = ("UpperArm", "Forearm", "Hand", "Finger")

landmarks = {}
for key, name in (("eyeL", "Bip01 LEye"), ("eyeR", "Bip01 REye"), ("head", "Bip01 Head")):
    if name in bones:
        landmarks[key] = world @ bones[name].head_local

# ---------------------------------------------------------------- faces
me = mesh.data
groups = {g.index: g.name for g in mesh.vertex_groups}
limb = [0.0] * len(me.vertices)
hand = [0.0] * len(me.vertices)
for v in me.vertices:
    for g in v.groups:
        n = groups.get(g.group, "")
        if any(k in n for k in LIMB):
            limb[v.index] += g.weight
        if "Hand" in n or "Finger" in n:
            hand[v.index] += g.weight
body = next(i for i, m in enumerate(me.materials) if m and m.name.endswith("_body"))
bm = bmesh.new()
bm.from_mesh(me)
dead = [f for f in bm.faces
        if f.material_index != body or sum(limb[v.index] for v in f.verts) / len(f.verts) < 0.55]
bmesh.ops.delete(bm, geom=dead, context="FACES")
bm.to_mesh(me)
bm.free()
me.update()
# Only the body material remains.
while len(me.materials) > 1:
    idx = next(i for i, m in enumerate(me.materials) if not m.name.endswith("_body"))
    me.materials.pop(index=idx)
for p in me.polygons:
    p.material_index = 0

# ------------------------------------------------------------ weights
def kept_ancestor(name):
    b = bones[name]
    while b and b.name not in KEEP:
        b = b.parent
    return b.name if b else "Bip01 Spine2"

vg = mesh.vertex_groups
index = {g.name: g.index for g in vg}
fold = {}
for g in list(vg):
    if g.name in KEEP or g.name not in bones:
        continue
    fold[g.index] = kept_ancestor(g.name)
for target in set(fold.values()):
    if target not in index:
        index[target] = vg.new(name=target).index
accum = {}
for v in me.vertices:
    for g in v.groups:
        if g.group in fold:
            key = (v.index, fold[g.group])
            accum[key] = accum.get(key, 0.0) + g.weight
for (vi, target), w in accum.items():
    vg[index[target]].add([vi], w, "ADD")
for gi in sorted(fold, reverse=True):
    vg.remove(vg[gi])
for g in list(vg):
    if g.name not in bones:
        vg.remove(g)

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
for b in [b for b in eb if b.name not in KEEP]:
    eb.remove(b)
bpy.ops.object.mode_set(mode="OBJECT")

# ------------------------------------------------- subdivision (fingers)
bpy.context.view_layer.objects.active = mesh
for o in bpy.context.scene.objects:
    o.select_set(o == mesh)
sub = mesh.modifiers.new("subsurf", "SUBSURF")
sub.levels = 1
sub.render_levels = 1
sub.uv_smooth = "PRESERVE_BOUNDARIES"
bpy.ops.object.modifier_move_to_index(modifier=sub.name, index=0)
bpy.ops.object.modifier_apply(modifier=sub.name)

bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
bpy.ops.object.mode_set(mode="OBJECT")

for target in (arm, mesh):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

for p in me.polygons:
    p.use_smooth = True

# ---------------------------------------------------- UV crop and masks
uv = me.uv_layers.active.data
pad = 6 / 2048
snap0 = lambda x: max(0.0, math.floor((x - pad) * 2048) / 2048)
snap1 = lambda x: min(1.0, math.ceil((x + pad) * 2048) / 2048)
# Each arm's sleeve and glove occupy one side of the Rocketbox atlas: repack
# the two strips side by side and drop the torso, legs and boots between.
left = [l.uv[0] for l in uv if l.uv[0] < 0.5]
right = [l.uv[0] for l in uv if l.uv[0] >= 0.5]
vs = [l.uv[1] for l in uv]
strips = [[snap0(min(left)), snap1(max(left))], [snap0(min(right)), snap1(max(right))]]
v0, v1 = snap0(min(vs)), snap1(max(vs))
u0, u1 = strips[0][0], strips[1][1]
glove_tris, sleeve_tris = [], []
groups = {g.index: g.name for g in mesh.vertex_groups}
for p in me.polygons:
    hw = 0.0
    for vi in p.vertices:
        for g in me.vertices[vi].groups:
            n = groups.get(g.group, "")
            if "Hand" in n or "Finger" in n:
                hw += g.weight
    hw /= len(p.vertices)
    loops = list(p.loop_indices)
    for k in range(1, len(loops) - 1):
        tri = [list(uv[loops[0]].uv), list(uv[loops[k]].uv), list(uv[loops[k + 1]].uv)]
        (glove_tris if hw > 0.5 else sleeve_tris).append(tri)
lw = strips[0][1] - strips[0][0]
rw = strips[1][1] - strips[1][0]
for l in uv:
    u, v = l.uv
    if u < 0.5:
        nu = (u - strips[0][0]) / (lw + rw)
    else:
        nu = (lw + u - strips[1][0]) / (lw + rw)
    l.uv = (nu, (v - v0) / (v1 - v0))

def gl(v):
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]

meta = {
    "source": src.split("/")[-1],
    "uvRect": [u0, v0, u1, v1],
    "strips": strips,
    "v": [v0, v1],
    "landmarks": {k: gl(v) for k, v in landmarks.items()},
    "bones": [b.name for b in arm.data.bones],
    "triangles": sum(len(p.vertices) - 2 for p in me.polygons),
    "vertices": len(me.vertices),
    "gloveTris": glove_tris,
    "sleeveTris": sleeve_tris,
}
bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format="GLB",
    export_animations=False,
    export_skins=True,
    export_morph=False,
    export_image_format="NONE",
    export_materials="EXPORT",
    export_yup=True,
    export_apply=False,
)
with open(out_json, "w") as f:
    json.dump(meta, f)
print("OK", meta["triangles"], meta["vertices"], meta["uvRect"], meta["landmarks"])
