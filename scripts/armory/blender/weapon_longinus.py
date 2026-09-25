# LONGINUS — a .338 bolt-action chassis rifle: round action with its rail,
# bolt with a tactical knob, fluted 24 inch barrel and side-port brake,
# gunmetal chassis with M-LOK forend, folded bipod, skeleton stock with a
# cheek riser, five-round box magazine, and a 34 mm 5-25x56 scope.
# Bore along z at the origin; bolt face at z = 0.
import math
import kit
from kit import (fillet, prism, box, cylinder, lathe, tube, boolean, union, intersect, join,
                 copy, move, rotate, finish, empty, part, loft, sweep)

SCOPE = 0.062      # scope axis above the bore
RAIL = 0.030
MAG_TOP = (0.0, -0.022, -0.002)
GRIP = 14.0


def build():
    root = empty("longinus", extras={"weapon": "longinus"})

    # ------------------------------------------------------------ action
    action = cylinder("action", 0.0172, -0.110, 0.118, (0, 0.004), 48)
    boolean(action, [
        prism("c", fillet([(-0.040, -0.008, 0.004), (0.028, -0.008, 0.004), (0.028, 0.018, 0.004),
                           (-0.040, 0.018, 0.004)]), 0.004, 0.03, "x"),
        # Bolt handle slot at the rear right.
        box("c", 0.006, 0.03, -0.004, 0.012, 0.060, 0.118),
        cylinder("c", 0.0102, 0.0, 0.2, (0, 0.004), 32),
    ])
    finish(action, 0.0006, 2)
    rail = prism("rail", [(-0.0106, RAIL - 0.0135), (0.0106, RAIL - 0.0135), (0.0106, RAIL - 0.0052),
                          (0.0082, RAIL - 0.003), (0.0082, RAIL), (-0.0082, RAIL), (-0.0082, RAIL - 0.003),
                          (-0.0106, RAIL - 0.0052)], -0.108, 0.116, "z")
    slots = [box("c", -0.03, 0.03, RAIL - 0.003, RAIL + 0.01, z - 0.0026, z + 0.0026)
             for z in [-0.102 + i * 0.010 for i in range(22)]]
    boolean(rail, [join(slots, "c")])
    finish(rail, 0.0004, 1)
    recoil_lug = box("lug", -0.018, 0.018, -0.03, -0.012, -0.106, -0.094, r=0.002)
    finish(recoil_lug, 0.0004, 1)
    steel = join([action, rail, recoil_lug], "action")
    kit.set_material(steel, "steel_dark")
    steel.parent = root

    # Bolt: body, handle and knob; it lifts about its axis, then slides.
    body = cylinder("bolt_body", 0.0098, -0.002, 0.135, (0, 0.004), 32)
    shroud = lathe("shroud", [(0, 0.135), (0.0105, 0.135), (0.0118, 0.140), (0.0118, 0.158), (0.009, 0.163),
                              (0, 0.163)], (0, 0.004), 32)
    flutes = [box("c", -0.002, 0.002, 0.008, 0.02, 0.02, 0.11)]
    for i in range(1, 4):
        f = box("c", -0.002, 0.002, 0.008, 0.02, 0.02, 0.11)
        rotate(f, i * 90, "z", (0, 0.004, 0))
        flutes.append(f)
    boolean(body, [join(flutes, "c")])
    stem = sweep("bolt_stem", [(0.008, 0.004, 0.100), (0.030, 0.000, 0.106), (0.048, -0.012, 0.114)], 0.0042, 12)
    knob = lathe("bolt_knob", [(0, 0.0), (0.0075, 0.0), (0.0118, 0.006), (0.0125, 0.016), (0.0105, 0.024),
                               (0, 0.026)], (0.0, 0.0), 28, axis="x")
    move(knob, 0.043, -0.014, 0.116)
    for ob in (body, shroud, stem, knob):
        finish(ob, 0.0004, 2)
    bolt = join([body, shroud, stem, knob], "bolt")
    kit.set_material(bolt, "steel_bright")
    kit.part("bolt_handle", bolt, (0, 0.004, 0.0), root, {"part": "bolt_handle"})

    # ------------------------------------------------------- barrel, brake
    barrel = lathe("barrel", [(0, -0.600), (0.0118, -0.600), (0.0118, -0.300), (0.0138, -0.200),
                              (0.0152, -0.060), (0, -0.060)], (0, 0), 44)
    fl = []
    for i in range(6):
        f = box("c", -0.0018, 0.0018, 0.0104, 0.02, -0.46, -0.24, r=0.0015)
        rotate(f, i * 60, "z")
        fl.append(f)
    boolean(barrel, [join(fl, "c"), cylinder("c", 0.0045, -0.61, -0.05, (0, 0), 20)])
    brake = lathe("brake", [(0, -0.690), (0.0148, -0.690), (0.0172, -0.686), (0.0172, -0.604), (0.0150, -0.600),
                            (0, -0.600)], (0, 0), 44)
    ports = []
    for i in range(3):
        z = -0.622 - i * 0.022
        ports.append(box("c", -0.04, 0.04, -0.0072, 0.0072, z - 0.0068, z + 0.0068, r=0.002))
    ports.append(cylinder("c", 0.0058, -0.7, -0.59, (0, 0), 24))
    boolean(brake, ports)
    for ob in (barrel, brake):
        finish(ob, 0.0004, 2)
    muzzle = join([barrel, brake], "barrel")
    kit.set_material(muzzle, "steel_dark")
    muzzle.parent = root

    # ------------------------------------------------------------- chassis
    chassis = prism("chassis", fillet([
        (-0.090, -0.012, 0.004), (0.124, -0.012, 0.004), (0.150, -0.030, 0.006), (0.150, -0.048, 0.006),
        (0.100, -0.050, 0.006), (0.060, -0.052, 0.006), (0.054, -0.086, 0.012), (0.004, -0.090, 0.012),
        (-0.008, -0.052, 0.004), (-0.090, -0.050, 0.006),
    ]), -0.0215, 0.0215, "x")
    boolean(chassis, [
        prism("c", fillet([(0.012, -0.056, 0.003), (0.048, -0.056, 0.003), (0.044, -0.080, 0.008),
                           (0.012, -0.080, 0.008)]), -0.03, 0.03, "x"),
        box("c", -0.016, 0.016, -0.2, -0.010, -0.050, 0.004),
        cylinder("c", 0.0176, -0.2, 0.2, (0, 0.004), 40),
    ])
    finish(chassis, 0.0008, 2)
    forend = prism("forend", [(-0.024, -0.036), (-0.020, -0.042), (0.020, -0.042), (0.024, -0.036), (0.024, 0.018),
                              (0.018, 0.026), (-0.018, 0.026), (-0.024, 0.018)], -0.440, -0.088, "z")
    boolean(forend, [cylinder("c", 0.0175, -0.5, 0.0, (0, 0), 40)])
    mlok = []
    for zc in (-0.140, -0.200, -0.260, -0.320, -0.380):
        for s in (-1, 1):
            mlok.append(box("c", s * 0.020 if s > 0 else -0.03, 0.03 if s > 0 else -0.020, -0.024, -0.012,
                            zc - 0.018, zc + 0.018, r=0.003))
            mlok.append(box("c", s * 0.020 if s > 0 else -0.03, 0.03 if s > 0 else -0.020, 0.002, 0.012,
                            zc - 0.018, zc + 0.018, r=0.003))
    boolean(forend, [join(mlok, "c")])
    finish(forend, 0.0008, 2)
    # Pistol grip and skeleton stock with cheek riser and toe.
    g = math.radians(GRIP)
    grip = prism("grip", fillet([
        (0.060, -0.046, 0.004), (0.098, -0.046, 0.004), (0.100 + 0.100 * math.tan(g), -0.146, 0.01),
        (0.064 + 0.100 * math.tan(g), -0.150, 0.008), (0.058 + 0.03 * math.tan(g), -0.080, 0.006),
    ]), -0.0145, 0.0145, "x")
    finish(grip, 0.0016, 3, angle=25)
    stock = prism("stock", fillet([
        (0.140, 0.004, 0.004), (0.440, 0.004, 0.008), (0.452, -0.004, 0.004), (0.452, -0.122, 0.006),
        (0.424, -0.128, 0.01), (0.300, -0.084, 0.012), (0.170, -0.052, 0.01), (0.140, -0.048, 0.004),
    ]), -0.0135, 0.0135, "x")
    holes = [
        prism("c", fillet([(0.180, -0.012, 0.01), (0.330, -0.012, 0.01), (0.330, -0.066, 0.018),
                           (0.240, -0.052, 0.012)]), -0.03, 0.03, "x"),
        prism("c", fillet([(0.356, -0.012, 0.008), (0.426, -0.012, 0.008), (0.426, -0.104, 0.01),
                           (0.370, -0.082, 0.012)]), -0.03, 0.03, "x"),
    ]
    boolean(stock, holes)
    finish(stock, 0.0012, 2)
    cheek = prism("cheek", fillet([(0.250, 0.004), (0.410, 0.004), (0.410, 0.036, 0.008), (0.270, 0.036, 0.012)]),
                  -0.0165, 0.0165, "x")
    finish(cheek, 0.0025, 3)
    frame = join([chassis, forend, stock], "chassis")
    kit.set_material(frame, "alloy_grey")
    frame.parent = root
    kit.set_material(grip, "polymer_grip")
    grip.parent = root
    kit.set_material(cheek, "polymer")
    cheek.parent = root
    pad = box("buttpad", -0.0165, 0.0165, -0.130, 0.006, 0.450, 0.470, r=0.006)
    finish(pad, 0.0015, 2)
    kit.set_material(pad, "rubber")
    pad.parent = root
    trigger = prism("trigger", fillet([(0.028, -0.052), (0.034, -0.052), (0.034, -0.070, 0.002),
                                       (0.028, -0.075, 0.003), (0.025, -0.066, 0.002)]), -0.0032, 0.0032, "x")
    finish(trigger, 0.0003, 2)
    kit.set_material(trigger, "steel")
    kit.part("trigger", trigger, (0, -0.052, 0.031), root, {"part": "trigger"})
    # Folded bipod under the forend front.
    legs = [cylinder("leg", 0.0048, -0.420, -0.250, (s * 0.011, -0.050), 16) for s in (-1, 1)]
    feet = [cylinder("foot", 0.0068, -0.262, -0.246, (s * 0.011, -0.050), 16) for s in (-1, 1)]
    head = box("bipod_head", -0.020, 0.020, -0.056, -0.040, -0.432, -0.410, r=0.004)
    for ob in (*legs, *feet, head):
        finish(ob, 0.0004, 1)
    bipod = join([*legs, *feet, head], "bipod")
    kit.set_material(bipod, "alloy")
    bipod.parent = root

    # --------------------------------------------------------------- scope
    AXIS = SCOPE
    tube_ = lathe("scope", [
        (0, -0.215), (0.030, -0.215), (0.0338, -0.211), (0.0338, -0.160), (0.020, -0.120), (0.0170, -0.110),
        (0.0170, 0.130), (0.0200, 0.145), (0.0225, 0.150), (0.0225, 0.205), (0.0205, 0.212), (0, 0.212),
    ], (0, AXIS), 44)
    boolean(tube_, [cylinder("c", 0.0285, -0.25, -0.200, (0, AXIS), 44), cylinder("c", 0.0175, 0.200, 0.3, (0, AXIS), 36)])
    turret_e = lathe("turret_e", [(0, AXIS + 0.036), (0.0145, AXIS + 0.036), (0.0152, AXIS + 0.032),
                                  (0.0152, AXIS + 0.020), (0.0110, AXIS + 0.018), (0.0110, AXIS + 0.010),
                                  (0, AXIS + 0.010)], (0, 0.005), 32, axis="y")
    turret_w = lathe("turret_w", [(0, 0.036), (0.0135, 0.036), (0.0142, 0.032), (0.0142, 0.022), (0.0100, 0.020),
                                  (0.0100, 0.010), (0, 0.010)], (AXIS, 0.005), 32, axis="x")
    turret_p = lathe("turret_p", [(0, -0.034), (0.0140, -0.034), (0.0140, -0.012), (0, -0.012)], (AXIS, 0.020), 40,
                     axis="x")
    for t_, n in ((turret_e, "y"), (turret_w, "x")):
        for i in range(12):
            if n == "y":
                c = box("c", 0.0146, 0.02, AXIS + 0.021, AXIS + 0.031, -0.0011 + 0.005, 0.0011 + 0.005)
                boolean(t_, [c])
                rotate(t_, 30, "y", (0, 0, 0.005))
            else:
                c = box("c", 0.02, 0.034, AXIS + 0.0138, AXIS + 0.02, 0.005 - 0.0011, 0.005 + 0.0011)
                boolean(t_, [c])
                rotate(t_, 30, "x", (0, AXIS, 0.005))
    saddle = box("saddle", -0.0215, 0.0215, AXIS - 0.022, AXIS + 0.016, -0.030, 0.042, r=0.005)
    rings = []
    for z in (-0.080, 0.090):
        r_ = tube("ring", 0.0215, 0.0170, z - 0.011, z + 0.011, (0, AXIS), 48)
        base = box("ring_base", -0.012, 0.012, RAIL - 0.003, AXIS - 0.017, z - 0.011, z + 0.011, r=0.002)
        cap = box("ring_cap", -0.023, 0.023, AXIS - 0.004, AXIS + 0.004, z - 0.011, z + 0.011, r=0.002)
        rings.extend([r_, base, cap])
    for ob in (tube_, turret_e, turret_w, turret_p, saddle, *rings):
        finish(ob, 0.0005, 2)
    optic = join([tube_, turret_e, turret_w, turret_p, saddle, *rings], "scope")
    kit.set_material(optic, "alloy")
    optic.parent = root
    front_lens = cylinder("scope_objective", 0.0290, -0.203, -0.200, (0, AXIS), 48)
    rear_lens = cylinder("scope_ocular", 0.0180, 0.196, 0.199, (0, AXIS), 40)
    for ob in (front_lens, rear_lens):
        finish(ob, 0.0, 1, weighted_normals=False)
    kit.set_material(front_lens, "glass")
    front_lens.parent = root
    kit.set_material(rear_lens, "lens")
    rear_lens.parent = root
    rear_lens["scope"] = 1

    # ------------------------------------------------------------ magazine
    mag = box("mag", -0.0142, 0.0142, -0.108, 0.0, -0.046, 0.046, r=0.005)
    ribs = [box("rib", s * 0.013 if s > 0 else -0.0152, 0.0152 if s > 0 else -0.013, -0.092, -0.020, -0.034, 0.034,
                r=0.003) for s in (-1, 1)]
    mpad = box("mag_pad", -0.0155, 0.0155, -0.116, -0.104, -0.050, 0.050, r=0.004)
    case = lathe("case", [(0, 0.038), (0.0074, 0.038), (0.0074, 0.034), (0.0068, 0.033), (0.0074, 0.031),
                          (0.0074, -0.014), (0.0052, -0.020), (0.0048, -0.030), (0, -0.030)], (0, -0.008), 28)
    bullet = lathe("bullet", [(0, -0.030), (0.0043, -0.030), (0.0043, -0.038), (0.0032, -0.048), (0.0012, -0.056),
                              (0, -0.057)], (0, -0.008), 28)
    for ob in (mag, *ribs, mpad):
        finish(ob, 0.0005, 2)
    finish(case, 0.0002, 1)
    finish(bullet, 0.0, 1, weighted_normals=False)
    for ob in (mag, *ribs, mpad, case, bullet):
        move(ob, *MAG_TOP)
    mag_all = join([mag, *ribs, mpad], "mag")
    kit.set_material(mag_all, "alloy")
    kit.set_material(case, "brass")
    kit.set_material(bullet, "copper")
    case.name = "mag_round_case"
    bullet.name = "mag_round_bullet"
    kit.part("magazine", [mag_all, case, bullet], MAG_TOP, root, {"part": "magazine", "axis": [0, -1, 0]})

    # ------------------------------------------------------------- sockets
    empty("socket_muzzle", (0, 0, -0.694), root)
    empty("socket_eject", (0.018, 0.008, -0.006), root)
    empty("socket_sight_rear", (0, AXIS, 0.212), root)
    empty("socket_sight_front", (0, AXIS, -0.215), root)
    import bpy
    for ob in list(bpy.context.scene.objects):
        if ob.parent is None and ob is not root:
            ob.parent = root
    return root, {
        "preview_target": (0, -0.02, -0.1),
        "preview_distance": 1.4,
        "ao": 0.02,
        "uv_tile": 0.045,
        "meta": {"class": "sniper", "scope_axis": SCOPE},
    }
