# REQUIEM-12 — a 12 gauge pump shotgun: parkerized steel receiver with its
# side saddle of red shells, 18.5 inch barrel under a perforated heat shield,
# tube magazine and cap, grooved walnut pump riding on its action bars,
# walnut stock with a pistol grip, ghost-ring rear and fibre-optic front.
# Bore along z at the origin; breech face at z = 0.
import math
import kit
from kit import (fillet, prism, box, cylinder, lathe, tube, boolean, union, intersect, join,
                 copy, move, rotate, finish, empty, part, loft, sweep)

TUBE_Y = -0.0265  # magazine tube axis
SIGHT = 0.034     # sight line above the bore
GRIP = 18.0


def shell(name, x, y, z, axis="y", brass_up=True, parent=None):
    """A 2.75 inch shell: ribbed red hull and brass head (brass at the top)."""
    hull_len, head = 0.058, 0.012
    parts = []
    if axis == "y":
        hy0, hy1 = (y - hull_len / 2, y + hull_len / 2 - head) if brass_up else (y - hull_len / 2 + head, y + hull_len / 2)
        by0, by1 = (hy1, hy1 + head) if brass_up else (hy0 - head, hy0)
        hull = cylinder(name + "_hull", 0.0098, hy0, hy1, (x, z), 20, axis="y")
        brass = lathe(name + "_brass", [(0, by0), (0.0099, by0), (0.0099, by1 - 0.0012), (0.0104, by1 - 0.0012),
                                        (0.0104, by1), (0, by1)], (x, z), 24, axis="y")
    else:
        hull = cylinder(name + "_hull", 0.0098, z - hull_len / 2, z + hull_len / 2 - head, (x, y), 20)
        brass = lathe(name + "_brass", [(0, z + hull_len / 2 - head), (0.0099, z + hull_len / 2 - head),
                                        (0.0099, z + hull_len / 2 - 0.0012), (0.0104, z + hull_len / 2 - 0.0012),
                                        (0.0104, z + hull_len / 2), (0, z + hull_len / 2)], (x, y), 24)
    finish(hull, 0.0003, 1)
    finish(brass, 0.0002, 1)
    return hull, brass


def build():
    root = empty("requiem", extras={"weapon": "requiem"})

    # ---------------------------------------------------------- receiver
    rec = prism("receiver", fillet([
        (-0.075, 0.013, 0.004), (-0.075, -0.037, 0.004), (0.118, -0.037, 0.006),
        (0.132, -0.022, 0.01), (0.132, 0.006, 0.006), (0.108, 0.017, 0.012), (-0.058, 0.017, 0.008),
    ]), -0.0148, 0.0148, "x")
    intersect(rec, prism("sec", fillet([(-0.0148, -0.04, 0.003), (0.0148, -0.04, 0.003), (0.0148, 0.0, 0.0),
                                        (0.0148, 0.018, 0.009), (-0.0148, 0.018, 0.009)]), -0.3, 0.3, "z"))
    boolean(rec, [
        prism("c", fillet([(-0.052, -0.012, 0.003), (0.006, -0.012, 0.003), (0.006, 0.011, 0.003),
                           (-0.052, 0.011, 0.003)]), 0.009, 0.03, "x"),
        box("c", -0.0105, 0.0105, -0.06, -0.028, -0.052, 0.028, r=0.004),
        cylinder("c", 0.0106, -0.09, 0.0, (0, 0), 32),
        cylinder("c", 0.0118, -0.09, -0.05, (0, TUBE_Y), 32),
    ])
    finish(rec, 0.0007, 2)
    # Crossbolt safety, trigger guard and the side-saddle plate.
    guard = prism("guard", fillet([
        (0.020, -0.034, 0.002), (0.112, -0.034, 0.002), (0.110, -0.056, 0.006), (0.090, -0.082, 0.012),
        (0.040, -0.082, 0.012), (0.024, -0.062, 0.008),
    ]), -0.0072, 0.0072, "x")
    boolean(guard, [prism("c", fillet([(0.034, -0.040, 0.003), (0.098, -0.040, 0.003), (0.090, -0.074, 0.009),
                                       (0.044, -0.074, 0.009)]), -0.03, 0.03, "x")])
    safety = cylinder("safety", 0.0038, -0.0165, 0.0165, (-0.036, 0.105), 20, axis="x")
    saddle = prism("saddle", fillet([(-0.046, -0.033, 0.004), (0.070, -0.033, 0.004), (0.070, 0.010, 0.004),
                                     (-0.046, 0.010, 0.004)]), -0.0185, -0.0146, "x")
    for i in range(5):
        z = -0.034 + i * 0.024
        boolean(saddle, [box("c", -0.03, -0.0172, -0.02, 0.0, z - 0.0085, z + 0.0085, r=0.003)])
    for ob in (guard, safety, saddle):
        finish(ob, 0.0005, 2)
    steel = join([rec, guard, safety], "receiver")
    kit.set_material(steel, "steel_dark")
    steel.parent = root
    kit.set_material(saddle, "polymer")
    saddle.parent = root
    hulls, heads = [], []
    for i in range(5):
        h, b = shell(f"saddle_shell{i}", -0.0288, -0.012, -0.034 + i * 0.024)
        hulls.append(h)
        heads.append(b)
    red = join(hulls, "saddle_hulls")
    kit.set_material(red, "shell_red")
    red.parent = root
    gold = join(heads, "saddle_heads")
    kit.set_material(gold, "brass")
    gold.parent = root

    # Ghost-ring rear sight on protective ears.
    base = box("rear_base", -0.012, 0.012, 0.014, 0.022, 0.078, 0.112, r=0.003)
    ears = [prism("ear", fillet([(0.082, 0.02), (0.108, 0.02), (0.106, 0.043, 0.004), (0.090, 0.043, 0.004)]),
                  s * 0.0065 if s > 0 else -0.0105, 0.0105 if s > 0 else -0.0065, "x") for s in (-1, 1)]
    ring = tube("ghost_ring", 0.0062, 0.0034, 0.096, 0.100, (0, SIGHT), 32)
    stem = box("ring_stem", -0.0022, 0.0022, 0.02, 0.029, 0.095, 0.101)
    for ob in (base, *ears, ring, stem):
        finish(ob, 0.0004, 2)
    rear = join([base, *ears, ring, stem], "rear_sight")
    kit.set_material(rear, "steel")
    rear.parent = root

    # ------------------------------------------------------------ barrel
    barrel = tube("barrel", 0.0108, 0.0092, -0.470, -0.074, (0, 0), 40)
    crown = tube("crown", 0.0108, 0.0096, -0.4715, -0.470, (0, 0), 40)
    shield = tube("shield", 0.0152, 0.0132, -0.360, -0.100, (0, 0), 40)
    boolean(shield, [box("c", -0.03, 0.03, -0.04, -0.002, -0.4, 0.0)])
    holes = []
    for i in range(9):
        z = -0.33 + i * 0.026
        for a in (-40, 0, 40):
            h = cylinder("c", 0.0036, 0.0, 0.03, (0, z), 14, axis="y")
            rotate(h, a, "z")
            holes.append(h)
    boolean(shield, [join(holes, "c")])
    mag_tube = cylinder("mag_tube", 0.0116, -0.415, -0.074, (0, TUBE_Y), 36)
    cap = lathe("cap", [(0, -0.447), (0.0095, -0.447), (0.0124, -0.444), (0.0124, -0.418), (0.0118, -0.415),
                        (0, -0.415)], (0, TUBE_Y), 40)
    for i in range(12):
        boolean(cap, [box("c", -0.001, 0.001, TUBE_Y + 0.011, TUBE_Y + 0.02, -0.442, -0.421)])
        rotate(cap, 30, "z", (0, TUBE_Y, 0))
    clamp = prism("clamp", fillet([(-0.0145, 0.004), (0.0145, 0.004), (0.0145, -0.048), (-0.0145, -0.048)], 0.012),
                  -0.402, -0.386, "z")
    boolean(clamp, [cylinder("c", 0.0109, -0.5, -0.3, (0, 0), 36), cylinder("c", 0.0117, -0.5, -0.3, (0, TUBE_Y), 36)])
    # Front sight: ramp base with a blade and fibre-optic rod.
    ramp = prism("ramp", fillet([(-0.468, 0.0098), (-0.438, 0.0098), (-0.444, 0.020, 0.004), (-0.462, 0.022, 0.003)]),
                 -0.0055, 0.0055, "x")
    blade = prism("blade", fillet([(-0.462, 0.018), (-0.450, 0.018), (-0.451, SIGHT + 0.0004, 0.001),
                                   (-0.461, SIGHT + 0.0004, 0.001)]), -0.0021, 0.0021, "x")
    for ob in (barrel, crown, shield, mag_tube, cap, clamp, ramp, blade):
        finish(ob, 0.0004, 2)
    metal = join([barrel, crown, shield, mag_tube, cap, clamp, ramp, blade], "barrel")
    kit.set_material(metal, "steel_dark")
    metal.parent = root
    fiber = cylinder("fiber", 0.0016, -0.4605, -0.4515, (0, SIGHT - 0.0019), 12)
    finish(fiber, 0.0, 1, weighted_normals=False)
    kit.set_material(fiber, "fiber")
    fiber.parent = root

    # --------------------------------------------------------------- pump
    pump = prism("pump", fillet([(-0.292, -0.010, 0.006), (-0.292, -0.043, 0.01), (-0.140, -0.043, 0.01),
                                 (-0.140, -0.010, 0.006)]), -0.0235, 0.0235, "x")
    intersect(pump, prism("sec", fillet([(-0.0235, -0.048, 0.014), (0.0235, -0.048, 0.014), (0.0235, -0.008, 0.008),
                                         (-0.0235, -0.008, 0.008)]), -0.4, 0.0, "z"))
    grooves = []
    for i in range(9):
        z = -0.272 + i * 0.0145
        for s in (-1, 1):
            grooves.append(box("c", s * 0.0205 if s > 0 else -0.03, 0.03 if s > 0 else -0.0205, -0.046, -0.012,
                               z - 0.0028, z + 0.0028, r=0.0014))
        grooves.append(box("c", -0.012, 0.012, -0.06, -0.0425, z - 0.0028, z + 0.0028, r=0.0014))
    boolean(pump, [join(grooves, "c"), cylinder("c", 0.0118, -0.4, 0.0, (0, TUBE_Y), 36)])
    finish(pump, 0.0012, 2)
    kit.set_material(pump, "wood")
    bars = [box("bar", s * 0.0118 if s > 0 else -0.0138, 0.0138 if s > 0 else -0.0118, TUBE_Y - 0.004,
                TUBE_Y + 0.004, -0.150, -0.050, r=0.001) for s in (-1, 1)]
    ring_ = tube("pump_ring", 0.0132, 0.0117, -0.150, -0.140, (0, TUBE_Y), 36)
    for ob in (*bars, ring_):
        finish(ob, 0.0003, 1)
    bars_all = join([*bars, ring_], "action_bars")
    kit.set_material(bars_all, "steel")
    kit.part("pump", [pump, bars_all], (0, TUBE_Y, -0.215), root, {"part": "pump"})
    bolt = box("bolt", -0.0092, 0.0098, -0.010, 0.010, -0.060, 0.020, r=0.002)
    finish(bolt, 0.0003, 2)
    kit.set_material(bolt, "steel_bright")
    kit.part("bolt", bolt, (0, 0, 0), root, {"part": "bolt"})

    # ------------------------------------------------------ stock, grip
    g = math.radians(GRIP)
    # Field-stock drop: the comb falls 4.5 cm below the sight line at the
    # nose and 6 cm at the heel, so the cheek, not the eye, finds it.
    stock = prism("stock", fillet([
        (0.128, 0.010, 0.006), (0.165, -0.004, 0.03), (0.205, -0.011, 0.02), (0.398, -0.024, 0.012),
        (0.408, -0.028, 0.004), (0.408, -0.142, 0.006), (0.392, -0.146, 0.01), (0.226, -0.066, 0.04),
        (0.176, -0.056, 0.02),
        (0.150 + 0.090 * math.tan(g), -0.146, 0.01), (0.116 + 0.092 * math.tan(g), -0.150, 0.008),
        (0.110 + 0.02 * math.tan(g), -0.058, 0.01), (0.120, -0.036, 0.008),
    ]), -0.0185, 0.0185, "x")
    intersect(stock, prism("sec", fillet([(-0.0185, -0.2, 0.008), (0.0185, -0.2, 0.008), (0.0185, 0.02, 0.012),
                                          (-0.0185, 0.02, 0.012)]), 0.1, 0.5, "z"))
    # Checkering panels on the grip.
    finish(stock, 0.0025, 3, angle=25)
    kit.set_material(stock, "wood")
    stock.parent = root
    pad = box("buttpad", -0.0195, 0.0195, -0.146, -0.024, 0.404, 0.424, r=0.006)
    finish(pad, 0.0015, 2)
    kit.set_material(pad, "rubber")
    pad.parent = root
    trigger = prism("trigger", fillet([(0.060, -0.038), (0.066, -0.038), (0.066, -0.058, 0.002),
                                       (0.060, -0.064, 0.003), (0.057, -0.054, 0.002)]), -0.0033, 0.0033, "x")
    finish(trigger, 0.0003, 2)
    kit.set_material(trigger, "steel")
    kit.part("trigger", trigger, (0, -0.038, 0.063), root, {"part": "trigger"})

    # A loose shell for the reload hand (hidden until picked up).
    hh, hb = shell("load_shell", 0.0, 0.0, 0.0, axis="z")
    kit.set_material(hh, "shell_red")
    kit.set_material(hb, "brass")
    kit.part("shell", [hh, hb], (0, 0, 0), root, {"part": "shell"})

    # ------------------------------------------------------------ sockets
    empty("socket_muzzle", (0, 0, -0.474), root)
    empty("socket_eject", (0.016, 0.0, -0.022), root)
    empty("socket_port", (0, -0.045, -0.02), root)
    empty("socket_sight_rear", (0, SIGHT, 0.098), root)
    empty("socket_sight_front", (0, SIGHT, -0.4565), root)
    import bpy
    for ob in list(bpy.context.scene.objects):
        if ob.parent is None and ob is not root:
            ob.parent = root
    return root, {
        "preview_target": (0, -0.03, 0.0),
        "preview_distance": 1.1,
        "ao": 0.02,
        "uv_tile": 0.04,
        "meta": {"class": "shotgun", "grip_angle": GRIP},
    }
