# SPECTRE 9 — a roller-delayed 9 mm submachine gun in the MP5 pattern:
# stamped receiver with its cocking tube and hooded front sight, three-lug
# muzzle, slim grooved handguard, polymer trigger group, curved 30-round
# magazine and retractable stock, topped with a micro tube red dot.
# Bore along z at the origin; breech face at z = 0.
import math
import kit
from kit import (fillet, prism, box, cylinder, lathe, tube, boolean, union, intersect, join,
                 copy, move, rotate, finish, empty, part, loft, sweep)

GRIP = 16.0
MAG_TOP = (0.0, -0.012, -0.052)
MAG_TILT = 7.0  # the curved magazine leans forward


def mag_section(width, depth, r, y, z):
    """Rounded rectangle section of the magazine at height y, centred on z."""
    pts = fillet([(-width / 2, -depth / 2), (width / 2, -depth / 2), (width / 2, depth / 2),
                  (-width / 2, depth / 2)], r, 3)
    return [(x, y, z + d) for x, d in pts]


def build():
    root = empty("spectre", extras={"weapon": "spectre"})

    # ---------------------------------------------------------- receiver
    rec = prism("receiver", fillet([
        (-0.112, 0.020, 0.004), (-0.112, -0.020, 0.003), (0.004, -0.022, 0.0),
        (0.186, -0.022, 0.003), (0.192, -0.012, 0.004), (0.192, 0.021, 0.006),
        (0.170, 0.029, 0.004), (-0.090, 0.029, 0.004),
    ]), -0.0205, 0.0205, "x")
    intersect(rec, prism("sec", fillet([(-0.0205, -0.03), (0.0205, -0.03), (0.0205, 0.012, 0.0),
                                        (0.0205, 0.031, 0.017), (-0.0205, 0.031, 0.017)]), -0.3, 0.3, "z"))
    cuts = [
        # Ejection port (right) with its bolt window.
        prism("c", fillet([(-0.006, -0.004, 0.002), (0.046, -0.004, 0.002), (0.046, 0.017, 0.002),
                           (-0.006, 0.017, 0.002)]), 0.012, 0.05, "x"),
        # Magazine well.
        box("c", -0.012, 0.012, -0.05, -0.012, -0.070, -0.034),
        # Stamped side flutes along the receiver.
        prism("c", fillet([(0.058, 0.004, 0.003), (0.168, 0.004, 0.003), (0.168, 0.011, 0.003),
                           (0.058, 0.011, 0.003)]), 0.0195, 0.03, "x"),
        prism("c", fillet([(0.058, 0.004, 0.003), (0.168, 0.004, 0.003), (0.168, 0.011, 0.003),
                           (0.058, 0.011, 0.003)]), -0.03, -0.0195, "x"),
    ]
    boolean(rec, cuts)
    finish(rec, 0.0006, 2)
    # Rear cap and the stock housing lugs.
    cap = box("cap", -0.022, 0.022, -0.024, 0.022, 0.186, 0.198, r=0.004)
    finish(cap, 0.0008, 2)
    # Cocking tube over the barrel and its front cap.
    ctube = cylinder("ctube", 0.0118, -0.286, -0.100, (0, 0.0175), 40)
    finish(ctube, 0.0004, 2, dense=0)
    fcap = lathe("fcap", [(0, -0.298), (0.008, -0.298), (0.0118, -0.295), (0.0128, -0.290),
                          (0.0128, -0.281), (0, -0.281)], (0, 0.0175), 40)
    finish(fcap, 0.0003, 1)
    # Hooded front sight on the cocking tube.
    hood = tube("hood", 0.0128, 0.0108, -0.2870, -0.2760, (0, 0.0520), 40)
    hood_post = box("hood_post", -0.0060, 0.0060, 0.0180, 0.0420, -0.2885, -0.2745, r=0.002)
    boolean(hood_post, [cylinder("c", 0.0108, -0.30, -0.26, (0, 0.0520), 36)])
    post = box("post", -0.0011, 0.0011, 0.0395, 0.0512, -0.2830, -0.2800, r=0.0004)
    for ob in (hood, hood_post, post):
        finish(ob, 0.0003, 2)
    # Cocking handle, slotted in the tube's left side.
    handle = sweep("handle", [(-0.012, 0.018, -0.236), (-0.024, 0.024, -0.240), (-0.034, 0.030, -0.238)],
                   0.0028, 10)
    knob = lathe("knob", [(0, -0.0395), (0.005, -0.0395), (0.0062, -0.036), (0.0062, -0.031), (0, -0.031)],
                 (0.030, -0.238), 20, axis="x")
    finish(knob, 0.0002, 1)
    steel = join([rec, cap, ctube, fcap, hood, hood_post, post], "receiver")
    kit.set_material(steel, "steel_dark")
    steel.parent = root
    cocking = join([handle, knob], "cocking_handle")
    kit.set_material(cocking, "steel")
    kit.part("charging_handle", cocking, (-0.012, 0.018, -0.236), root, {"part": "charging_handle"})

    # ----------------------------------------------------- barrel, muzzle
    barrel = tube("barrel", 0.0085, 0.0046, -0.290, -0.100, (0, 0), 36)
    lugs = cylinder("lugs", 0.0108, -0.284, -0.262, (0, 0), 36)
    for i in range(3):
        a = i * 120
        lug = box("c", -0.004, 0.004, 0.008, 0.02, -0.285, -0.263)
        rotate(lug, a, "z")
        boolean(lugs, [lug])
    boolean(lugs, [cylinder("c", 0.0085, -0.30, -0.25, (0, 0), 36)])
    crown = tube("crown", 0.0085, 0.0052, -0.2915, -0.2900, (0, 0), 36)
    for ob in (barrel, lugs, crown):
        finish(ob, 0.0003, 2)
    muzzle = join([barrel, lugs, crown], "barrel")
    kit.set_material(muzzle, "steel")
    muzzle.parent = root

    # ---------------------------------------------------------- handguard
    guard = prism("handguard", fillet([
        (-0.236, -0.004, 0.004), (-0.236, -0.030, 0.008), (-0.226, -0.040, 0.008),
        (-0.084, -0.040, 0.008), (-0.074, -0.030, 0.006), (-0.074, -0.004, 0.003),
    ]), -0.0225, 0.0225, "x")
    intersect(guard, prism("sec", fillet([(-0.0225, -0.045, 0.012), (0.0225, -0.045, 0.012),
                                          (0.0225, 0.004, 0.006), (-0.0225, 0.004, 0.006)]), -0.3, 0.0, "z"))
    grooves = []
    for s in (-1, 1):
        for i in range(7):
            z = -0.215 + i * 0.019
            grooves.append(box("c", s * 0.0205 if s > 0 else -0.03, 0.03 if s > 0 else -0.0205,
                               -0.032, -0.012, z - 0.004, z + 0.004, r=0.002))
    grooves.append(box("c", -0.012, 0.012, -0.05, -0.037, -0.22, -0.09, r=0.004))
    boolean(guard, [join(grooves, "c"), cylinder("c", 0.012, -0.3, 0.0, (0, 0), 32)])
    finish(guard, 0.0012, 2)
    kit.set_material(guard, "polymer")
    guard.parent = root

    # ------------------------------------------------ trigger group, grip
    group = prism("trigger_group", fillet([
        (-0.030, -0.021, 0.002), (0.110, -0.021, 0.002), (0.110, -0.040, 0.006),
        (0.096, -0.046, 0.004), (0.118, -0.150, 0.008), (0.076, -0.158, 0.008),
        (0.060, -0.080, 0.012), (0.040, -0.058, 0.006),
        (0.030, -0.090, 0.010), (-0.030, -0.090, 0.014), (-0.036, -0.052, 0.010),
    ]), -0.0172, 0.0172, "x")
    tg_hole = prism("c", fillet([(-0.022, -0.043, 0.004), (0.028, -0.043, 0.002), (0.022, -0.080, 0.008),
                                 (-0.020, -0.080, 0.010)]), -0.03, 0.03, "x")
    # Finger grooves on the front strap (front line z = 0.060 + (-0.080 - y) * 0.205).
    finger = []
    for y in (-0.100, -0.121):
        front = 0.060 + (-0.080 - y) * 0.205
        finger.append(box("c", -0.03, 0.03, y - 0.0045, y + 0.0045, front - 0.006, front + 0.0028, r=0.003))
    boolean(group, [tg_hole] + finger)
    finish(group, 0.0012, 2)
    kit.set_material(group, "polymer_grip")
    group.parent = root
    trigger = prism("trigger", fillet([(0.004, -0.040), (0.010, -0.040), (0.009, -0.064, 0.002),
                                       (0.003, -0.068, 0.003), (0.0015, -0.060, 0.002)]), -0.0035, 0.0035, "x")
    finish(trigger, 0.0003, 2)
    kit.set_material(trigger, "steel")
    kit.part("trigger", trigger, (0, -0.040, 0.007), root, {"part": "trigger"})
    # Selector with its pictogram plate, left side.
    selector = prism("selector", fillet([(0.056, -0.029, 0.003), (0.084, -0.024, 0.003), (0.088, -0.030, 0.002),
                                         (0.060, -0.036, 0.004)]), -0.0205, -0.0170, "x")
    plate = cylinder("plate", 0.011, -0.0178, -0.0172, (-0.031, 0.061), 32, axis="x")
    release = box("release", -0.006, 0.006, -0.044, -0.030, -0.033, -0.027, r=0.002)
    for ob in (selector, plate, release):
        finish(ob, 0.0003, 2)
    controls = join([selector, plate, release], "controls")
    kit.set_material(controls, "steel")
    controls.parent = root

    # ----------------------------------------------------------- stock
    rods = []
    for s in (-1, 1):
        rods.append(cylinder("rod", 0.0052, 0.196, 0.392, (s * 0.0225, -0.004), 20))
    butt = prism("butt", fillet([(0.388, 0.030, 0.006), (0.404, 0.028, 0.006), (0.412, -0.02, 0.01),
                                 (0.404, -0.092, 0.012), (0.388, -0.094, 0.01), (0.392, -0.02, 0.006)]),
                 -0.026, 0.026, "x")
    for ob in rods:
        finish(ob, 0.0003, 1)
    finish(butt, 0.0015, 3)
    stock = join(rods, "stock_rods")
    kit.set_material(stock, "steel_dark")
    stock.parent = root
    kit.set_material(butt, "rubber")
    butt.parent = root

    # ------------------------------------------- rail mount and red dot
    mount = prism("mount", fillet([(0.030, 0.026), (0.150, 0.026), (0.150, 0.041, 0.003), (0.030, 0.041, 0.003)]),
                  -0.011, 0.011, "x")
    teeth = [box("c", -0.03, 0.03, 0.038, 0.05, z - 0.0026, z + 0.0026) for z in
             [0.040 + i * 0.010 for i in range(11)]]
    boolean(mount, [join(teeth, "c")])
    claws = [box("claw", s * 0.009 if s > 0 else -0.024, 0.024 if s > 0 else -0.009, 0.014, 0.032, 0.05, 0.13,
                 r=0.004) for s in (-1, 1)]
    finish(mount, 0.0004, 2)
    for c in claws:
        finish(c, 0.0008, 2)
    # Micro tube sight: body, hoods, turrets, dial.
    AXIS = 0.0620
    body = lathe("dot_body", [(0, 0.118), (0.0135, 0.118), (0.0152, 0.114), (0.0152, 0.066), (0.0135, 0.062),
                              (0, 0.062)], (0, AXIS), 40)
    boolean(body, [cylinder("c", 0.0118, 0.05, 0.13, (0, AXIS), 44)])
    hood_f = tube("dot_hood", 0.0158, 0.0122, 0.058, 0.066, (0, AXIS), 48)
    hood_r = tube("dot_hood", 0.0158, 0.0122, 0.114, 0.121, (0, AXIS), 48)
    turret_t = cylinder("turret", 0.0072, AXIS + 0.012, AXIS + 0.022, (0.0, 0.090), 28, axis="y")
    turret_r = cylinder("turret", 0.0072, 0.012, 0.022, (AXIS, 0.090), 28, axis="x")
    dial = cylinder("dial", 0.0085, -0.024, -0.012, (AXIS, 0.080), 28, axis="x")
    for i in range(8):
        boolean(dial, [box("c", -0.03, -0.0228, AXIS - 0.01, AXIS + 0.01, 0.080 - 0.0007, 0.080 + 0.0007)])
        rotate(dial, 45, "x", (0, AXIS, 0.080))
    ring = box("dot_ring", -0.017, 0.017, 0.039, 0.050, 0.080, 0.100, r=0.003)
    for ob in (body, hood_f, hood_r, turret_t, turret_r, dial, ring):
        finish(ob, 0.0004, 2)
    optic = join([mount, *claws, body, hood_f, hood_r, turret_t, turret_r, dial, ring], "optic")
    kit.set_material(optic, "alloy")
    optic.parent = root
    lens = cylinder("dot_lens", 0.0119, 0.0885, 0.0895, (0, AXIS), 44)
    finish(lens, 0.0, 1, weighted_normals=False)
    kit.set_material(lens, "lens")
    lens.parent = root
    lens["reticle"] = "dot"

    # ------------------------------------------------------------ bolt
    bolt = box("bolt", -0.009, 0.0095, -0.002, 0.014, -0.004, 0.050, r=0.002)
    finish(bolt, 0.0003, 2)
    kit.set_material(bolt, "steel_bright")
    kit.part("bolt", bolt, (0, 0, 0), root, {"part": "bolt"})

    # -------------------------------------------------------- magazine
    sections = []
    n = 14
    length = 0.188
    curve = 0.55  # radius of the magazine's curve
    for i in range(n + 1):
        t = i / n
        y = -t * length
        z = -(y * y) / (2 * curve)
        w = 0.0215 if t > 0.02 else 0.017
        sections.append(mag_section(w, 0.034, 0.004, y, z))
    body = loft("mag_body", sections)
    finish(body, 0.0, 1, weighted_normals=False)
    ribs = []
    for s in (-1, 1):
        for i in range(2, n - 1, 3):
            t = i / n
            y = -t * length
            z = -(y * y) / (2 * curve)
            ribs.append(box("rib", s * 0.0105 if s > 0 else -0.0118, 0.0118 if s > 0 else -0.0105,
                            y - 0.030, y - 0.004, z - 0.006, z + 0.006, r=0.002))
    pad_y = -length
    pad_z = -(length * length) / (2 * curve)
    pad = box("mag_pad", -0.0132, 0.0132, pad_y - 0.009, pad_y + 0.002, pad_z - 0.020, pad_z + 0.020, r=0.004)
    finish(pad, 0.0008, 2)
    for r in ribs:
        finish(r, 0.0003, 1)
    case = lathe("case", [(0, 0.012), (0.0049, 0.012), (0.0049, 0.0), (0.0046, -0.0072), (0, -0.0072)], (0, -0.006), 28)
    bullet = lathe("bullet", [(0, -0.0075), (0.0045, -0.0075), (0.0045, -0.010), (0.0036, -0.0145),
                              (0.0018, -0.0168), (0, -0.0172)], (0, -0.006), 28)
    finish(case, 0.0002, 1)
    finish(bullet, 0.0, 1, weighted_normals=False)
    for ob in (body, pad, case, bullet, *ribs):
        rotate(ob, MAG_TILT, "x")
        move(ob, *MAG_TOP)
    mag_steel = join([body, *ribs, pad], "mag")
    kit.set_material(mag_steel, "steel_dark")
    kit.set_material(case, "brass")
    kit.set_material(bullet, "copper")
    case.name = "mag_round_case"
    bullet.name = "mag_round_bullet"
    kit.part("magazine", [mag_steel, case, bullet], MAG_TOP, root,
             {"part": "magazine", "axis": [0, -math.cos(math.radians(MAG_TILT)), -math.sin(math.radians(MAG_TILT))]})

    # ---------------------------------------------------------- sockets
    empty("socket_muzzle", (0, 0, -0.293), root)
    empty("socket_eject", (0.022, 0.006, 0.022), root)
    empty("socket_sight_rear", (0, AXIS, 0.121), root)
    empty("socket_sight_front", (0, AXIS, 0.058), root)
    empty("socket_reticle", (0, AXIS, 0.089), root)
    empty("socket_grip", (0, -0.1, 0.09), root)
    import bpy
    for ob in list(bpy.context.scene.objects):
        if ob.parent is None and ob is not root:
            ob.parent = root
    return root, {
        "preview_target": (0, -0.03, 0.05),
        "preview_distance": 0.9,
        "ao": 0.02,
        "uv_tile": 0.035,
        "meta": {"class": "smg", "mag_tilt": MAG_TILT},
    }
