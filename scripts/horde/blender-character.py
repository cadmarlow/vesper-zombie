# Blender (4.5 LTS) conversion of one Rocketbox avatar into a game-ready
# skinned GLB for the Vesper horde. Run through scripts/horde/build-characters.mjs.
#   blender -b --factory-startup --python blender-character.py -- in.fbx out.glb out.json
# The facial rig and the finger chains are folded into their parents; the
# jaw survives for moans and screams. Eye positions are kept as metadata for
# the emissive eyes. Transforms are applied so the GLB is metric and Y-up.
import bpy, sys, json, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
src, out_glb, out_json = argv[0], argv[1], argv[2]
claw = float(argv[3]) if len(argv) > 3 else 0.55

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=False)
for o in list(bpy.context.scene.objects):
    if o.type == "EMPTY":
        bpy.data.objects.remove(o, do_unlink=True)
# The FBX take keys the armature object transform; it would be re-evaluated
# at export and undo the applied transforms below.
for o in bpy.context.scene.objects:
    o.animation_data_clear()
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
assert len(meshes) == 1, [m.name for m in meshes]
mesh = meshes[0]

KEEP = {
    "Bip01 Pelvis", "Bip01 Spine", "Bip01 Spine1", "Bip01 Spine2", "Bip01 Neck",
    "Bip01 Head", "Bip01 MJaw",
    "Bip01 L Clavicle", "Bip01 L UpperArm", "Bip01 L Forearm", "Bip01 L Hand",
    "Bip01 R Clavicle", "Bip01 R UpperArm", "Bip01 R Forearm", "Bip01 R Hand",
    "Bip01 L Thigh", "Bip01 L Calf", "Bip01 L Foot", "Bip01 L Toe0",
    "Bip01 R Thigh", "Bip01 R Calf", "Bip01 R Foot", "Bip01 R Toe0",
}
bones = arm.data.bones
world = arm.matrix_world

def world_head(name):
    return world @ bones[name].head_local

meta = {"source": src.split("/")[-1]}
# Landmarks in the final metric, Y-up frame (Blender Z-up -> glTF Y-up:
# x, z, -y). Converted after transform application below.
landmarks = {}
for key, name in (("eyeL", "Bip01 LEye"), ("eyeR", "Bip01 REye"),
                  ("jaw", "Bip01 MJaw"), ("mouth", "Bip01 MBottomLip"),
                  ("nose", "Bip01 MNose")):
    if name in bones:
        landmarks[key] = world_head(name)

# Pose the fingers into a slight zombie claw before folding them into the
# hand: rotate every finger joint around the hand's lateral axis.
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for pb in arm.pose.bones:
    n = pb.name
    if " Finger" in n:
        thumb = "Finger0" in n
        depth = n[-1] if n[-2].isdigit() and n[-3] == "r" else "0"
        amount = claw * (0.35 if thumb else 1.0) * (0.6 if n.endswith(("0", "1", "2", "3", "4")) and n[-2] == "r" else 1.0)
        # Biped finger bones curl around their local Z axis.
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, -amount * (0.8 if thumb else 1.0))
bpy.ops.object.mode_set(mode="OBJECT")

# Bake the posed fingers into the mesh, then make the pose the new rest.
mod = next(m for m in mesh.modifiers if m.type == "ARMATURE")
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.modifier_copy(modifier=mod.name)
copy = mesh.modifiers[-1]
bpy.ops.object.modifier_move_to_index(modifier=copy.name, index=0)
bpy.ops.object.modifier_apply(modifier=copy.name)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode="OBJECT")

# Fold every removed bone's weights into its nearest kept ancestor.
def kept_ancestor(name):
    b = bones[name]
    while b and b.name not in KEEP:
        b = b.parent
    return b.name if b else "Bip01 Pelvis"

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
for v in mesh.data.vertices:
    for g in v.groups:
        if g.group in fold:
            key = (v.index, fold[g.group])
            accum[key] = accum.get(key, 0.0) + g.weight
for (vi, target), w in accum.items():
    vg[index[target]].add([vi], w, "ADD")
for gi in sorted(fold, reverse=True):
    vg.remove(vg[gi])

# Drop groups that drive no bone, then give every unweighted vertex to the
# nearest kept bone segment (the glTF exporter would otherwise add a
# "neutral_bone" joint for them).
for g in list(vg):
    if g.name not in bones:
        vg.remove(g)
kept = {g.index: g.name for g in vg if g.name in KEEP}
segments = []
for name in KEEP:
    if name in bones:
        b = bones[name]
        segments.append((name, world @ b.head_local, world @ b.tail_local))
def nearest_bone(p):
    best, best_d = None, float("inf")
    for name, a, b in segments:
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
        d = (a + ab * t - p).length
        if d < best_d:
            best, best_d = name, d
    return best
orphans = 0
for v in mesh.data.vertices:
    total = sum(g.weight for g in v.groups if g.group in kept)
    if total < 1e-6:
        target = nearest_bone(mesh.matrix_world @ v.co)
        if target not in index:
            index[target] = vg.new(name=target).index
        vg[index[target]].add([v.index], 1.0, "REPLACE")
        orphans += 1
meta["orphanVertices"] = orphans

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
for b in [b for b in eb if b.name not in KEEP]:
    eb.remove(b)
bpy.ops.object.mode_set(mode="OBJECT")

# Normalize to four influences, as glTF/three expect.
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
bpy.ops.object.mode_set(mode="OBJECT")

# Apply the FBX centimetre scale and the Biped yaw: armature first, then the
# mesh (applying both in one call leaves the armature transform in place).
for target in (arm, mesh):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def gl(v):  # Blender Z-up -> glTF Y-up (metres)
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]

# The FBX armature carried scale 0.01 and a -90 degree yaw: map landmarks
# recorded before application through the same object matrix.
meta["landmarks"] = {k: gl(v) for k, v in landmarks.items()}
meta["bones"] = [b.name for b in arm.data.bones]
me = mesh.data
meta["triangles"] = sum(len(p.vertices) - 2 for p in me.polygons)
meta["vertices"] = len(me.vertices)
meta["materials"] = [m.name for m in me.materials]
lo = min((mesh.matrix_world @ v.co).z for v in me.vertices)
hi = max((mesh.matrix_world @ v.co).z for v in me.vertices)
meta["height"] = round(hi - lo, 4)
meta["floor"] = round(lo, 4)

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
    json.dump(meta, f, indent=1)
print("OK", json.dumps(meta))
