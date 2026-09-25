# MARAUDER — a 5.56 mm carbine in the AR-15 / M4 pattern: flat-top upper
# with its rail, open dust cover and forward assist, lower with flared
# magazine well, 23 degree grip, buffer tube and adjustable stock in flat
# dark earth, slotted free-float handguard, birdcage flash hider, 30-round
# polymer magazine and a holographic sight.
# Bore along z at the origin; bolt face at z = 0.
import math
import kit
from kit import (fillet, prism, box, cylinder, lathe, tube, boolean, union, intersect, join,
                 copy, move, rotate, finish, empty, part, loft, sweep)

GRIP = 23.0
RAIL = 0.034  # top of the Picatinny rail
MAG_TOP = (0.0, -0.016, -0.026)
MAG_TILT = 4.0


def picatinny(name, z0, z1, top=RAIL, width=0.0106):
    """Rail section along z with its cross slots (10 mm pitch)."""
    r = prism(name, [(-width, top - 0.0135), (width, top - 0.0135), (width, top - 0.0052),
                     (0.0082, top - 0.0030), (0.0082, top), (-0.0082, top), (-0.0082, top - 0.0030),
                     (-width, top - 0.0052)], z0, z1, "z")
    slots = []
    z = z0 + 0.006
    while z < z1 - 0.004:
        slots.append(box("c", -0.03, 0.03, top - 0.0030, top + 0.01, z - 0.0026, z + 0.0026))
        z += 0.010
    boolean(r, [join(slots, "c")])
    return r


def build():
    root = empty("marauder", extras={"weapon": "marauder"})

    # ------------------------------------------------------------ upper
    upper = prism("upper", fillet([
        (-0.066, 0.020, 0.0), (-0.066, -0.012, 0.004), (-0.058, -0.019, 0.002),
        (0.140, -0.019, 0.0), (0.146, -0.012, 0.003), (0.146, 0.020, 0.0),
    ]), -0.0158, 0.0158, "x")
    intersect(upper, prism("sec", fillet([(-0.0158, -0.02), (0.0158, -0.02), (0.0158, 0.012, 0.0),
                                          (0.0158, 0.021, 0.006), (-0.0158, 0.021, 0.006)]), -0.3, 0.3, "z"))
    port = prism("c", fillet([(-0.040, -0.008, 0.002), (0.030, -0.008, 0.002), (0.030, 0.011, 0.002),
                              (-0.040, 0.011, 0.002)]), 0.009, 0.03, "x")
    # Relief cut along the left and right, and the forward assist boss.
    flats = [prism("c", fillet([(-0.058, -0.014, 0.002), (0.046, -0.014, 0.002), (0.046, -0.006, 0.002),
                                (-0.058, -0.006, 0.002)]), s * 0.0148 if s > 0 else -0.03,
                   0.03 if s > 0 else -0.0148, "x") for s in (-1, 1)]
    boolean(upper, [port, *flats])
    finish(upper, 0.0006, 2)
    rail = picatinny("rail_upper", -0.066, 0.146)
    finish(rail, 0.0004, 1)
    deflector = prism("deflector", fillet([(0.030, -0.004, 0.003), (0.052, -0.004, 0.003), (0.052, 0.014, 0.004),
                                           (0.036, 0.016, 0.004)]), 0.012, 0.0215, "x")
    fa_body = cylinder("fa", 0.0072, 0.070, 0.106, (0.0165, 0.006), 28)
    rotate(fa_body, -8, "y", (0.0165, 0.006, 0.088))
    fa_knob = lathe("fa_knob", [(0, 0.106), (0.0075, 0.106), (0.0088, 0.110), (0.0088, 0.121), (0, 0.121)],
                    (0.0172, 0.006), 24)
    for i in range(10):
        boolean(fa_knob, [box("c", 0.0245, 0.03, 0.0, 0.02, 0.105, 0.125)])
        rotate(fa_knob, 36, "z", (0.0172, 0.006, 0.0))
    for ob in (deflector, fa_body, fa_knob):
        finish(ob, 0.0004, 2)
    # Dust cover, hinged open below the port.
    dust = box("dust_cover", 0.0155, 0.0175, -0.030, -0.010, -0.040, 0.026, r=0.001)
    rotate(dust, 0, "z")
    finish(dust, 0.0003, 1)
    upper_all = join([upper, rail, deflector, fa_body, fa_knob, dust], "upper")
    kit.set_material(upper_all, "alloy")
    upper_all.parent = root

    # Charging handle: body under the rail, T-latch at the rear.
    ch = prism("ch", fillet([(0.126, 0.013), (0.156, 0.013), (0.160, 0.019, 0.003), (0.160, 0.030, 0.002),
                             (0.126, 0.030)]), -0.0075, 0.0075, "x")
    wings = box("ch_wings", -0.020, 0.020, 0.018, 0.028, 0.149, 0.160, r=0.003)
    latch = box("ch_latch", -0.028, -0.018, 0.019, 0.027, 0.140, 0.158, r=0.003)
    for ob in (ch, wings, latch):
        finish(ob, 0.0004, 2)
    charging = join([ch, wings, latch], "charging_handle")
    kit.set_material(charging, "alloy")
    kit.part("charging_handle", charging, (0, 0.02, 0.13), root, {"part": "charging_handle"})

    # Bolt carrier behind the port.
    bcg = box("bcg", -0.0098, 0.0098, -0.007, 0.011, -0.040, 0.10, r=0.003)
    for i in range(3):
        boolean(bcg, [box("c", 0.006, 0.02, -0.003, 0.007, -0.032 + i * 0.012, -0.026 + i * 0.012)])
    finish(bcg, 0.0004, 2)
    kit.set_material(bcg, "steel_bright")
    kit.part("bolt", bcg, (0, 0, 0), root, {"part": "bolt"})

    # ------------------------------------------------------------ lower
    lower = prism("lower", fillet([
        (-0.062, -0.019, 0.0), (0.146, -0.019, 0.0), (0.150, -0.030, 0.004), (0.110, -0.036, 0.006),
        (0.080, -0.036, 0.004), (0.066, -0.044, 0.004),
        (0.058, -0.056, 0.006), (0.0, -0.062, 0.008), (-0.006, -0.050, 0.004),
        (-0.050, -0.052, 0.003), (-0.062, -0.034, 0.004),
    ]), -0.0118, 0.0118, "x")
    guard_hole = prism("c", fillet([(0.004, -0.036, 0.002), (0.058, -0.036, 0.002), (0.052, -0.052, 0.005),
                                    (0.006, -0.054, 0.005)]), -0.03, 0.03, "x")
    boolean(lower, [guard_hole])
    finish(lower, 0.0006, 2)
    # Magazine well with its flared lip, cut through for the magazine.
    well = prism("well", fillet([(-0.060, -0.019), (0.004, -0.019), (0.006, -0.066, 0.004), (0.010, -0.074, 0.003),
                                 (-0.066, -0.074, 0.003), (-0.062, -0.066, 0.004)]), -0.0165, 0.0165, "x")
    boolean(well, [box("c", -0.0128, 0.0128, -0.2, 0.0, -0.059, 0.003)])
    grip_tex = [box("c", s * 0.0158 if s > 0 else -0.03, 0.03 if s > 0 else -0.0158, -0.060, -0.030,
                    z - 0.0015, z + 0.0015) for s in (-1, 1) for z in (-0.052, -0.046, -0.040)]
    boolean(well, [join(grip_tex, "c")])
    finish(well, 0.0006, 2)
    catch = prism("bolt_catch", fillet([(-0.008, -0.004, 0.002), (0.012, -0.004, 0.002), (0.012, 0.002, 0.002),
                                        (-0.004, 0.004, 0.002)]), -0.0175, -0.0118, "x")
    release = cylinder("mag_release", 0.0048, 0.0118, 0.0158, (-0.032, 0.001), 24, axis="x")
    selector = prism("selector", fillet([(0.066, -0.004, 0.003), (0.090, -0.009, 0.002), (0.090, -0.013, 0.002),
                                         (0.068, -0.012, 0.004)]), -0.0158, -0.0118, "x")
    sel_hub = cylinder("sel_hub", 0.0062, -0.0152, -0.0118, (-0.008, 0.072), 24, axis="x")
    pins = [cylinder("pin", 0.0028, -0.0122, 0.0122, (-0.012, z), 16, axis="x") for z in (-0.056, 0.112)]
    for ob in (catch, release, selector, sel_hub, *pins):
        finish(ob, 0.0003, 2)
    lower_all = join([lower, well, catch, release, selector, sel_hub, *pins], "lower")
    kit.set_material(lower_all, "alloy")
    lower_all.parent = root
    trigger = prism("trigger", fillet([(0.019, -0.032), (0.025, -0.032), (0.024, -0.047, 0.002),
                                       (0.018, -0.051, 0.003), (0.016, -0.044, 0.002)]), -0.0033, 0.0033, "x")
    finish(trigger, 0.0003, 2)
    kit.set_material(trigger, "steel")
    kit.part("trigger", trigger, (0, -0.032, 0.022), root, {"part": "trigger"})

    # Pistol grip (FDE), stippled, with the finger ridge.
    g = math.radians(GRIP)
    grip = prism("grip", fillet([
        (0.062, -0.030, 0.004), (0.098, -0.030, 0.004), (0.103, -0.038, 0.006),
        (0.103 + 0.090 * math.tan(g), -0.122, 0.012), (0.066 + 0.088 * math.tan(g), -0.126, 0.006),
        (0.061 + 0.052 * math.tan(g), -0.084, 0.006), (0.064 + 0.044 * math.tan(g), -0.076, 0.004),
        (0.058, -0.044, 0.005),
    ]), -0.0142, 0.0142, "x")
    finish(grip, 0.0018, 3, angle=25)
    kit.set_material(grip, "polymer_tan")
    grip.parent = root

    # ----------------------------------------------- buffer tube and stock
    buffer = cylinder("buffer", 0.0148, 0.146, 0.395, (0, -0.004), 40)
    nut = cylinder("castle", 0.0182, 0.146, 0.156, (0, -0.004), 40)
    for i in range(8):
        boolean(nut, [box("c", -0.004, 0.004, 0.012, 0.03, 0.140, 0.162)])
        rotate(nut, 45, "z", (0, -0.004, 0))
    finish(buffer, 0.0004, 1)
    finish(nut, 0.0004, 2)
    metal = join([buffer, nut], "buffer")
    kit.set_material(metal, "alloy")
    metal.parent = root
    stock = prism("stock", fillet([
        (0.262, 0.010, 0.004), (0.296, 0.024, 0.01), (0.420, 0.026, 0.008), (0.432, 0.020, 0.004),
        (0.432, -0.084, 0.006), (0.418, -0.088, 0.006), (0.380, -0.034, 0.03), (0.300, -0.022, 0.01),
        (0.262, -0.020, 0.004),
    ]), -0.0185, 0.0185, "x")
    intersect(stock, prism("sec", fillet([(-0.0185, -0.1, 0.005), (0.0185, -0.1, 0.005), (0.0185, 0.03, 0.012),
                                          (-0.0185, 0.03, 0.012)]), 0.2, 0.5, "z"))
    # Sling slot through the toe of the stock.
    sling = box("c", -0.03, 0.03, -0.074, -0.062, 0.398, 0.418, r=0.004)
    rotate(sling, 30, "x", (0, -0.068, 0.408))
    boolean(stock, [sling])
    boolean(stock, [cylinder("c", 0.0152, 0.25, 0.39, (0, -0.004), 36),
                    box("c", -0.03, 0.03, -0.10, -0.032, 0.30, 0.37, r=0.01)])
    finish(stock, 0.0015, 2)
    kit.set_material(stock, "polymer_tan")
    stock.parent = root
    pad = box("buttpad", -0.021, 0.021, -0.094, 0.030, 0.428, 0.440, r=0.006)
    finish(pad, 0.0015, 2)
    kit.set_material(pad, "rubber")
    pad.parent = root

    # ------------------------------------------------ barrel and muzzle
    barrel = tube("barrel", 0.0095, 0.0029, -0.372, -0.066, (0, 0), 36)
    hider = lathe("hider", [(0, -0.372), (0.0110, -0.372), (0.0112, -0.376), (0.0112, -0.414),
                            (0.0100, -0.4155), (0.0060, -0.4155), (0.0060, -0.380), (0, -0.380)], (0, 0), 40)
    slots = []
    for i in range(5):
        a = 90 + (i - 2) * 50
        s_ = box("c", -0.0016, 0.0016, 0.004, 0.02, -0.410, -0.386)
        rotate(s_, a - 90, "z")
        slots.append(s_)
    boolean(hider, [join(slots, "c")])
    for ob in (barrel, hider):
        finish(ob, 0.0003, 2)
    muzzle = join([barrel, hider], "barrel")
    kit.set_material(muzzle, "steel_dark")
    muzzle.parent = root

    # ------------------------------------------------------- handguard
    hg = prism("handguard", [(-0.0192, -0.020), (-0.0165, -0.0255), (-0.0105, -0.0290), (0.0105, -0.0290),
                             (0.0165, -0.0255), (0.0192, -0.020), (0.0192, 0.014), (0.0165, 0.0205),
                             (-0.0165, 0.0205), (-0.0192, 0.014)], -0.346, -0.064, "z")
    boolean(hg, [cylinder("c", 0.0150, -0.40, 0.0, (0, 0), 36)])
    mlok = []
    for zc in (-0.108, -0.155, -0.202, -0.249, -0.296):
        for s in (-1, 1):
            mlok.append(box("c", s * 0.016 if s > 0 else -0.03, 0.03 if s > 0 else -0.016, -0.0065, 0.0005,
                            zc - 0.016, zc + 0.016, r=0.003))
        mlok.append(box("c", -0.0035, 0.0035, -0.04, -0.024, zc - 0.016, zc + 0.016, r=0.003))
    boolean(hg, [join(mlok, "c")])
    finish(hg, 0.0007, 2)
    hg_rail = picatinny("rail_front", -0.346, -0.064, top=RAIL)
    finish(hg_rail, 0.0004, 1)
    stop = prism("hand_stop", fillet([(-0.330, -0.029), (-0.300, -0.029), (-0.306, -0.040, 0.003),
                                      (-0.326, -0.042, 0.004)]), -0.008, 0.008, "x")
    finish(stop, 0.0008, 2)
    front = join([hg, hg_rail, stop], "handguard")
    kit.set_material(front, "alloy")
    front.parent = root

    # --------------------------------------------- holographic sight
    WIN = 0.069  # window centre height
    # Mount, electronics housing under the window, and the hood: an open
    # tunnel with the front glass and the reticle glass at its rear.
    base = box("holo_base", -0.0150, 0.0150, RAIL, RAIL + 0.012, 0.030, 0.126, r=0.003)
    body = box("holo_body", -0.0205, 0.0205, RAIL + 0.009, 0.0505, 0.030, 0.126, r=0.005)
    hood = box("holo_hood", -0.0228, 0.0228, 0.046, 0.0955, 0.034, 0.101, r=0.006)
    boolean(hood, [box("c", -0.0170, 0.0170, 0.0515, 0.0870, 0.0, 0.2, r=0.004)])
    buttons = [cylinder("btn", 0.0040, 0.126, 0.1295, (x, 0.041), 20) for x in (-0.009, 0.009)]
    lever = box("holo_lever", 0.0150, 0.0215, RAIL - 0.004, RAIL + 0.008, 0.040, 0.075, r=0.003)
    battery = cylinder("battery", 0.0085, -0.023, 0.023, (RAIL + 0.013, 0.050), 28, axis="x")
    for ob in (base, body, hood, *buttons, lever, battery):
        finish(ob, 0.0006, 2)
    holo = join([base, body, hood, *buttons, lever, battery], "optic")
    kit.set_material(holo, "alloy")
    holo.parent = root
    glass_f = box("holo_front_glass", -0.0170, 0.0170, 0.0515, 0.0870, 0.0355, 0.0365)
    glass_r = box("holo_window", -0.0170, 0.0170, 0.0515, 0.0870, 0.0990, 0.1000)
    for ob in (glass_f, glass_r):
        finish(ob, 0.0, 1, weighted_normals=False)
    kit.set_material(glass_f, "glass")
    glass_f.parent = root
    kit.set_material(glass_r, "lens")
    glass_r.parent = root
    glass_r["reticle"] = "holo"

    # ------------------------------------------------------- magazine
    sections = []
    n = 12
    length = 0.180
    curve = 0.95
    for i in range(n + 1):
        t = i / n
        y = -t * length
        z = -(y * y) / (2 * curve)
        w = 0.0232 if t > 0.03 else 0.019
        pts = fillet([(-w / 2, -0.031), (w / 2, -0.031), (w / 2, 0.031), (-w / 2, 0.031)], 0.004, 3)
        sections.append([(x, y, z + d) for x, d in pts])
    mag_body = loft("mag_body", sections)
    finish(mag_body, 0.0, 1, weighted_normals=False)
    ribs = []
    for s in (-1, 1):
        for i in range(3):
            y = -0.055 - i * 0.034
            z = -(y * y) / (2 * curve)
            ribs.append(box("rib", s * 0.0112 if s > 0 else -0.0128, 0.0128 if s > 0 else -0.0112,
                            y - 0.014, y + 0.014, z - 0.022, z + 0.020, r=0.003))
    pad_y = -length
    pad_z = -(length * length) / (2 * curve)
    mag_pad = box("mag_pad", -0.0138, 0.0138, pad_y - 0.010, pad_y + 0.002, pad_z - 0.034, pad_z + 0.034, r=0.004)
    finish(mag_pad, 0.0008, 2)
    for r_ in ribs:
        finish(r_, 0.0004, 1)
    case = lathe("case", [(0, 0.024), (0.0048, 0.024), (0.0048, 0.021), (0.0041, 0.020), (0.0048, 0.019),
                          (0.0048, -0.012), (0.0034, -0.016), (0.0032, -0.021), (0, -0.021)], (0, -0.006), 28)
    bullet = lathe("bullet", [(0, -0.021), (0.0029, -0.021), (0.0029, -0.026), (0.0022, -0.032),
                              (0.0008, -0.037), (0, -0.0375)], (0, -0.006), 28)
    finish(case, 0.0002, 1)
    finish(bullet, 0.0, 1, weighted_normals=False)
    for ob in (mag_body, mag_pad, case, bullet, *ribs):
        rotate(ob, MAG_TILT, "x")
        move(ob, *MAG_TOP)
    mag = join([mag_body, *ribs, mag_pad], "mag")
    kit.set_material(mag, "polymer_tan")
    kit.set_material(case, "brass")
    kit.set_material(bullet, "copper")
    case.name = "mag_round_case"
    bullet.name = "mag_round_bullet"
    kit.part("magazine", [mag, case, bullet], MAG_TOP, root,
             {"part": "magazine", "axis": [0, -math.cos(math.radians(MAG_TILT)), -math.sin(math.radians(MAG_TILT))]})

    # --------------------------------------------------------- sockets
    empty("socket_muzzle", (0, 0, -0.418), root)
    empty("socket_eject", (0.017, 0.002, -0.004), root)
    empty("socket_sight_rear", (0, WIN, 0.101), root)
    empty("socket_sight_front", (0, WIN, 0.034), root)
    empty("socket_reticle", (0, WIN, 0.0995), root)
    import bpy
    for ob in list(bpy.context.scene.objects):
        if ob.parent is None and ob is not root:
            ob.parent = root
    return root, {
        "preview_target": (0, -0.02, 0.0),
        "preview_distance": 1.0,
        "ao": 0.02,
        "uv_tile": 0.035,
        "meta": {"class": "rifle", "grip_angle": GRIP},
    }
