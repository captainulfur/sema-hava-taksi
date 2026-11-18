# SEMA hava taksisi: dört yolculu, elektrikli, dikey kalkan araç. Blender'da kodla kurulur, web için tek GLB olarak dışa aktarılır.
# Çalıştırma: Blender -b -P blender/hava_taksi.py -- <proje-klasoru>
# Birimler metre. Burun +X yönünde, sol kanat +Y, yukarı +Z. Yer (teker altı) z = -1.30.

import bpy, bmesh, math, sys, os
from bisect import bisect
from mathutils import Vector, Matrix

PROJE = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------- malzemeler
# Asıl görünüm Three.js'te kurulacak (vernik, karbon, cam); burada isim ve temel renk yeterli.
def malzeme(ad, renk, metal=0.0, puruz=0.5, isik=0.0):
    m = bpy.data.materials.new(ad)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*renk, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = puruz
    if isik:
        b.inputs['Emission Color'].default_value = (*renk, 1)
        b.inputs['Emission Strength'].default_value = isik
    return m


# Gövde
BOYA = malzeme('boya', (0.85, 0.85, 0.83), puruz=0.2)
GRAFIT = malzeme('grafit', (0.045, 0.05, 0.055), puruz=0.35)
CAM = malzeme('cam', (0.012, 0.014, 0.018), puruz=0.03)
SERIT = malzeme('serit', (1.0, 0.27, 0.12), puruz=0.3)
KOYU = malzeme('koyu', (0.08, 0.085, 0.09), puruz=0.5)
# Pervaneler
KARBON = malzeme('karbon', (0.035, 0.035, 0.04), puruz=0.3)
# Kabin, tekerler ve ışıklar
IC = malzeme('ic', (0.09, 0.095, 0.1), puruz=0.9)
EKRAN = malzeme('ekran', (0.3, 0.85, 0.8), isik=2)
METAL = malzeme('metal', (0.8, 0.8, 0.82), metal=1.0, puruz=0.28)
LASTIK = malzeme('lastik', (0.025, 0.025, 0.025), puruz=0.85)
KIRMIZI = malzeme('isik_kirmizi', (1.0, 0.04, 0.03), isik=6)
YESIL = malzeme('isik_yesil', (0.05, 1.0, 0.35), isik=6)
BEYAZ_ISIK = malzeme('isik_beyaz', (1.0, 1.0, 1.0), isik=8)


# ---------------------------------------------------------------- yardımcılar
def egri(anahtar):
    """Taşma yapmayan yumuşak eğri (PCHIP): anahtar = [(x, y), ...]"""
    xs = [k[0] for k in anahtar]
    ys = [k[1] for k in anahtar]
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [d[0]] + [0.0] * (n - 2) + [d[-1]]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        i = max(0, min(n - 2, bisect(xs, x) - 1))
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])
    return f


def nesne(ad, me, konum=(0, 0, 0), ebeveyn=None):
    o = bpy.data.objects.new(ad, me)
    bpy.context.collection.objects.link(o)
    o.location = konum
    if ebeveyn:
        o.parent = ebeveyn
    return o


def ag(ad, halkalar, malzemeler, sec=lambda i, j: 0, halka_kapali=True, bas=True, son=True, dongu=False, yumusak=True, ters=False):
    """Kesitlerden yüzey örer. halkalar: aynı sayıda noktalı kesitler. sec(i, j) yüzün malzeme sırasını verir."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    N, M = len(halkalar), len(halkalar[0])
    v = [[bm.verts.new(p) for p in h] for h in halkalar]
    for i in range(N if dongu else N - 1):
        i2 = (i + 1) % N
        for j in range(M if halka_kapali else M - 1):
            j2 = (j + 1) % M
            f = bm.faces.new((v[i][j], v[i][j2], v[i2][j2], v[i2][j]))
            f.material_index = sec(i, j)
            for l, (a, b) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
                l[uv].uv = (a / (N - 1), b / M)
    for kapat, i in ((bas, 0), (son, N - 1)):
        if kapat and not dongu:
            merkez = sum((Vector(p) for p in halkalar[i]), Vector()) / M
            c = bm.verts.new(merkez)
            for j in range(M if halka_kapali else M - 1):
                f = bm.faces.new((v[i][j], v[i][(j + 1) % M], c))
                f.material_index = sec(min(i, N - 2), j)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if ters:  # içeriden görülecek yüzeyler (kabin astarı)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(ad)
    bm.to_mesh(me)
    bm.free()
    for m in malzemeler:
        me.materials.append(m)
    me.polygons.foreach_set('use_smooth', [yumusak] * len(me.polygons))
    return me


def boru(ad, noktalar, r, mal, ebeveyn=None):
    """Noktalardan ince boru (panel çizgileri için): eğri oluşturup ağa çevirir."""
    cu = bpy.data.curves.new(ad, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 1
    sp = cu.splines.new('POLY')
    sp.points.add(len(noktalar) - 1)
    for p, n in zip(sp.points, noktalar):
        p.co = (*n, 1)
    gecici = bpy.data.objects.new(ad + '_egri', cu)
    bpy.context.collection.objects.link(gecici)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(gecici.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(gecici)
    me.materials.append(mal)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    return nesne(ad, me, ebeveyn=ebeveyn)


def kanat_kesiti(kalinlik, kambur=0.0, k=22):
    """NACA tipi profil: firar kenarından üst yüzeyle hücum kenarına, alttan geri. (veter konumu 0-1, yükseklik)"""
    def yari(x):
        return 5 * kalinlik * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4)

    def kamber(x):
        p = 0.4
        return kambur / p ** 2 * (2 * p * x - x * x) if x < p else kambur / (1 - p) ** 2 * (1 - 2 * p + 2 * p * x - x * x)
    xs = [(1 - math.cos(math.pi * i / k)) / 2 for i in range(k + 1)]
    ust = [(x, kamber(x) + yari(x)) for x in reversed(xs)]
    alt = [(x, kamber(x) - yari(x)) for x in xs[1:]]
    return ust + alt


def torna(ad, profil, malzemeler, sec=lambda i, j: 0, kose=40, dongu=False, eksen='X', bas=True, son=True):
    """Bir profili eksen etrafında döndürür. profil: [(eksen boyunca konum, yarıçap), ...]"""
    halkalar = []
    for a, r in profil:
        h = []
        for j in range(kose):
            t = 2 * math.pi * j / kose
            p = Vector((a, r * math.cos(t), r * math.sin(t)))
            if eksen == 'Y':
                p = Vector((p.y, a, p.z))
            elif eksen == 'Z':
                p = Vector((p.y, p.z, a))
            h.append(p)
        halkalar.append(h)
    return ag(ad, halkalar, malzemeler, sec, dongu=dongu, bas=bas, son=son)


kok = bpy.data.objects.new('sema', None)
bpy.context.collection.objects.link(kok)


# ---------------------------------------------------------------- gövde
# Gövde burundan (u=0, x=3.8) kuyruğa (u=1, x=-3.8) kesitlerle kurulur. Kesit yarı elips değil
# "süper elips": kenarları hafif dolgun, otomobil kabini gibi.
BOY = 7.6
genislik = egri([(0, .50), (.15, .66), (.3, .74), (.45, .75), (.55, .72), (.68, .56), (.8, .36), (.9, .22), (1, .13)])
ust_yari = egri([(0, .42), (.15, .74), (.3, .86), (.45, .87), (.55, .84), (.68, .70), (.8, .50), (.9, .34), (1, .21)])
alt_yari = egri([(0, .42), (.15, .58), (.3, .66), (.45, .67), (.55, .65), (.68, .52), (.8, .35), (.9, .2), (1, .11)])
orta_z = egri([(0, -.2), (.15, -.04), (.3, 0), (.5, 0), (.68, .10), (.8, .24), (.9, .38), (1, .48)])


def uc_yuvarla(u):
    burun = math.sqrt(max(0.0, 1 - (1 - min(u / 0.13, 1)) ** 2))
    kuyruk = math.sqrt(max(0.0, 1 - (1 - min((1 - u) / 0.04, 1)) ** 2))
    return burun * kuyruk


def us(u):
    return 2.4  # sabit üs: yatay bantlar (karın, şerit) gövde boyunca düz çizgi olur


def govde_noktasi(u, t, disari=0.0):
    k = uc_yuvarla(u)
    n = us(u)
    c, s = math.cos(t), math.sin(t)
    yn = math.copysign(abs(c) ** (2 / n), c)
    zn = math.copysign(abs(s) ** (2 / n), s)
    hw = genislik(u) * k + disari
    hz = (ust_yari(u) if s > 0 else alt_yari(u)) * k + disari
    return Vector((BOY / 2 - u * BOY, hw * yn, orta_z(u) + hz * zn))


def zn_den_aci(zn, u, sag=False):
    n = us(u)
    s = math.copysign(abs(zn) ** (n / 2), zn)
    t = math.asin(max(-1, min(1, s)))
    return -math.pi - t if sag else t  # sol taraf +Y, sağ taraf -Y


N_GOVDE, M_GOVDE = 130, 96
govde_u = [(1 - math.cos(math.pi * i / (N_GOVDE - 1))) / 2 for i in range(N_GOVDE)]


def kemer(u):
    """Cam alanının alt sınırı (normalize yükseklik): burunda aşağıda, kabin boyunca yükselir."""
    if u < 0.14:
        return -0.42 + (u - 0.02) / 0.12 * 0.22
    return -0.2 + (u - 0.14) / 0.28 * 0.2


def govde_malzemesi(i, j):
    u = (govde_u[i] + govde_u[i + 1]) / 2
    zn = math.copysign(abs(math.sin(2 * math.pi * (j + 0.5) / M_GOVDE)) ** (2 / us(u)), math.sin(2 * math.pi * (j + 0.5) / M_GOVDE))
    if zn < -0.6 and 0.05 < u < 0.97:
        return 1  # grafit karın
    if -0.6 <= zn < -0.53 and 0.3 < u < 0.9:
        return 3  # turuncu şerit
    return 0


halkalar = [[govde_noktasi(u, 2 * math.pi * j / M_GOVDE) for j in range(M_GOVDE)] for u in govde_u]
# Burun ve kuyruk kesitleri zaten tek noktaya iner: kapak gerekmez
govde = nesne('govde', ag('govde', halkalar, [BOYA, GRAFIT, CAM, SERIT], govde_malzemesi, bas=False, son=False), ebeveyn=kok)


# Camlar: gövdenin üstüne 3 mm kabartılmış ayrı parçalar; köşeleri yumuşak (süper elips),
# çevresinde biraz daha geniş siyah conta.
def pencere(ad, u0, u1, aralik, mal, disari, genis=0.0, K=48, L=36):
    """aralik(u) -> (t_alt, t_ust): o kesitte camın kapladığı açı aralığı"""
    p = 5
    halka = []
    for a in range(K + 1):
        x = -1 + 2 * a / K
        u = (u0 + u1) / 2 + x * ((u1 - u0) / 2 + genis)
        ta, tu = aralik(u)
        orta, yari = (ta + tu) / 2, (tu - ta) / 2 + genis * 2
        k = (1 - abs(x) ** p) ** (1 / p)
        halka.append([govde_noktasi(u, orta + yari * k * (-1 + 2 * b / L), disari) for b in range(L + 1)])
    return nesne(ad, ag(ad, halka, [mal], halka_kapali=False, bas=False, son=False), ebeveyn=govde)


def conta(ad, u0, u1, aralik, mal, disari, genis, P=120):
    """Camın çevresinde ince lastik halka: iç kenar camın kenarı, dış kenar biraz daha geniş"""
    p = 5
    halkalar = []
    for g in (0.0, genis):
        h = []
        for k in range(P):
            fi = 2 * math.pi * k / P
            x = math.copysign(abs(math.cos(fi)) ** (2 / p), math.cos(fi))
            w = math.copysign(abs(math.sin(fi)) ** (2 / p), math.sin(fi))
            u = (u0 + u1) / 2 + x * ((u1 - u0) / 2 + g)
            ta, tu = aralik(u)
            h.append(govde_noktasi(u, (ta + tu) / 2 + w * ((tu - ta) / 2 + g * 2), disari))
        halkalar.append(h)
    return nesne(ad, ag(ad, halkalar, [mal], bas=False, son=False), ebeveyn=govde)


def on_cam(u):
    return zn_den_aci(kemer(u), u), zn_den_aci(kemer(u), u, sag=True) + 2 * math.pi


def yan_cam(sag):
    def f(u):
        a, b = zn_den_aci(kemer(u), u, sag), zn_den_aci(0.78, u, sag)
        return (min(a, b), max(a, b))
    return f


camlar = [('on_cam', 0.03, 0.128, on_cam)]
for sag in (False, True):
    camlar += [('yan_cam', 0.146, 0.278, yan_cam(sag)), ('yan_cam', 0.294, 0.41, yan_cam(sag))]
for ad, u0, u1, f in camlar:
    conta(ad + '_conta', u0, u1, f, KOYU, 0.004, 0.005)
    pencere(ad, u0, u1, f, CAM, 0.006)


# Kapı çizgileri: gövdeye 1 mm dışarıdan geçen ince koyu borular
for sag in (False, True):
    for u0, u1 in ((0.15, 0.278), (0.296, 0.41)):
        alt = [govde_noktasi(u0 + (u1 - u0) * k / 16, zn_den_aci(-0.47, u0 + (u1 - u0) * k / 16, sag), 0.002) for k in range(17)]
        on = [govde_noktasi(u0, zn_den_aci(-0.47 + (kemer(u0) + 0.47) * k / 8, u0, sag), 0.002) for k in range(9)]
        arka = [govde_noktasi(u1, zn_den_aci(-0.47 + (kemer(u1) + 0.47) * k / 8, u1, sag), 0.002) for k in range(9)]
        boru('kapi_cizgisi', list(reversed(on)) + alt + arka, 0.005, KOYU, ebeveyn=govde)


# ---------------------------------------------------------------- kanat
# Sırt kaportası: kanadı gövdeye yumuşakça bağlar, kuyruğa doğru incelir
def sirt_halkasi(u, M=40):
    o = min(1, max(0, (u - 0.33) / 0.62))
    yuk = 0.1 * math.sin(math.pi * o ** 0.7)
    gen = 0.3 * math.sin(math.pi * o ** 0.6) ** 0.7 + 0.04
    ust = govde_noktasi(u, math.pi / 2)
    return [Vector((ust.x, gen * math.copysign(abs(math.cos(t)) ** 0.8, math.cos(t)),
                    ust.z - 0.12 + (0.12 + yuk) * math.copysign(abs(math.sin(t)) ** 0.8, math.sin(t))))
            for t in (2 * math.pi * j / M for j in range(M))]


nesne('sirt', ag('sirt', [sirt_halkasi(0.33 + 0.62 * k / 40) for k in range(41)], [BOYA]), ebeveyn=kok)

# Yüksek kanat, gövdenin üstünden geçer. Kesit hafif kamburlu NACA profili.
YARI_ACIKLIK = 5.75
profil = kanat_kesiti(0.13, 0.02)


def kanat_yeri(y):
    oran = abs(y) / YARI_ACIKLIK
    veter = 1.45 - 0.55 * oran
    hucum_x = 0.55 - 0.08 * oran
    z = 0.89 + abs(y) * math.tan(math.radians(1.5))
    return veter, hucum_x, z


def kanat_halkasi(y, kalinlik_carpani=1.0):
    veter, hx, z = kanat_yeri(y)
    return [Vector((hx - x * veter, y, z + h * veter * kalinlik_carpani)) for x, h in profil]


aciklik = [YARI_ACIKLIK * math.sin(math.pi / 2 * k / 30) for k in range(31)]
kesitler = [-a for a in reversed(aciklik[1:])] + aciklik
kanat = nesne('kanat', ag('kanat', [kanat_halkasi(y, 1 - 0.35 * max(0, abs(y) / YARI_ACIKLIK - 0.97) / 0.03) for y in kesitler],
                          [BOYA], halka_kapali=False), ebeveyn=kok)


# ---------------------------------------------------------------- kuyruk
yatay = kanat_kesiti(0.11)
KUYRUK_YARI = 2.75


def yatay_halka(y):
    veter, hx, z = 0.68, -2.92, 0.62
    return [Vector((hx - x * veter, y, z + h * veter)) for x, h in yatay]


ky = [KUYRUK_YARI * (k / 12) for k in range(13)]
nesne('yatay_kuyruk', ag('yatay_kuyruk', [yatay_halka(y) for y in [-a for a in reversed(ky[1:])] + ky], [BOYA], halka_kapali=False), ebeveyn=kok)


def dikey_halka(oran):
    veter = 1.35 - 0.75 * oran
    hx = -2.45 - 0.95 * oran
    z = 0.55 + 1.15 * oran
    return [Vector((hx - x * veter, h * veter, z)) for x, h in yatay]


nesne('dikey_kuyruk', ag('dikey_kuyruk', [dikey_halka(k / 10) for k in range(11)], [BOYA], halka_kapali=False), ebeveyn=kok)


# ---------------------------------------------------------------- pervaneler ve yatar naseller
def pervane(ad, R, kanat_sayisi=5):
    """Göbek merkezli pervane; dönme ekseni yerel +X. Uçları turuncu (güvenlik boyası)."""
    bm_parcalar = []
    IST = 16
    istasyonlar = [0.1 + (R - 0.1) * (1 - math.cos(math.pi / 2 * k / (IST - 1))) for k in range(IST)]
    blade_profil = kanat_kesiti(0.09)
    eksen = Vector((1, 0, 0))
    halkalar_hepsi = []
    for b in range(kanat_sayisi):
        fi = 2 * math.pi * b / kanat_sayisi
        er = Vector((0, math.cos(fi), math.sin(fi)))
        et = eksen.cross(er)
        hal = []
        for r in istasyonlar:
            o = r / R
            veter = (0.21 - 0.11 * o) * (0.55 + 0.45 * min(1, o / 0.25)) * (R / 1.15)
            if o > 0.96:
                veter *= 1 - (o - 0.96) / 0.04 * 0.45
            beta = math.radians(30 - 22 * o)
            hal.append([r * er + (x - 0.3) * veter * (math.cos(beta) * et + math.sin(beta) * eksen)
                        + h * veter * (-math.sin(beta) * et + math.cos(beta) * eksen) for x, h in blade_profil])
        halkalar_hepsi.append(hal)
    me = bpy.data.meshes.new(ad)
    bm = bmesh.new()
    for hal in halkalar_hepsi:
        parca = ag('gecici', hal, [KARBON, SERIT], lambda i, j: 1 if istasyonlar[i] / R > 0.9 else 0, halka_kapali=False)
        bm.from_mesh(parca)
        bpy.data.meshes.remove(parca)
    # Göbek kapağı: arkası düz, önü sivri
    gobek = torna('gecici', [(-0.1 + 0.36 * k / 14, 0.15 * math.sqrt(max(0.0, 1 - (k / 14) ** 2.2))) for k in range(15)],
                  [BOYA], kose=32)
    bm_g = bmesh.new()
    bm_g.from_mesh(gobek)
    for f in bm_g.faces:
        f.material_index = 2
    bm_g.to_mesh(gobek)
    bm_g.free()
    bm.from_mesh(gobek)
    bpy.data.meshes.remove(gobek)
    bm.to_mesh(me)
    bm.free()
    for m in (KARBON, SERIT, BOYA):
        me.materials.append(m)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    return me


def nasel(sira, pivot, boy, R, arka_boy, r=0.17):
    """Yatar nasel: menteşe noktası (pivot) etrafında döner. Seyirde ileri bakar (+X), havada asılı kalırken yukarı."""
    on = nesne(f'nasel_{sira}', torna(f'nasel_{sira}',
               [(-r + r * (1 - math.cos(math.pi / 2 * k / 6)), r * math.sin(math.pi / 2 * k / 6)) for k in range(7)]
               + [(boy * k / 10, r * (1 - 0.3 * (k / 10) ** 2)) for k in range(1, 11)],
               [BOYA, KOYU], lambda i, j: 1 if i >= 15 else 0, kose=36), pivot, ebeveyn=kok)
    nesne(f'pervane_{sira}', pervane(f'pervane_{sira}', R), (boy + 0.06, 0, 0), ebeveyn=on)
    # Sabit arka gövdecik: kanadın üstünde geriye uzanır
    profil_arka = [(0, r * 0.98)] + [(-arka_boy * k / 12, r * 0.98 * math.sqrt(max(0.0, 1 - (k / 12) ** 2.5)) + 0.004) for k in range(1, 13)]
    nesne(f'nasel_arka_{sira}', torna(f'nasel_arka_{sira}', profil_arka, [BOYA], kose=36), pivot, ebeveyn=kok)
    return on


sira = 0
for y in (2.45, 5.15):
    for isaret in (1, -1):
        veter, hx, z = kanat_yeri(y)
        nasel(sira, (hx + 0.02, isaret * y, z + 0.02), 1.12, 1.15, veter + 0.55)
        sira += 1
for isaret in (1, -1):
    nasel(sira, (-2.9, isaret * KUYRUK_YARI, 0.62), 0.78, 0.95, 1.0, r=0.14)
    sira += 1


# ---------------------------------------------------------------- kabin
# Kabin: içeriden koyu astar, zemin, gösterge paneli ve beş koltuk. Camların ardında gerçek bir iç görünsün.
astar_u = [u for u in govde_u if u < 0.47]
nesne('kabin_astar', ag('kabin_astar', [[govde_noktasi(u, 2 * math.pi * j / 48, -0.025) for j in range(48)] for u in astar_u],
                        [IC], ters=True), ebeveyn=govde)


def yuvarlak_kutu(ad, merkez, boyut, mal, ebeveyn, egim=0.0, n=8, K=10):
    """Köşeleri yumuşatılmış kutu: süper elips kesitlerden örülür (koltuk minderi, panel)."""
    # Kesitler en uzun eksen boyunca dizilir; geniş yüzler düzgün dörtgenlerden oluşur
    eksen = max(range(3), key=lambda i: boyut[i])
    diger = [i for i in range(3) if i != eksen]
    yari = [b / 2 for b in boyut]
    halkalar = []
    for k in range(K + 1):
        x = -1 + 2 * k / K
        olcek = (1 - abs(x) ** n) ** (1 / n)
        h = []
        for j in range(32):
            t = 2 * math.pi * j / 32
            c, si = math.cos(t), math.sin(t)
            p = [0.0, 0.0, 0.0]
            p[eksen] = x * yari[eksen]
            p[diger[0]] = yari[diger[0]] * olcek * math.copysign(abs(c) ** (2 / n), c)
            p[diger[1]] = yari[diger[1]] * olcek * math.copysign(abs(si) ** (2 / n), si)
            h.append(Vector(p))
        halkalar.append(h)
    o = nesne(ad, ag(ad, halkalar, [mal]), merkez, ebeveyn)
    o.rotation_euler = (0, egim, 0)
    return o


yuvarlak_kutu('kabin_zemin', (1.8, 0, -0.5), (2.6, 1.2, 0.06), IC, govde)
yuvarlak_kutu('panel', (2.78, 0, -0.16), (0.42, 1.0, 0.2), IC, govde)
yuvarlak_kutu('ekran', (2.62, 0, -0.03), (0.03, 0.62, 0.15), EKRAN, govde, egim=-0.5, n=12)
for y in (-0.32, 0.32):
    yuvarlak_kutu('koltuk', (2.0, y, -0.34), (0.48, 0.46, 0.13), IC, govde)
    yuvarlak_kutu('koltuk_sirt', (1.74, y, 0.02), (0.12, 0.46, 0.66), IC, govde, egim=-0.2)
for y in (-0.46, 0, 0.46):
    yuvarlak_kutu('koltuk', (0.95, y, -0.34), (0.48, 0.42, 0.13), IC, govde)
    yuvarlak_kutu('koltuk_sirt', (0.69, y, 0.04), (0.12, 0.42, 0.7), IC, govde, egim=-0.2)


# ---------------------------------------------------------------- iniş takımları
def teker(ad, R, gen, ebeveyn, konum):
    lastik = torna(ad + '_lastik', [(gen / 2 * math.cos(2 * math.pi * k / 20), R - gen / 2 + gen / 2 * math.sin(2 * math.pi * k / 20) * 1.15)
                                    for k in range(20)], [LASTIK], eksen='Y', dongu=True, kose=40)
    jant = torna(ad + '_jant', [(-gen * 0.42, 0.0), (-gen * 0.42, R * 0.62), (0, R * 0.66), (gen * 0.42, R * 0.62), (gen * 0.42, 0.0)],
                 [METAL], eksen='Y', kose=32, bas=False, son=False)
    nesne(ad + '_lastik', lastik, konum, ebeveyn)
    nesne(ad + '_jant', jant, konum, ebeveyn)


def dikme(ad, ust, alt_nokta, r, mal, ebeveyn):
    yon = Vector(alt_nokta) - Vector(ust)
    me = torna(ad, [(0, r), (yon.length, r)], [mal], kose=16)
    o = nesne(ad, me, ust, ebeveyn)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(yon.normalized())
    return o


ZEMIN = -1.30
burun = nesne('teker_burun', None, (2.5, 0, -0.5), kok)
dikme('burun_dikme', (0, 0, 0), (0, 0, -0.62), 0.035, METAL, burun)
teker('burun_teker', 0.18, 0.11, burun, (0, 0, ZEMIN + 0.18 + 0.5))
for ad, isaret in (('teker_sol', 1), ('teker_sag', -1)):
    ana = nesne(ad, None, (-0.78, isaret * 0.6, -0.52), kok)
    dikme(ad + '_dikme', (0, 0, 0), (0, isaret * 0.18, -0.55), 0.04, METAL, ana)
    teker(ad + '_teker', 0.22, 0.13, ana, (0, isaret * 0.2, ZEMIN + 0.22 + 0.52))

# ---------------------------------------------------------------- seyir ışıkları
for ad, mal, konum in (('isik_sol', KIRMIZI, (kanat_yeri(5.75)[1] - 0.25, 5.76, kanat_yeri(5.75)[2])),
                       ('isik_sag', YESIL, (kanat_yeri(5.75)[1] - 0.25, -5.76, kanat_yeri(5.75)[2])),
                       ('isik_kuyruk', BEYAZ_ISIK, (-3.97, 0, 1.70))):
    nesne(ad, torna(ad, [(-0.05 + 0.1 * k / 6, 0.05 * math.sin(math.pi * k / 6)) for k in range(7)], [mal], kose=16), konum, kok)

# ---------------------------------------------------------------- dışa aktar
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.data.validate()

glb = os.path.join(PROJE, 'public', 'model', 'sema.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_yup=True,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
print('GLB:', glb, round(os.path.getsize(glb) / 1e6, 2), 'MB')
