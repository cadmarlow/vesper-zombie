# ECLIPSE — the anomalous weapon, a reliquary built around an eclipse: an
# obsidian core with a burning corona held by two gold gyroscope rings,
# three converging prongs over an energy channel, a bone grip banded in
# gold, a crescent-moon stock, a glass energy cell and a halo sight.
# Energy axis along z at the origin; the core sits over the grip's front.
import math
import kit
from kit import (fillet, prism, box, cylinder, lathe, tube, boolean, union, intersect, join,
                 copy, move, rotate, finish, empty, part, loft, sweep, arc)

CORE = (0.0, 0.004, -0.150)
HALO = 0.062


def torus(name, major, minor, center, axis="z", seg=64, rings=14):
    """A ring swept along a circle of radius major around the given axis."""
    cx, cy, cz = center
    pts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        if axis == "z":
            pts.append((cx + major * math.cos(a), cy + major * math.sin(a), cz))
        elif axis == "x":
            pts.append((cx, cy + major * math.cos(a), cz + major * math.sin(a)))
        else:
            pts.append((cx + major * math.cos(a), cy, cz + major * math.sin(a)))
    return sweep(name, pts, minor, rings, closed=True)


def prong(name, start, end, bulge, r0, r1, n=14):
    """A tapered, gently curved tine from start to end (game points)."""
    pts = []
    for i in range(n + 1):
        t = i / n
        p = [start[k] + (end[k] - start[k]) * t for k in range(3)]
        s = math.sin(t * math.pi)
        p = [p[k] + bulge[k] * s for k in range(3)]
        pts.append(p)
    ob = sweep(name, pts, r0, 14)
    # Taper: scale each ring toward the tip.
    me = ob.data
    import bpy
    rings = n + 1
    per = 14
    for i in range(rings):
        t = i / n
        k = (r0 + (r1 - r0) * t) / r0
        c = pts[i]
        from kit import B
        cb = B(*c)
        for j in range(per):
            v = me.vertices[i * per + j]
            v.co = cb + (v.co - cb) * k
    return ob


def build():
    root = empty("eclipse", extras={"weapon": "eclipse"})

    # ------------------------------------------------------------- body
    body = prism("body", fillet([
        (-0.110, 0.016, 0.01), (-0.110, -0.020, 0.012), (-0.060, -0.030, 0.02), (0.030, -0.030, 0.012),
        (0.135, -0.024, 0.01), (0.150, -0.004, 0.01), (0.140, 0.020, 0.012), (0.060, 0.030, 0.02),
        (-0.040, 0.030, 0.02),
    ], 0.0, 8), -0.018, 0.018, "x")
    intersect(body, prism("sec", fillet([(-0.018, -0.035, 0.012), (0.018, -0.035, 0.012), (0.018, 0.033, 0.016),
                                         (-0.018, 0.033, 0.016)], 0.0, 6), -0.3, 0.3, "z"))
    # Window over the channel, and the fluted sides.
    boolean(body, [
        box("c", -0.006, 0.006, -0.004, 0.04, -0.100, 0.030, r=0.004),
        *[box("c", s * 0.0165 if s > 0 else -0.03, 0.03 if s > 0 else -0.0165, -0.016 + i * 0.012, -0.010 + i * 0.012,
              -0.080, 0.110, r=0.003) for s in (-1, 1) for i in range(3)],
    ])
    finish(body, 0.001, 3, angle=25)
    kit.set_material(body, "obsidian")
    body.parent = root

    # Gold filigree ribs along the body and around the core cradle.
    ribs = []
    for s in (-1, 1):
        ribs.append(sweep("rib", [(s * 0.0185, 0.026, 0.120), (s * 0.0195, 0.030, 0.040), (s * 0.019, 0.024, -0.050),
                                  (s * 0.017, 0.012, -0.108)], 0.0022, 10))
        ribs.append(sweep("rib", [(s * 0.0185, -0.026, 0.120), (s * 0.0195, -0.031, 0.000), (s * 0.018, -0.022, -0.090),
                                  (s * 0.016, -0.012, -0.110)], 0.0022, 10))
    cradle = []
    for s in (-1, 1):
        cradle.append(sweep("cradle", [(s * 0.012, 0.022, -0.102), (s * 0.034, 0.040, -0.130), (s * 0.044, 0.030, -0.160),
                                       (s * 0.036, 0.008, -0.192), (s * 0.014, 0.012, -0.206)], 0.0034, 12))
        cradle.append(sweep("cradle", [(s * 0.012, -0.020, -0.102), (s * 0.032, -0.036, -0.132), (s * 0.040, -0.028, -0.162),
                                       (s * 0.032, -0.010, -0.190), (s * 0.012, -0.012, -0.206)], 0.0030, 12))
    collar = torus("collar", 0.021, 0.0035, (0, 0, -0.110), "z", 48, 12)
    nose = torus("nose", 0.019, 0.0032, (0, 0, -0.206), "z", 48, 12)
    gold = join([*ribs, *cradle, collar, nose], "filigree")
    finish(gold, 0.0, 1, weighted_normals=False)
    kit.set_material(gold, "gold")
    gold.parent = root

    # ------------------------------------------------------------- core
    core = lathe("core", [(0, CORE[2] - 0.028)] + [(0.028 * math.sin(math.radians(a)), CORE[2] - 0.028 * math.cos(math.radians(a)))
                                                    for a in range(10, 180, 10)] + [(0, CORE[2] + 0.028)],
                 (CORE[0], CORE[1]), 48)
    finish(core, 0.0, 1, weighted_normals=False)
    kit.set_material(core, "obsidian")
    core.parent = root
    corona = torus("corona", 0.0305, 0.0016, CORE, "z", 72, 10)
    finish(corona, 0.0, 1, weighted_normals=False)
    kit.set_material(corona, "emitter")
    # The corona faces the shooter's eye: it spins slowly in its plane.
    kit.part("corona", corona, CORE, root, {"part": "corona"})
    ring_a = torus("ring_a", 0.041, 0.0022, CORE, "x", 72, 10)
    ring_b = torus("ring_b", 0.047, 0.0020, CORE, "y", 72, 10)
    for i, (ob, a) in enumerate(((ring_a, 0), (ring_b, 0))):
        finish(ob, 0.0, 1, weighted_normals=False)
        kit.set_material(ob, "gold")
    kit.part("ring_a", ring_a, CORE, root, {"part": "ring_a"})
    kit.part("ring_b", ring_b, CORE, root, {"part": "ring_b"})

    # --------------------------------------------------- prongs, channel
    tines = [
        prong("tine_top", (0.0, 0.020, -0.200), (0.0, 0.010, -0.470), (0.0, 0.012, 0.0), 0.0075, 0.0022),
        prong("tine_l", (-0.018, -0.010, -0.200), (-0.008, -0.004, -0.470), (-0.010, -0.006, 0.0), 0.0068, 0.002),
        prong("tine_r", (0.018, -0.010, -0.200), (0.008, -0.004, -0.470), (0.010, -0.006, 0.0), 0.0068, 0.002),
    ]
    for t_ in tines:
        finish(t_, 0.0, 1, weighted_normals=False)
    prongs = join(tines, "prongs")
    kit.set_material(prongs, "obsidian")
    prongs.parent = root
    bands = [torus("band", 0.024 - i * 0.004, 0.0024, (0, 0.002, -0.260 - i * 0.07), "z", 48, 10) for i in range(3)]
    for b_ in bands:
        finish(b_, 0.0, 1, weighted_normals=False)
    band = join(bands, "bands")
    kit.set_material(band, "gold")
    band.parent = root
    channel = cylinder("channel", 0.0036, -0.470, -0.090, (0, 0.002), 20)
    tip = torus("tip", 0.0085, 0.0018, (0, 0.002, -0.472), "z", 36, 8)
    finish(channel, 0.0, 1, weighted_normals=False)
    finish(tip, 0.0, 1, weighted_normals=False)
    energy = join([channel, tip], "channel")
    kit.set_material(energy, "emitter")
    energy.parent = root

    # --------------------------------------------------- grip and guard
    g = math.radians(16)

    def grip_section(yv, scale=1.0):
        zc = 0.078 + (-yv - 0.028) * math.tan(g)
        pts = fillet([(-0.0135 * scale, -0.021 * scale), (0.0135 * scale, -0.021 * scale),
                      (0.0135 * scale, 0.021 * scale), (-0.0135 * scale, 0.021 * scale)], 0.011 * scale, 4)
        return [(x, yv, zc + d) for x, d in pts]

    grip = loft("grip", [grip_section(-0.028), grip_section(-0.060, 1.04), grip_section(-0.095, 1.06),
                         grip_section(-0.130, 0.98)])
    finish(grip, 0.0, 1, weighted_normals=False)
    kit.set_material(grip, "bone")
    grip.parent = root
    gbands = []
    for yv in (-0.040, -0.122):
        zc = 0.078 + (-yv - 0.028) * math.tan(g)
        b_ = tube("gband", 0.0172, 0.0125, yv - 0.003, yv + 0.003, (0.0, zc), 40, axis="y")
        finish(b_, 0.0003, 1)
        gbands.append(b_)
    pommel = lathe("pommel", [(0, -0.142), (0.017, -0.142), (0.0185, -0.137), (0.016, -0.130), (0, -0.130)],
                   (0.0, 0.078 + (0.142 - 0.028) * math.tan(g)), 40, axis="y")
    finish(pommel, 0.0003, 1)
    guard = sweep("guard", [(0.0, -0.030, 0.052), (0.0, -0.046, 0.046), (0.0, -0.060, 0.020), (0.0, -0.058, -0.010),
                            (0.0, -0.040, -0.030), (0.0, -0.030, -0.034)], 0.0032, 12)
    finish(guard, 0.0, 1, weighted_normals=False)
    trim = join([*gbands, pommel, guard], "grip_trim")
    kit.set_material(trim, "gold")
    trim.parent = root
    trigger = sweep("trigger", [(0.0, -0.029, 0.012), (0.0, -0.040, 0.010), (0.0, -0.050, 0.014)], 0.0028, 10)
    finish(trigger, 0.0, 1, weighted_normals=False)
    kit.set_material(trigger, "gold")
    kit.part("trigger", trigger, (0, -0.029, 0.012), root, {"part": "trigger"})

    # ------------------------------------------------ crescent stock
    arm = sweep("stock_arm", [(0.0, 0.004, 0.140), (0.0, 0.000, 0.200), (0.0, -0.020, 0.250), (0.0, -0.040, 0.272)],
                0.0105, 16)
    finish(arm, 0.0, 1, weighted_normals=False)
    # Crescent butt: horns toward the shoulder, thickest in the middle.
    crescent = prism("crescent", [(0.290 + 0.028 * math.cos(math.radians(a)), -0.040 + 0.078 * math.sin(math.radians(a)))
                                  for a in range(90, 271, 10)] +
                     [(0.303 + 0.016 * math.cos(math.radians(a)), -0.040 + 0.070 * math.sin(math.radians(a)))
                      for a in range(260, 99, -10)], -0.014, 0.014, "x")
    finish(crescent, 0.002, 3, angle=25)
    kit.set_material(arm, "obsidian")
    arm.parent = root
    kit.set_material(crescent, "obsidian")
    crescent.parent = root
    moon_edge = sweep("moon_edge", [(0.0, -0.040 + 0.079 * math.sin(math.radians(a)), 0.290 + 0.029 * math.cos(math.radians(a)))
                                    for a in range(95, 266, 10)], 0.0024, 8)
    finish(moon_edge, 0.0, 1, weighted_normals=False)
    kit.set_material(moon_edge, "gold")
    moon_edge.parent = root

    # --------------------------------------------------- halo sight
    halo = torus("halo", 0.0165, 0.0021, (0, HALO, 0.030), "z", 56, 10)
    posts = [sweep("halo_post", [(s * 0.010, 0.030, 0.030), (s * 0.012, 0.042, 0.030), (s * 0.012, HALO - 0.014, 0.030)],
                   0.0022, 8) for s in (-1, 1)]
    for ob in (halo, *posts):
        finish(ob, 0.0, 1, weighted_normals=False)
    sight = join([halo, *posts], "halo")
    kit.set_material(sight, "gold")
    sight.parent = root
    lens = cylinder("halo_lens", 0.0150, 0.0295, 0.0305, (0, HALO), 40)
    finish(lens, 0.0, 1, weighted_normals=False)
    kit.set_material(lens, "lens")
    lens.parent = root
    lens["reticle"] = "eclipse"

    # ------------------------------------------------------ energy cell
    cell = lathe("cell", [(0, 0.0), (0.0105, 0.0), (0.0125, -0.004), (0.0125, -0.066), (0.0105, -0.070), (0, -0.070)],
                 (0.0, 0.0), 32, axis="y")
    caps = [tube("cell_cap", 0.0135, 0.0110, y0, y1, (0.0, 0.0), 32, axis="y") for y0, y1 in ((-0.012, -0.002), (-0.068, -0.058))]
    for ob in (cell, *caps):
        finish(ob, 0.0, 1, weighted_normals=False)
    move(cell, 0, -0.030, -0.052)
    for c_ in caps:
        move(c_, 0, -0.030, -0.052)
    kit.set_material(cell, "emitter")
    cap_all = join(caps, "cell_caps")
    kit.set_material(cap_all, "gold")
    kit.part("magazine", [cell, cap_all], (0, -0.030, -0.052), root, {"part": "magazine", "axis": [0, -1, 0]})

    # ------------------------------------------------------------ sockets
    empty("socket_muzzle", (0, 0.002, -0.476), root)
    empty("socket_eject", (0.0, -0.08, -0.05), root)
    empty("socket_sight_rear", (0, HALO, 0.031), root)
    empty("socket_sight_front", (0, HALO, -0.100), root)
    empty("socket_core", CORE, root)
    import bpy
    for ob in list(bpy.context.scene.objects):
        if ob.parent is None and ob is not root:
            ob.parent = root
    return root, {
        "preview_target": (0, -0.02, -0.1),
        "preview_distance": 1.0,
        "ao": 0.02,
        "uv_tile": 0.035,
        "meta": {"class": "energy"},
    }
