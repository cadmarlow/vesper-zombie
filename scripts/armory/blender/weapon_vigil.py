# VIGILE .45 — a double-stack 1911 pattern pistol (208 mm slide, 127 mm
# barrel, 18 degree grip), black nitride slide over a cerakoted frame,
# stainless barrel and bushing, G10 panels and three tritium sights.
# Bore axis along z at the origin; breech face at z = 0.
import math
import kit
from kit import (fillet, prism, box, cylinder, lathe, tube, boolean, union, intersect, join,
                 copy, move, rotate, finish, empty, set_origin)

GRIP = 18.0  # degrees from vertical
MAG_TOP = (0.0, -0.011, 0.0235)


def mag_frame(ob):
    """Built upright (top at origin, down -y, front -z), then tilted with the grip."""
    rotate(ob, -GRIP, "x")
    move(ob, *MAG_TOP)
    return ob


def build():
    root = empty("vigil", extras={"weapon": "vigil"})

    # ------------------------------------------------------------------ slide
    slide = prism("slide", fillet([
        (-0.128, 0.0125, 0.0022),
        (-0.128, -0.0160, 0.0),
        (-0.1245, -0.0185, 0.0),
        (0.079, -0.0185, 0.0008),
        (0.079, 0.0125, 0.0016),
    ]), -0.0117, 0.0117, "x", "steel")
    intersect(slide, prism("section", fillet([
        (-0.0117, -0.0185, 0.0008), (0.0117, -0.0185, 0.0008),
        (0.0117, 0.0125, 0.0085), (-0.0117, 0.0125, 0.0085)]), -0.2, 0.2, "z"))
    cuts = [
        cylinder("c", 0.0094, -0.135, -0.1238, (0, 0), 40),
        cylinder("c", 0.0044, -0.135, -0.1215, (0, -0.0138), 24),
        # Lowered, flared ejection port on the right.
        prism("c", fillet([(-0.0145, -0.0030, 0.0012), (0.0185, -0.0030, 0.0012),
                           (0.0215, 0.03), (-0.0175, 0.03)]), 0.0038, 0.03, "x"),
        # Slide stop notch, lower left.
        box("c", -0.02, -0.0104, -0.0190, -0.0142, 0.0035, 0.0105),
        # Rear face: firing pin stop recess.
        box("c", -0.0052, 0.0052, -0.0125, 0.0045, 0.0785, 0.09),
    ]
    grooves = []
    for s in (-1, 1):
        for i in range(10):
            z = 0.0445 + i * 0.0033
            g = box("c", s * 0.0106 if s > 0 else -0.03, 0.03 if s > 0 else -0.0106,
                    -0.0170, 0.0080, z - 0.00075, z + 0.00075)
            rotate(g, -10, "x", (0, 0, z))
            grooves.append(g)
        for i in range(5):
            z = -0.1135 + i * 0.0033
            g = box("c", s * 0.0106 if s > 0 else -0.03, 0.03 if s > 0 else -0.0106,
                    -0.0160, 0.0060, z - 0.00075, z + 0.00075)
            rotate(g, -10, "x", (0, 0, z))
            grooves.append(g)
    # Top serrations along the sight plane reduce glare.
    for i in range(15):
        z = -0.098 + i * 0.0098
        grooves.append(box("c", -0.0035, 0.0035, 0.0118, 0.02, z - 0.0009, z + 0.0009))
    cuts.append(join(grooves, "c"))
    boolean(slide, cuts)
    # Extractor, flush on the right, and the firing pin stop plate.
    extractor = box("extractor", 0.0112, 0.0121, 0.0022, 0.0078, 0.012, 0.074, r=0.0014)
    pin_stop = box("pin_stop", -0.0049, 0.0049, -0.0122, 0.0042, 0.0775, 0.0792, r=0.0018)
    pin = cylinder("pin", 0.0016, 0.0788, 0.0797, (0, -0.0036), 16)
    # Novak-style rear sight with a U-notch and two tritium dots.
    rear = prism("rear_sight", fillet([(0.0565, 0.0105), (0.0772, 0.0105), (0.0772, 0.0215, 0.0006),
                                       (0.0680, 0.0215, 0.0008), (0.0575, 0.0160, 0.002)]),
                 -0.0066, 0.0066, "x")
    boolean(rear, [join([box("c", -0.00165, 0.00165, 0.0168, 0.03, 0.05, 0.09),
                         cylinder("c", 0.00165, 0.05, 0.09, (0, 0.0168), 20)], "c")])
    front = prism("front_sight", fillet([(-0.1200, 0.0105), (-0.1080, 0.0105), (-0.1080, 0.0215, 0.0005),
                                         (-0.1130, 0.0215, 0.0006), (-0.1200, 0.0150, 0.0012)]),
                  -0.0017, 0.0017, "x")
    for ob, w in ((slide, 0.00055), (rear, 0.0004), (front, 0.0003)):
        finish(ob, w, 2)
    for ob in (extractor, pin_stop, pin):
        finish(ob, 0.0003, 2)
    slide_steel = join([slide, extractor, pin_stop, pin, rear, front], "slide")
    kit.set_material(slide_steel, "steel")
    dots = []
    for x in (-0.0040, 0.0040):
        dots.append(cylinder("dot", 0.00105, 0.0766, 0.0776, (x, 0.0187), 16))
    dots.append(cylinder("dot", 0.00105, -0.1086, -0.1077, (0, 0.0189), 16))
    rings = []
    for x in (-0.0040, 0.0040):
        rings.append(tube("ring", 0.0016, 0.00105, 0.0764, 0.0774, (x, 0.0187), 20))
    rings.append(tube("ring", 0.0016, 0.00105, -0.1084, -0.1079, (0, 0.0189), 20))
    for d in dots + rings:
        finish(d, 0.0002, 1)
    tritium = join(dots, "slide_tritium")
    kit.set_material(tritium, "tritium")
    ring = join(rings, "slide_rings")
    kit.set_material(ring, "bone")
    slide_group = empty("slide_action", (0, 0, 0), root, {"part": "slide", "travel": 0.052})
    for ob in (slide_steel, tritium, ring):
        ob.parent = slide_group

    # ------------------------------------------------------- barrel, bushing
    barrel = tube("barrel", 0.0074, 0.0057, -0.1283, -0.024, (0, 0), 40)
    hood = box("hood", -0.0078, 0.0078, -0.0070, 0.0086, -0.0262, 0.0, r=0.0016)
    boolean(hood, [cylinder("c", 0.0058, -0.03, 0.01, (0, 0), 24)])
    crown = tube("crown", 0.0074, 0.0061, -0.1290, -0.1283, (0, 0), 40)
    bushing = tube("bushing", 0.0093, 0.0074, -0.1305, -0.1240, (0, 0), 44)
    plug = lathe("plug", [(0, -0.1302), (0.0024, -0.1300), (0.0037, -0.1292), (0.0042, -0.1280),
                          (0.0042, -0.1220), (0, -0.1220)], (0, -0.0138), 28)
    boolean(plug, [cylinder("c", 0.0017, -0.14, -0.126, (0, -0.0138), 16)])
    for ob, w in ((barrel, 0.0003), (hood, 0.0004), (crown, 0.0002), (bushing, 0.0004), (plug, 0.0002)):
        finish(ob, w, 2)
    stainless = join([barrel, hood, crown, bushing, plug], "barrel")
    kit.set_material(stainless, "steel_bright")
    stainless.parent = root

    # ------------------------------------------------------------------ frame
    frame = prism("frame", fillet([
        (-0.121, -0.0185, 0.001),
        (0.0790, -0.0185, 0.0),
        (0.0845, -0.0192, 0.003),
        (0.0925, -0.0240, 0.003),
        (0.0895, -0.0292, 0.003),
        (0.0770, -0.0330, 0.007),
        (0.0655, -0.0415, 0.005),
        (0.0897, -0.1160, 0.004),
        (0.0377, -0.1160, 0.003),
        (0.0190, -0.0585, 0.004),
        (-0.0115, -0.0620, 0.010),
        (-0.0240, -0.0480, 0.008),
        (-0.0255, -0.0305, 0.002),
        (-0.1210, -0.0305, 0.0015),
    ]), -0.0102, 0.0102, "x")
    guard_hole = prism("c", fillet([(-0.0180, -0.0292, 0.001), (0.0115, -0.0292, 0.001),
                                    (0.0135, -0.0525, 0.004), (-0.0080, -0.0555, 0.007),
                                    (-0.0180, -0.0460, 0.006)]), -0.03, 0.03, "x")
    narrow = [box("c", s * 0.0052 if s > 0 else -0.03, 0.03 if s > 0 else -0.0052,
                  -0.07, -0.0335, -0.030, 0.0165) for s in (-1, 1)]
    well = prism("c", fillet([(-0.0185, -0.2), (0.0185, -0.2), (0.0185, 0.0), (-0.0185, 0.0)]),
                 -0.0106, 0.0106, "x")
    mag_frame(well)
    # Only open the well at the grip base (magazine seats from below).
    boolean(well, [box("c", -0.05, 0.05, -0.095, 0.1, -0.1, 0.2)])
    rail = prism("rail", [(-0.0106, -0.0303), (0.0106, -0.0303), (0.0106, -0.0318), (0.0080, -0.0335),
                          (0.0080, -0.0346), (-0.0080, -0.0346), (-0.0080, -0.0335), (-0.0106, -0.0318)],
                 -0.1170, -0.0360, "z")
    slots = [box("c", -0.03, 0.03, -0.0400, -0.0322, z - 0.0026, z + 0.0026)
             for z in (-0.1080, -0.0980, -0.0880, -0.0780, -0.0680, -0.0580, -0.0480)]
    boolean(rail, [join(slots, "c")])
    boolean(frame, [guard_hole, join(narrow, "c"), well])
    union(frame, [rail])
    finish(frame, 0.0005, 2)
    kit.set_material(frame, "alloy")
    frame.parent = root

    # Grip panels, G10, with two slotted screws each.
    panels, screws = [], []
    outline = fillet([(0.0265, -0.0305, 0.004), (0.0610, -0.0300, 0.005), (0.0825, -0.1105, 0.006),
                      (0.0435, -0.1125, 0.006), (0.0300, -0.0600, 0.004)])
    for s in (-1, 1):
        p = prism("panel", outline, 0.0100 * s, 0.0145 * s, "x")
        wells = []
        for (z, y) in ((0.0445, -0.0405), (0.0640, -0.1000)):
            wells.append(cylinder("c", 0.0033, 0.0137 * s, 0.03 * s, (y, z), 24, axis="x"))
            sc = cylinder("screw", 0.0028, 0.0131 * s, 0.0143 * s, (y, z), 24, axis="x")
            boolean(sc, [box("c", -0.05, 0.05, y - 0.0004, y + 0.0004, z - 0.004, z + 0.004)])
            finish(sc, 0.0002, 1)
            screws.append(sc)
        boolean(p, wells)
        finish(p, 0.0012, 3, angle=25)
        panels.append(p)
    grips = join(panels, "grips")
    kit.set_material(grips, "g10")
    grips.parent = root
    screw = join(screws, "grip_screws")
    kit.set_material(screw, "steel_bright")
    screw.parent = root

    # Controls: ambidextrous thumb safety, slide stop, magazine release.
    safety_outline = fillet([(0.0685, -0.0172, 0.003), (0.0455, -0.0188, 0.002), (0.0420, -0.0222, 0.002),
                             (0.0480, -0.0262, 0.002), (0.0650, -0.0272, 0.004), (0.0712, -0.0225, 0.003)])
    safety_l = prism("safety", safety_outline, -0.0127, -0.0101, "x")
    safety_r = prism("safety", safety_outline, 0.0101, 0.0120, "x")
    stop = prism("stop", fillet([(-0.0225, -0.0200, 0.003), (-0.0120, -0.0183, 0.002), (0.0050, -0.0180, 0.001),
                                 (0.0085, -0.0205, 0.002), (0.0050, -0.0245, 0.002), (-0.0120, -0.0240, 0.002),
                                 (-0.0215, -0.0268, 0.004)]), -0.0126, -0.0101, "x")
    for i in range(4):
        z = 0.0005 + i * 0.0018
        boolean(stop, [box("c", -0.02, -0.0122, -0.03, -0.01, z - 0.0004, z + 0.0004)])
    stop_pin = cylinder("stop_pin", 0.0028, 0.0100, 0.0107, (-0.0232, -0.0188), 20, axis="x")
    release = cylinder("release", 0.0042, -0.0128, -0.0100, (-0.0360, 0.0245), 28, axis="x")
    for i in range(-2, 3):
        boolean(release, [box("c", -0.02, -0.0124, -0.05, 0.05, 0.0245 + i * 0.0016 - 0.0003,
                               0.0245 + i * 0.0016 + 0.0003)])
    for ob in (safety_l, safety_r, stop, stop_pin, release):
        finish(ob, 0.0003, 2)
    controls = join([safety_l, safety_r, stop_pin, release], "controls")
    kit.set_material(controls, "steel")
    controls.parent = root
    kit.set_material(stop, "steel")
    kit.part("slide_stop", stop, (0, -0.0235, -0.0185), root, {"part": "slide_stop"})

    # Skeletonised hammer, cocked.
    hammer = prism("hammer", fillet([(0.0745, -0.0150, 0.002), (0.0815, -0.0165, 0.003),
                                     (0.0935, 0.0020, 0.004), (0.0925, 0.0085, 0.0025),
                                     (0.0870, 0.0095, 0.002), (0.0830, 0.0030, 0.003),
                                     (0.0765, -0.0060, 0.002)]), -0.0034, 0.0034, "x")
    boolean(hammer, [cylinder("c", 0.0022, -0.01, 0.01, (0.0035, 0.0885), 24, axis="x")])
    for i in range(3):
        g = box("c", -0.01, 0.01, 0.0060 + i * 0.0014, 0.0068 + i * 0.0014, 0.0915, 0.1)
        boolean(hammer, [g])
    finish(hammer, 0.0003, 2)
    kit.set_material(hammer, "steel")
    kit.part("hammer", hammer, (0, -0.0115, 0.0775), root, {"part": "hammer"})

    # Flat-faced skeleton trigger.
    trigger = prism("trigger", fillet([(0.0045, -0.0290), (0.0115, -0.0290), (0.0112, -0.0480, 0.002),
                                       (0.0068, -0.0515, 0.0025), (0.0042, -0.0482, 0.001)]),
                    -0.0036, 0.0036, "x")
    boolean(trigger, [cylinder("c", 0.0012, -0.01, 0.01, (-0.0335, 0.0088), 16, axis="x"),
                      cylinder("c", 0.0012, -0.01, 0.01, (-0.0380, 0.0088), 16, axis="x")])
    finish(trigger, 0.0003, 2)
    kit.set_material(trigger, "steel_bright")
    kit.part("trigger", trigger, (0, -0.030, 0.008), root, {"part": "trigger"})

    # ---------------------------------------------------------------- magazine
    body = box("mag_body", -0.0104, 0.0104, -0.1115, -0.004, -0.0180, 0.0180, r=0.0022)
    lips = box("mag_lips", -0.0078, 0.0078, -0.0045, 0.0, -0.0175, 0.0175, r=0.0015)
    witness = [cylinder("c", 0.0012, -0.02, -0.009, (-0.030 - i * 0.012, 0.004), 12, axis="x") for i in range(5)]
    boolean(body, [join(witness, "c")])
    finish(body, 0.0004, 2)
    finish(lips, 0.0003, 2)
    pad = prism("mag_pad", fillet([(-0.0205, -0.1115, 0.0015), (0.0215, -0.1115, 0.0015),
                                   (0.0215, -0.1225, 0.004), (-0.0205, -0.1225, 0.004)]),
                -0.0128, 0.0128, "x")
    finish(pad, 0.0008, 3)
    case = lathe("case", [(0, 0.0162), (0.0059, 0.0162), (0.0061, 0.0155), (0.0055, 0.0148), (0.0055, 0.0140),
                          (0.0059, 0.0135), (0.0059, -0.0068), (0, -0.0068)], (0, -0.0060), 32)
    bullet = lathe("bullet", [(0, -0.0070), (0.0057, -0.0070), (0.0057, -0.0095), (0.0052, -0.0125),
                              (0.0040, -0.0150), (0.0022, -0.0162), (0, -0.0165)], (0, -0.0060), 32)
    finish(case, 0.0002, 1)
    finish(bullet, 0.0, 1, weighted_normals=False)
    for ob in (body, lips, pad, case, bullet):
        mag_frame(ob)
    mag_steel = join([body, lips], "mag")
    kit.set_material(mag_steel, "steel")
    kit.set_material(pad, "polymer")
    kit.set_material(case, "brass")
    kit.set_material(bullet, "copper")
    case.name = "mag_round_case"
    bullet.name = "mag_round_bullet"
    kit.part("magazine", [mag_steel, pad, case, bullet], MAG_TOP, root,
             {"part": "magazine", "axis": [0, -math.cos(math.radians(GRIP)), math.sin(math.radians(GRIP))]})

    # ------------------------------------------------------------------ sockets
    empty("socket_muzzle", (0, 0, -0.131), root)
    empty("socket_eject", (0.012, 0.006, 0.002), root)
    empty("socket_sight_rear", (0, 0.0215, 0.0772), root)
    empty("socket_sight_front", (0, 0.0215, -0.1080), root)
    empty("socket_grip", (0, -0.070, 0.058), root)
    empty("socket_trigger", (0, -0.040, 0.004), root)
    info = {
        "preview_target": (0, -0.045, -0.02),
        "preview_distance": 0.42,
        "ao": 0.012,
        "uv_tile": 0.03,
        "meta": {"class": "pistol", "grip_angle": GRIP},
    }
    for ob in list(bpy_objects()):
        if ob.parent is None and ob is not root:
            ob.parent = root
    return root, info


def bpy_objects():
    import bpy
    return bpy.context.scene.objects
