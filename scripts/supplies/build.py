"""Original Vesper pickups and perk dispensers. Coordinates are game metres.
Run through build.mjs; reuse the armory's bevel, atlas and Cycles wear baker.
"""
import bpy, sys, os, math, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "../armory/blender"))
import kit as k

asset, output = sys.argv[sys.argv.index("--") + 1:][:2]
k.reset()
root = k.empty(asset, extras={"supply": asset})
is_machine = asset.startswith("machine-")
kind = asset.split("-")[1]
labels = []

def block(name, pos, size, material="paint", radius=.015):
    x,y,z = pos; w,h,d = size
    ob = k.box(name, x-w/2,x+w/2,y-h/2,y+h/2,z-d/2,z+d/2,material,root,r=radius)
    k.bevel(ob, min(radius*.45, min(size)*.18), 2)
    k.weighted(ob)
    return ob

def cyl(name, pos, radius, length, material="metal", axis="z", sides=32):
    x,y,z=pos
    center = (x,y) if axis=="z" else (x,z) if axis=="y" else (y,z)
    t = z if axis=="z" else y if axis=="y" else x
    ob=k.cylinder(name,radius,t-length/2,t+length/2,center,sides,axis,material,root)
    k.bevel(ob,min(.006,length*.12),2); k.smooth(ob); k.weighted(ob)
    return ob

def ring(name,pos,outer,inner,length=.025,material="metal",axis="z",sides=48):
    x,y,z=pos
    center=(x,y) if axis=="z" else (x,z)
    t=z if axis=="z" else y
    ob=k.tube(name,outer,inner,t-length/2,t+length/2,center,sides,axis,material,root)
    k.bevel(ob,.003,2); k.smooth(ob); k.weighted(ob)
    return ob

def orb(name,pos,size,material="paint",segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=16, location=k.B(*pos))
    ob=bpy.context.object; ob.name=name; ob.parent=root
    ob.scale=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    k.set_material(ob,material); k.smooth(ob)
    return ob

def wire(name,points,radius=.018,material="dark"):
    return k.sweep(name,points,radius,segments=8,material=material,parent=root)

def symbol(shape,pos,size,material="light"):
    x,y,z=pos
    paths={
        "cross":[(-.18,-.5),(.18,-.5),(.18,-.18),(.5,-.18),(.5,.18),(.18,.18),(.18,.5),(-.18,.5),(-.18,.18),(-.5,.18),(-.5,-.18),(-.18,-.18)],
        "bolt":[(-.05,.5),(.36,.5),(.08,.08),(.37,.08),(-.33,-.5),(-.08,-.06),(-.35,-.06)],
    }
    outline=[(x+a*size,y+b*size) for a,b in paths[shape]]
    ob=k.prism(shape,outline,z-.012,z+.012,"z",material,root)
    k.bevel(ob,.004,2); k.weighted(ob)
    return ob

def bullet(name,x,y,z,size=.24):
    r=size*.12
    return k.lathe(name,[(0,y),(r,y),(r,y+size*.65),(r*.82,y+size*.69),(r*.82,y+size*.83),(r*.4,y+size*.97),(0,y+size)],(x,z),16,"metal",root,"y")

def decal(name,pos,size,tile):
    x,y,z=pos; w,h=size
    me=bpy.data.meshes.new(name)
    me.from_pydata([k.B(x-w/2,y-h/2,z),k.B(x+w/2,y-h/2,z),k.B(x+w/2,y+h/2,z),k.B(x-w/2,y+h/2,z)],[],[(0,1,2,3)])
    me.update(); uv=me.uv_layers.new(name="atlas")
    # Four horizontal tiles, top to bottom in a CanvasTexture.
    low=1-(tile+1)/4; high=1-tile/4
    for loop, value in zip(uv.data,[(0,low),(1,low),(1,high),(0,high)]): loop.uv=value
    ob=bpy.data.objects.new(name,me); bpy.context.scene.collection.objects.link(ob); ob.parent=root
    k.set_material(ob,"print"); labels.append(ob)
    return ob

def bolts(y,z,width=.55):
    for x in [-width,width]:
        cyl("captive-screw",(x,y,z),.022,.016,"metal",sides=12)
        block("screw-slot",(x,y,z+.011),(.022,.004,.003),"dark",.001)

def feet(width=.62):
    block("cast-plinth",(0,.11,0),(width*2+.12,.22,1.08),"dark",.04)
    block("plinth-trim",(0,.22,0),(width*2+.06,.045,1.04),"metal",.01)
    for x in [-width+.1,width-.1]:
        for z in [-.4,.4]: block("rubber-foot",(x,.035,z),(.16,.07,.17),"dark",.012)

def vent(x,y,z,width=.34,count=6):
    block("vent-well",(x,y,z),(width+.06,count*.045+.04,.025),"dark",.008)
    for i in range(count): block("pressed-louvre",(x,y+(i-(count-1)/2)*.045,z+.026),(width,.018,.036),"metal",.004)

def gauge(x,y,z,r=.12):
    cyl("gauge-cup",(x,y,z),r,.07,"metal")
    cyl("ceramic-dial",(x,y,z+.04),r*.85,.012,"ivory")
    for i in range(11):
        a=math.radians(25+i*13)
        tick=block("dial-tick",(x+math.cos(a)*r*.65,y+math.sin(a)*r*.65,z+.052),(.012,.025,.004),"dark",.001)
        k.rotate(tick,-math.degrees(a)+90,axis="z",pivot=(x+math.cos(a)*r*.65,y+math.sin(a)*r*.65,z+.052))
    needle=block("gauge-needle",(x-r*.14,y+r*.16,z+.058),(.011,r*.65,.006),"paint",.001)
    cyl("gauge-pivot",(x,y,z+.063),.018,.015,"metal",sides=16)
    return needle

def bottle(x,y,z,h=.34):
    k.lathe("dose-flacon",[(0,y),(.057,y),(.068,y+.025),(.068,y+h*.68),(.03,y+h*.8),(.027,y+h),(0,y+h)],(x,z),20,"ivory",root,"y")
    cyl("flacon-cap",(x,y+h,z),.033,.035,"metal","y",16)
    block("flacon-label",(x,y+h*.4,z+.065),(.073,.105,.005),"paint",.002)

def dispense(y=.58,z=.49):
    block("recessed-delivery-bay",(0,y,z),(1.02,.26,.08),"dark",.025)
    block("delivery-sill",(0,y-.12,z+.08),(1.08,.045,.19),"metal",.008)
    for x in [-.46,.46]: block("bay-jamb",(x,y,z+.04),(.04,.26,.045),"metal",.005)
    block("coin-box",(.4,y+.38,z+.02),(.19,.3,.065),"metal",.02)
    block("coin-slot",(.4,y+.42,z+.06),(.015,.12,.012),"dark",.002)
    cyl("return-button",(.4,y+.29,z+.07),.038,.045,"dark",sides=20)

def crest(shape,y=2.2,z=.5,r=.29):
    cyl("cast-badge",(0,y,z),r+.06,.10,"metal")
    cyl("enamel-badge",(0,y,z+.057),r,.024,"dark")
    ring("illuminated-bezel",(0,y,z+.073),r*.94,r*.87,.012,"light")
    if shape in ("cross","bolt"): symbol(shape,(0,y,z+.09),r*1.22)
    elif shape=="bullet":
        for x in [-.12,0,.12]: bullet("cartridge-crest",x,y-.16,z+.1,.31)
    else:
        ring("optic-reticle",(0,y,z+.1),r*.61,r*.55,.015,"light")
        for s in [-1,1]:
            block("reticle-horizontal",(s*r*.71,y,z+.11),(r*.28,.025,.02),"light",.003)
            block("reticle-vertical",(0,y+s*r*.71,z+.11),(.025,r*.28,.02),"light",.003)
        cyl("optic-pupil",(0,y,z+.11),r*.18,.025,"light")

def machine(kind):
    feet()
    if kind=="health":
        block("rounded-red-cabinet",(0,1.13,0),(1.33,1.95,.91),"paint",.14)
        cyl("vaulted-crown",(0,2.04,0),.66,.89,"paint",sides=48)
        block("cream-door",(0,1.06,.468),(1.15,1.6,.05),"ivory",.08)
        block("window-recess",(-.13,1.15,.508),(.68,.55,.035),"dark",.04)
        for x in [-.33,-.12,.09]: bottle(x,.93,.5)
        block("window-pane",(-.13,1.17,.615),(.62,.45,.008),"glass",.015)
        crest("cross",2.19,.48,.30)
        gauge(.42,1.28,.55,.115)
        dispense(.57,.52)
        decal("enameled-name",(0,1.73,.51),(1.07,.24),0)
        decal("dose-notice",(-.17,.82,.54),(.6,.14),1)
        vent(-.53,.44,.52,.18,4)
    elif kind=="speed":
        block("streamlined-pump",(0,1.12,-.09),(1.08,1.86,.79),"paint",.12)
        for x in [-.54,.54]:
            block("chrome-spine",(x,1.4,.1),(.08,2.1,.72),"metal",.035)
            block("crown-fin",(x,2.4,-.03),(.07,.38,.46),"paint",.025)
        cyl("round-pump-head",(0,2.17,.03),.53,.75,"paint",sides=48)
        crest("bolt",2.17,.44,.31)
        block("reaction-well",(-.06,1.14,.33),(.66,.62,.04),"dark",.04)
        for x in [-.25,-.06,.13]:
            bottle(x,.94,.35,.37)
            ring("flacon-coil",(x,1.13,.35),.077,.068,.035,"light","y",20)
        block("curved-display-glass",(-.06,1.17,.47),(.61,.55,.012),"glass",.03)
        wire("reinforced-hose",[(.43,1.8,.28),(.68,1.65,.3),(.69,.71,.34),(.53,.48,.39),(.4,.65,.44)],.035)
        dispense(.56,.37)
        decal("enameled-name",(0,1.7,.438),(.99,.23),0)
        decal("reaction-notice",(-.08,.81,.448),(.63,.14),1)
        gauge(-.38,.74,.45,.10)
    elif kind=="rate":
        block("armored-cabinet",(0,1.17,-.05),(1.39,1.9,.95),"paint",.055)
        for x in [-.68,.68]: block("riveted-edge",(x,1.17,.37),(.07,1.85,.08),"metal",.01)
        block("top-receiver",(0,2.22,-.08),(1.15,.25,.84),"dark",.04)
        for x in [-.3,.3]:
            cyl("feed-drum",(x,2.32,.02),.205,.50,"metal","z",32)
            ring("drum-lip",(x,2.32,.29),.21,.178,.035,"paint")
            cyl("drum-hub",(x,2.32,.31),.065,.045,"dark")
        crest("bullet",1.95,.46,.25)
        block("feed-window",(0,1.19,.46),(1.05,.55,.05),"dark",.025)
        for i in range(7): bullet("belt-cartridge",-.37+i*.122,.99,.48,.31)
        for x in [-.48,.48]: gauge(x,.8,.5,.09)
        dispense(.53,.47)
        decal("enameled-name",(0,1.59,.49),(1.06,.23),0)
        decal("cadence-notice",(0,.85,.51),(.59,.13),1)
        for y in [.3,1.43,2.0]: bolts(y,.49,.625)
    else:
        block("optical-console",(0,1.14,-.07),(1.22,1.88,.91),"paint",.09)
        for x in [-.58,.58]: block("fluted-chrome-column",(x,1.45,.2),(.08,2.0,.6),"metal",.025)
        block("lens-shoulders",(0,2.05,-.03),(1.27,.37,.81),"dark",.07)
        cyl("lens-housing",(0,2.13,.30),.43,.42,"metal",sides=48)
        orb("convex-optical-crystal",(0,2.13,.5),(.35,.35,.095),"lens",48)
        for r in [.38,.31,.23]: ring("concentric-optic",(0,2.13,.55),r,r-.018,.018,"metal")
        ring("illuminated-reticle",(0,2.13,.602),.19,.181,.008,"light")
        for side in [-1,1]:
            block("horizontal-reticle",(side*.225,2.13,.602),(.09,.014,.009),"light",.002)
            block("vertical-reticle",(0,2.13+side*.225,.602),(.014,.09,.009),"light",.002)
        for x in [-.37,.37]:
            cyl("diopter-adjuster",(x,2.14,.25),.07,.15,"dark","x",20)
        block("ampoule-well",(0,1.1,.42),(.76,.51,.045),"dark",.04)
        for x in [-.25,0,.25]: bottle(x,.9,.45,.3)
        block("ampoule-glass",(0,1.13,.56),(.69,.46,.008),"glass",.02)
        dispense(.51,.43)
        decal("enameled-name",(0,1.57,.442),(1.08,.25),0)
        decal("optics-notice",(0,.78,.48),(.65,.12),1)
        vent(-.42,.38,.47,.18,3)
    # Common service details make these objects work from the sides and back.
    for x in [-.56,.56]:
        block("side-inset",(x,1.25,-.18),(.018,1.16,.35),"dark",.006)
        for y in [.65,1.8]: cyl("service-fastener",(x,y,.02),.02,.03,"metal","x",12)
    vent(0,.63,-.54,.66,8)
    block("service-door",(0,1.43,-.51),(.8,.69,.04),"dark",.018)
    bolts(1.71,-.54,.35)
    decal("price-plaque",(0,.31,.57),(.65,.14),2)
    decal("service-number",(0,1.29,-.54),(.45,.12),3)

def pickup(kind):
    if kind=="health":
        block("medical-case",(0,0,0),(.64,.38,.30),"paint",.055)
        block("case-seam",(0,.04,0),(.65,.018,.31),"dark",.004)
        block("ivory-emblem",(0,-.01,.158),(.29,.24,.018),"metal",.025)
        symbol("cross",(0,-.01,.175),.20,"light")
        for x in [-.23,.23]:
            block("brass-latch",(x,.045,.165),(.055,.11,.025),"metal",.009)
            for y in [-.1,.13]: cyl("case-rivet",(x,y,.162),.013,.015,"metal",sides=12)
        wire("carry-handle",[(-.13,.2,0),(-.13,.29,0),(.13,.29,0),(.13,.2,0)],.024,"dark")
        for x in [-.31,.31]: block("corner-armoring",(x,-.13,0),(.045,.09,.31),"metal",.012)
    elif kind=="ammo":
        block("ammunition-can",(0,-.03,0),(.66,.36,.33),"paint",.035)
        block("reinforced-lid",(0,.165,0),(.70,.06,.37),"metal",.012)
        for x in [-.24,.24]:
            block("pressed-can-rib",(x,-.03,.176),(.032,.28,.018),"metal",.005)
            block("lid-clasp",(x,.13,.20),(.065,.13,.028),"dark",.008)
        for i in range(5): bullet("exposed-cartridge",-.20+i*.1,.20,.015,.25)
        block("stamp-plate",(0,-.02,.176),(.23,.16,.015),"dark",.008)
        for x in [-.064,0,.064]: bullet("ammo-insignia",x,-.082,.194,.132)
        wire("can-handle",[(-.12,.19,-.1),(-.12,.29,-.1),(.12,.29,-.1),(.12,.19,-.1)],.016,"dark")
        block("anomaly-slit",(0,-.142,.186),(.16,.014,.012),"light",.003)
    elif kind=="double":
        for i,x in enumerate([-.135,.135]):
            z=i*.09-.04; y=(i-.5)*.09
            cyl("essence-medallion",(x,y,z),.245,.06,"paint",sides=48)
            ring("milled-medallion-rim",(x,y,z+.04),.248,.211,.018,"metal")
            ring("inner-filigree",(x,y,z+.052),.185,.178,.012,"light")
            for j in range(16):
                a=j*math.pi/8
                cyl("rim-stud",(x+math.cos(a)*.225,y+math.sin(a)*.225,z+.055),.009,.009,"metal",sides=8)
            curve=bpy.data.curves.new("raised-numeral","FONT"); curve.body="×" if i==0 else "2"; curve.size=.35
            curve.align_x="CENTER"; curve.align_y="CENTER"; curve.extrude=.008; curve.bevel_depth=.002; curve.resolution_u=3
            ob=bpy.data.objects.new("raised-numeral",curve); bpy.context.scene.collection.objects.link(ob)
            ob.parent=root; ob.location=k.B(x,y,z+.055); ob.rotation_euler=(math.pi/2,0,0)
            k.set_material(ob,"metal"); bpy.ops.object.select_all(action="DESELECT")
            bpy.context.view_layer.objects.active=ob; ob.select_set(True)
            bpy.ops.object.convert(target="MESH"); ob.select_set(False)
    else:
        skull=orb("cranial-vault",(0,.075,0),(.205,.245,.185),"paint",40)
        orbit=[(.028,.105),(.068,.142),(.133,.124),(.151,.073),(.126,.018),(.064,.018),(.031,.052)]
        cutters=[k.prism("orbital-cutter",k.fillet([(s*x,y) for x,y in orbit],.009,3),.07,.28,"z","dark",root) for s in [-1,1]]
        k.boolean(skull,cutters)
        maxilla=block("maxilla",(0,-.115,.09),(.19,.085,.13),"paint",.025)
        nose=k.prism("nasal-cutter",[(0,.043),(-.034,-.037),(-.026,-.112),(.026,-.112),(.034,-.037)],.075,.28,"z","dark",root)
        second=k.copy(nose,"maxillary-cutter")
        k.boolean(skull,[nose]); k.bevel(skull,.003,2); k.weighted(skull)
        k.boolean(maxilla,[second])
        for x in [-.132,.132]: orb("zygomatic-arch",(x,-.055,.044),(.057,.038,.057),"paint",24)
        for i in range(9):
            x=(i-4)*.023
            block("ivory-tooth",(x,-.17,.15-abs(x)*.23),(.021,.05,.043),"ivory",.007)
        wire("mandible",[(-.151,-.06,.015),(-.14,-.19,.06),(-.09,-.23,.13),(0,-.24,.145),(.09,-.23,.13),(.14,-.19,.06),(.151,-.06,.015)],.028,"paint")
        block("mental-bone",(0,-.236,.126),(.17,.045,.065),"paint",.015)
        for x in [-.085,.085]:
            orb("orbital-depth",(x,.078,.055),(.057,.059,.032),"dark",24)
        for side in [-1,1]:
            wire("supraorbital-ridge",[(side*.16,.125,.12),(side*.12,.153,.161),(side*.067,.161,.174),(side*.025,.125,.179)],.014,"paint")
        wire("cranial-suture",[(-.009,.25,.125),(.003,.226,.153),(-.005,.20,.172),(.006,.18,.178)],.0017,"dark")
        ring("reliquary-halo",(0,.04,-.13),.315,.297,.025,"metal")
        ring("anomaly-seal",(0,.04,-.147),.293,.287,.009,"light")
        for x in [-.19,.19]: wire("reliquary-clamp",[(x,-.19,0),(x*1.25,-.07,-.12),(x,.22,-.12)],.013,"metal")

if is_machine: machine(kind)
else: pickup(kind)

# Apply the chamfers before UV packing, then merge static pieces by finish.
for ob in list(bpy.context.scene.objects):
    if ob.type!="MESH": continue
    bpy.context.view_layer.objects.active=ob
    for mod in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
groups={}
for ob in list(bpy.context.scene.objects):
    if ob.type=="MESH" and ob not in labels:
        material=ob.data.materials[0].name
        groups.setdefault(material,[]).append(ob)
meshes=[]
for material, parts in groups.items():
    ob=k.join(parts,f"finish-{material}"); ob.parent=root; meshes.append(ob)
for ob in labels: ob.parent=root
k.unwrap(meshes,margin=.004)
maps=k.bake_wear(meshes,output,size=1024 if is_machine else 512,
    ao_distance=.12 if is_machine else .045,cavity_distance=.012 if is_machine else .004,
    edge_radius=.004 if is_machine else .0015,samples=24)
for ob in meshes: k.box_uv(ob,.12 if is_machine else .045)
if labels:
    label=k.join(labels,"finish-print"); label.parent=root; meshes.append(label)
report={"id":asset,"triangles":sum(k.triangles(o) for o in meshes),"meshes":len(meshes),"maps":maps}
k.export_glb(output+".glb",root)
with open(output+".json","w") as f: json.dump(report,f,indent=1)
print("SUPPLY",json.dumps(report))
