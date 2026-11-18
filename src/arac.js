import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js'
import { karbonDokusu, vernikPuruzu, pervaneIzi, pistDokusu, yaziDokusu } from './dokular.js'
import { ZEMIN } from './sahne.js'

// Blender'daki malzeme adları burada gerçek fiziksel malzemelere dönüşür
function malzemeler() {
  const vernik = vernikPuruzu()
  return {
    // İnci beyazı: altta yarı mat boya, üstte cam gibi vernik; hafif sedef parıltısı
    boya: new THREE.MeshPhysicalMaterial({
      color: '#eceae5', roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.035,
      clearcoatNormalMap: vernik, clearcoatNormalScale: new THREE.Vector2(0.05, 0.05),
      iridescence: 0.12, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420],
    }),
    grafit: new THREE.MeshPhysicalMaterial({
      color: '#1d2024', roughness: 0.42, metalness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.08,
    }),
    // Füme cam: yansıtır ama kabinin içi seçilir
    cam: new THREE.MeshPhysicalMaterial({
      color: '#0b0f13', roughness: 0.03, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.25,
      transparent: true, opacity: 0.6,
    }),
    ic: new THREE.MeshPhysicalMaterial({ color: '#77716a', roughness: 0.92, sheen: 0.6, sheenRoughness: 0.8, sheenColor: '#b9b2a8' }),
    ekran: new THREE.MeshStandardMaterial({ color: '#081210', emissive: '#5fe0d0', emissiveIntensity: 1.4, roughness: 0.2 }),
    serit: new THREE.MeshPhysicalMaterial({ color: '#ff5a2a', roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.05 }),
    karbon: new THREE.MeshPhysicalMaterial({
      map: karbonDokusu(), roughness: 0.38, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06,
    }),
    metal: new THREE.MeshPhysicalMaterial({
      color: '#c8cbd0', metalness: 1, roughness: 0.24,
    }),
    lastik: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.88 }),
    koyu: new THREE.MeshStandardMaterial({ color: '#25282c', roughness: 0.55 }),
    isik_kirmizi: new THREE.MeshStandardMaterial({ color: '#300', emissive: '#ff2010', emissiveIntensity: 6 }),
    isik_yesil: new THREE.MeshStandardMaterial({ color: '#030', emissive: '#10ff60', emissiveIntensity: 6 }),
    isik_beyaz: new THREE.MeshStandardMaterial({ color: '#333', emissive: '#ffffff', emissiveIntensity: 1 }),
  }
}

// Gövdede pencere boşlukları: Blender'da camları kuran formülün aynısı, piksel başına.
// Gövdenin UV'si kesit sırasını (u) ve çevre açısını (t) taşır; pencerenin içine düşen boya çizilmez.
const PENCERE_GLSL = `
float kemer(float u) { return u < 0.14 ? -0.42 + (u - 0.02) / 0.12 * 0.22 : -0.2 + (u - 0.14) / 0.28 * 0.2; }
float yukseklikAcisi(float zn) { return asin(clamp(sign(zn) * pow(abs(zn), 1.2), -1.0, 1.0)); }
float kose(float x) { return pow(max(0.0, 1.0 - pow(abs(x), 5.0)), 0.2); }
bool yanCam(float u, float t, float u0, float u1) {
  if (u <= u0 || u >= u1) return false;
  float x = (u - (u0 + u1) * 0.5) / ((u1 - u0) * 0.5);
  float a = yukseklikAcisi(kemer(u));
  float b = yukseklikAcisi(0.78);
  return abs(t - (a + b) * 0.5) < (b - a) * 0.5 * kose(x);
}
bool pencereIci(vec2 uv) {
  float u = (1.0 - cos(PI * uv.x)) * 0.5;
  float t = (1.0 - uv.y) * 2.0 * PI;
  if (u > 0.03 && u < 0.128) {
    float t2 = t > 1.5 * PI ? t - 2.0 * PI : t;
    float alt = yukseklikAcisi(kemer(u));
    if (abs(t2 - 0.5 * PI) < (0.5 * PI - alt) * kose((u - 0.079) / 0.049)) return true;
  }
  float sol = t > PI ? t - 2.0 * PI : t;
  float sag = PI - t;
  return yanCam(u, sol, 0.146, 0.278) || yanCam(u, sol, 0.294, 0.41)
      || yanCam(u, sag, 0.146, 0.278) || yanCam(u, sag, 0.294, 0.41);
}
`

function pencereliBoya(boya) {
  const m = boya.clone()
  m.defines = { USE_UV: '' }
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `${PENCERE_GLSL}\nvoid main() {\n  if (pencereIci(vUv)) discard;`)
  }
  return m
}

export async function aracYukle(yonetici) {
  const draco = new DRACOLoader(yonetici).setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
  const gltf = await new GLTFLoader(yonetici).setDRACOLoader(draco).loadAsync(`${import.meta.env.BASE_URL}model/sema.glb`)
  const arac = gltf.scene
  const m = malzemeler()
  const govdeBoyasi = pencereliBoya(m.boya)

  const govdeParcalari = []
  arac.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = true
    o.receiveShadow = true
    const ad = o.material.name
    if (m[ad]) o.material = m[ad]
    if (ad === 'boya' && /^govde/.test(o.name)) o.material = govdeBoyasi
    if (ad === 'boya' && /^(govde|dikey_kuyruk)/.test(o.name)) govdeParcalari.push(o)
  })

  // Yatar naseller ve pervaneler: sıra Blender'daki gibi (0-3 kanat, 4-5 kuyruk). Komşular ters yöne döner.
  const naseller = []
  const pervaneler = []
  for (let i = 0; i < 6; i++) {
    naseller.push(arac.getObjectByName(`nasel_${i}`))
    pervaneler.push({ nesne: arac.getObjectByName(`pervane_${i}`), yon: i % 2 ? 1 : -1, aci: Math.random() * 6 })
  }

  // Dönen kanatların bıraktığı yarı saydam iz
  const iz = pervaneIzi()
  pervaneler.forEach((p, i) => {
    p.disk = new THREE.Mesh(
      new THREE.CircleGeometry(i < 4 ? 1.15 : 0.95, 72).rotateY(Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: iz, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6 }),
    )
    p.nesne.add(p.disk)
  })

  const tekerler = {
    burun: arac.getObjectByName('teker_burun'),
    sol: arac.getObjectByName('teker_sol'),
    sag: arac.getObjectByName('teker_sag'),
  }
  const tekerYeri = Object.fromEntries(Object.entries(tekerler).map(([k, v]) => [k, v.position.clone()]))

  // Gövde yazıları: ışın gönderip gövdenin tam yüzeyine yapıştırıyoruz
  arac.updateMatrixWorld(true)
  const isin = new THREE.Raycaster()
  const yerlestirici = new THREE.Object3D()
  function cikartma(doku, nereden, boyut) {
    for (const yan of [1, -1]) {
      isin.set(new THREE.Vector3(nereden.x, nereden.y, 4 * yan), new THREE.Vector3(0, 0, -yan))
      const vurus = isin.intersectObjects(govdeParcalari, false)[0]
      if (!vurus) continue
      const normal = vurus.face.normal.clone().transformDirection(vurus.object.matrixWorld)
      yerlestirici.position.copy(vurus.point)
      yerlestirici.lookAt(vurus.point.clone().add(normal))
      const yazi = new THREE.Mesh(
        new DecalGeometry(vurus.object, vurus.point, yerlestirici.rotation, boyut),
        new THREE.MeshPhysicalMaterial({
          map: doku, transparent: true, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.04,
          polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false,
        }),
      )
      yazi.receiveShadow = true
      arac.add(yazi)
    }
  }
  cikartma(yaziDokusu('sema', { font: '600 210px "Inter Tight", sans-serif', iz: -6 }), { x: -1.25, y: 0.08 }, new THREE.Vector3(1.3, 0.33, 0.5))
  cikartma(yaziDokusu('TC-SMA', { font: '500 150px "JetBrains Mono", monospace', renk: '#3a3f45' }), { x: -3.35, y: 1.12 }, new THREE.Vector3(0.62, 0.16, 0.3))

  // Kalkış pisti işaretleri
  const pist = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: pistDokusu(), transparent: true, depthWrite: false }),
  )
  pist.position.set(-0.3, ZEMIN + 0.003, 0)
  pist.renderOrder = 1

  const isiklar = {
    beyaz: m.isik_beyaz,
    kirmizi: m.isik_kirmizi,
    yesil: m.isik_yesil,
  }

  const kok = new THREE.Group()
  kok.add(arac)

  // d: kaydırmanın belirlediği durum (irtifa, nasel açısı, teker, pervane hızı...)
  function guncelle(t, dt, d) {
    kok.position.y = d.irtifa + Math.sin(t * 1.3) * 0.035 * Math.min(1, d.irtifa)
    kok.rotation.z = d.burun + Math.sin(t * 0.9) * 0.006 * Math.min(1, d.irtifa)
    kok.rotation.x = d.yatis + Math.sin(t * 0.7 + 1) * 0.008 * Math.min(1, d.irtifa)

    const egim = d.nasel * (Math.PI / 2)
    naseller.forEach((n) => (n.rotation.z = egim))

    // Teker: burun geriye, ana tekerler içeri katlanır
    const k = 1 - d.teker
    tekerler.burun.rotation.z = -k * (Math.PI / 2)
    tekerler.burun.position.y = tekerYeri.burun.y + k * 0.08
    tekerler.sol.rotation.x = -k * (Math.PI / 2)
    tekerler.sag.rotation.x = k * (Math.PI / 2)
    tekerler.sol.position.y = tekerler.sag.position.y = tekerYeri.sol.y + k * 0.06

    pervaneler.forEach((p, i) => {
      const dur = i === 2 ? 1 - d.ariza : 1
      const hiz = (3 + d.pervane * 22) * dur
      p.aci += p.yon * hiz * dt
      p.nesne.rotation.x = p.aci
      p.disk.material.opacity = Math.min(0.75, d.pervane * 0.8) * dur
    })

    isiklar.beyaz.emissiveIntensity = (t * 1.15) % 1 < 0.05 ? 40 : 0.6
    pist.material.opacity = Math.max(0, 1 - d.irtifa / 1.5)
  }

  // Bir pervanenin dünyadaki yeri (ekrana etiket koymak için)
  const pervaneYeri = (i, hedef) => pervaneler[i].nesne.getWorldPosition(hedef)

  return { arac: kok, pist, guncelle, pervaneYeri }
}
