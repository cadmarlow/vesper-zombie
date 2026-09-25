# Builds one Vesper weapon in Blender and exports it as GLB.
#   blender -b --factory-startup --python build.py -- <id> <out.glb> <out.json> [preview.png ...]
# Each weapon module returns its root empty; parts are objects parented to it,
# sockets are empties named "socket_*". The JSON sidecar records triangle
# counts, part pivots and socket frames for the build report.
import bpy, sys, os, json, importlib, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kit

argv = sys.argv[sys.argv.index("--") + 1:]
wid, out_glb, out_json = argv[0], argv[1], argv[2]
previews = argv[3:]

kit.reset()
t0 = time.time()
module = importlib.import_module(f"weapon_{wid}")
root, info = module.build()
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
t1 = time.time()
kit.unwrap(meshes)
for ob in meshes:
    kit.box_uv(ob, info.get("uv_tile", 0.04))
bake_prefix = os.path.splitext(out_glb)[0]
maps = kit.bake_wear(meshes, bake_prefix, size=info.get("bake_size", 1024),
                     ao_distance=info.get("ao", 0.02))
t2 = time.time()
report = {
    "id": wid,
    "triangles": {o.name: kit.triangles(o) for o in meshes},
    "total": sum(kit.triangles(o) for o in meshes),
    "seconds": {"model": round(t1 - t0, 1), "surface": round(t2 - t1, 1)},
    "maps": maps,
    **info.get("meta", {}),
}
kit.export_glb(out_glb, root)
with open(out_json, "w") as f:
    json.dump(report, f, indent=1)
for spec in previews:
    # path[:yaw:pitch:distance]
    parts = spec.split(":")
    path = parts[0]
    yaw = float(parts[1]) if len(parts) > 1 else -35
    pitch = float(parts[2]) if len(parts) > 2 else 12
    dist = float(parts[3]) if len(parts) > 3 else info.get("preview_distance", 0.6)
    kit.preview(path, info.get("preview_target", (0, 0, 0)), dist, yaw, pitch)
print("BUILD", json.dumps(report))
