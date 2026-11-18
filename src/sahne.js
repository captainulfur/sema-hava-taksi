import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'

export const ZEMIN = -1.3 // tekerlerin bastığı yükseklik

export async function sahneKur(canvas, yonetici) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const sahne = new THREE.Scene()
  const kamera = new THREE.PerspectiveCamera(26, innerWidth / innerHeight, 0.5, 200)

  // Arka plan: ekrana sabit, yukarıdan aşağı yumuşak geçiş (stüdyo fonu gibi)
  const fon = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { ust: { value: new THREE.Color() }, alt: { value: new THREE.Color() } },
      vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }',
      fragmentShader: `uniform vec3 ust; uniform vec3 alt; varying vec2 v;
        void main(){ gl_FragColor = vec4(mix(alt, ust, smoothstep(0.0, 1.0, v.y)), 1.0); }`,
      depthWrite: false,
      depthTest: false,
    }),
  )
  fon.frustumCulled = false
  fon.renderOrder = -1
  sahne.add(fon)

  // Ortam ışığı ve yansımalar: stüdyo HDRI. Vernikli boya bu yansımalarla canlanır.
  const hdr = await new HDRLoader(yonetici).loadAsync(`${import.meta.env.BASE_URL}hdri/studio_small_09_1k.hdr`)
  hdr.mapping = THREE.EquirectangularReflectionMapping
  const pmrem = new THREE.PMREMGenerator(renderer)
  sahne.environment = pmrem.fromEquirectangular(hdr).texture
  sahne.environmentRotation.y = 1.9
  hdr.dispose()
  pmrem.dispose()

  // Tepe ışığı: gölgeyi aracın hemen altına düşürür
  const gunes = new THREE.DirectionalLight('#fff6ea', 2.2)
  gunes.castShadow = true
  gunes.shadow.mapSize.set(2048, 2048)
  gunes.shadow.radius = 6
  gunes.shadow.bias = -0.0003
  gunes.shadow.normalBias = 0.02
  Object.assign(gunes.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 })
  sahne.add(gunes, gunes.target)

  // Zemin: görünmez, yalnızca gölgeyi taşır
  const zemin = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.2 }))
  zemin.rotation.x = -Math.PI / 2
  zemin.position.y = ZEMIN
  zemin.receiveShadow = true
  sahne.add(zemin)

  // Son işlem: köşelerde yumuşak gölgelenme (GTAO), ışıklarda hafif hâle, SMAA ile kenar yumuşatma
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(sahne, kamera))
  const ao = new GTAOPass(sahne, kamera, innerWidth, innerHeight)
  ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1, scale: 1, samples: 12 })
  ao.blendIntensity = 0.8
  composer.addPass(ao)
  const hale = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.1, 0.4, 4.5)
  composer.addPass(hale)
  composer.addPass(new OutputPass())
  composer.addPass(new SMAAPass())

  // Aracın ekrandaki yeri: ekranX/ekranY (-0.5..0.5) kadar kaydırılmış görüntü
  const kayma = { x: 0, y: 0 }
  function boyutla() {
    kamera.aspect = innerWidth / innerHeight
    kamera.setViewOffset(innerWidth, innerHeight, -kayma.x * innerWidth, kayma.y * innerHeight, innerWidth, innerHeight)
    renderer.setSize(innerWidth, innerHeight)
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(innerWidth, innerHeight)
  }
  addEventListener('resize', boyutla)
  boyutla()

  // Kamera hedefin çevresinde döner: yatay açı, dikey açı, uzaklık
  const hedefNokta = new THREE.Vector3()
  function kameraAyarla(hedef, aci, egim, uzaklik, ekranX, ekranY) {
    hedefNokta.copy(hedef)
    kamera.position.set(
      hedef.x + uzaklik * Math.cos(egim) * Math.sin(aci),
      hedef.y + uzaklik * Math.sin(egim),
      hedef.z + uzaklik * Math.cos(egim) * Math.cos(aci),
    )
    kamera.lookAt(hedefNokta)
    if (kayma.x !== ekranX || kayma.y !== ekranY) {
      kayma.x = ekranX
      kayma.y = ekranY
      kamera.setViewOffset(innerWidth, innerHeight, -ekranX * innerWidth, ekranY * innerHeight, innerWidth, innerHeight)
    }
  }

  return {
    renderer, sahne, kamera, gunes, zemin, hale, kameraAyarla,
    fonRenk: (ust, alt) => {
      fon.material.uniforms.ust.value.set(ust)
      fon.material.uniforms.alt.value.set(alt)
    },
    ciz: () => composer.render(),
  }
}
