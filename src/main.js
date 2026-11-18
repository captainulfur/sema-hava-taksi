import 'lenis/dist/lenis.css'
import './style.css'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { sahneKur } from './sahne.js'
import { aracYukle } from './arac.js'

gsap.registerPlugin(ScrollTrigger)

const yonetici = new THREE.LoadingManager()
yonetici.onProgress = (_, yuklenen, toplam) => {
  gsap.to('#yuklemeCizgi', { width: `${(yuklenen / toplam) * 140}px`, duration: 0.3 })
}

const lenis = new Lenis({ lerp: 0.085 })
lenis.stop()
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((t) => lenis.raf(t * 1000))
gsap.ticker.lagSmoothing(500, 33)

// Gövde yazıları tuvale çizileceği için yazı tipleri önce inmeli
await Promise.all([
  document.fonts.load('600 210px "Inter Tight"'),
  document.fonts.load('500 150px "JetBrains Mono"'),
])

const s = await sahneKur(document.getElementById('sahne'), yonetici)
const a = await aracYukle(yonetici)
s.sahne.add(a.arac, a.pist)

// Kaydırmanın değiştirdiği durum. Her karede sahneye uygulanır.
// irtifa: yerden yükseklik, nasel: 1 dik (kalkış) → 0 yatık (seyir), teker: 1 açık → 0 katlı,
// pervane: dönüş hızı, ariza: bir pervanenin durması, aci/egim/uzak: kamera, ex/ey: aracın ekrandaki yeri
const d = {
  irtifa: 0, nasel: 1, teker: 1, pervane: 0.25, ariza: 0, burun: 0, yatis: 0,
  aci: 0.95, egim: 0.1, uzak: 23, hx: 0, hy: -0.2, hz: 0, ex: 0.16, ey: -0.04, aksam: 0,
}
// Açılış hareketi ayrı tutulur ki kaydırmanın değerlerini ezmesin
const acilis = { uzak: 9, aci: 0.65 }

const duraklar = [
  // 01 kalkış: araç yükselir, tekerler katlanır, kamera alttan bakar
  { irtifa: 2.4, teker: 0, pervane: 1, aci: 0.55, egim: -0.06, uzak: 26, hy: 0.1, ex: -0.15, ey: 0 },
  // 02 dönüşüm: önden ve yukarıdan, altı naselin öne yatışı görünsün
  { nasel: 0, burun: -0.04, aci: 0.75, egim: 0.32, uzak: 25, hy: -0.1, ex: 0.17, ey: 0.02 },
  // 03 sayılar: önden üç çeyrek, araç ekranın üst yarısında
  { burun: -0.02, aci: 1.05, egim: -0.1, uzak: 33, hy: 0, ex: 0, ey: -0.09 },
  // 04 güvenlik: sol dış pervaneye yakın plan, o pervane durur
  { ariza: 1, aci: 2.2, egim: 0.22, uzak: 9.5, hx: 1.5, hz: -5.15, hy: 0.95, ex: -0.17, ey: 0 },
  // 05 rotalar: uzakta, viraj alarak süzülür
  { ariza: 0, yatis: -0.16, burun: -0.03, aci: 2.35, egim: 0.2, uzak: 34, hx: 0, hz: 0, hy: 0, ex: 0.22, ey: 0.02 },
  // 06 bilet: akşam olur, seyir ışıkları yanar; araç önden, yazının üstünde
  { yatis: 0, aksam: 1, aci: 1.22, egim: 0.06, uzak: 25, ex: 0, ey: -0.24 },
]

const tl = gsap.timeline({
  scrollTrigger: { trigger: '#hikaye', start: 'top top', end: 'bottom bottom', scrub: 1.1 },
})
duraklar.forEach((durak, i) => tl.to(d, { ...durak, duration: 1, ease: 'power2.inOut' }, i))

// Metinler bölüme girince yükselerek belirir
document.querySelectorAll('.bolum:not(.giris) .metin').forEach((m) => {
  gsap.from(m.children, {
    y: 36, opacity: 0, duration: 1, stagger: 0.07, ease: 'power3.out',
    scrollTrigger: { trigger: m, start: 'top 75%', toggleActions: 'play none none reverse' },
  })
})

// Sayılar sıfırdan sayarak gelir
document.querySelectorAll('[data-sayi]').forEach((b) => {
  const hedef = +b.dataset.sayi
  const sayac = { n: 0 }
  gsap.to(sayac, {
    n: hedef, duration: 1.6, ease: 'power2.out',
    onUpdate: () => (b.textContent = Math.round(sayac.n)),
    scrollTrigger: { trigger: '.sayilar', start: 'top 85%', toggleActions: 'play none none reverse' },
  })
})

ScrollTrigger.create({
  trigger: '.rotalar', start: 'top 75%',
  onToggle: (st) => document.querySelector('.rotalar').classList.toggle('gorundu', st.isActive || st.progress > 0),
})

document.getElementById('form').addEventListener('submit', (e) => {
  e.preventDefault()
  e.target.innerHTML = '<p class="tesekkur">Listedesin. İlk rota açıldığında yazacağız.</p>'
})

// Akşam: sayfa ve sahne renkleri birlikte kararır
const kokStil = document.documentElement.style
const gunduz = { zemin: '#eceeed', yazi: '#111418', soluk: '#6b7178', cizgi: 'rgba(17,20,24,0.14)', ust: '#f4f5f4', alt: '#dfe3e5' }
const aksam = { zemin: '#10151b', yazi: '#eef1f3', soluk: '#8b949e', cizgi: 'rgba(238,241,243,0.16)', ust: '#1c2632', alt: '#0b0f14' }
const karis = (x, y, t) => gsap.utils.interpolate(x, y, t)
let sonAksam = -1
function aksamUygula(g) {
  if (Math.abs(g - sonAksam) < 0.002) return
  sonAksam = g
  for (const k of ['zemin', 'yazi', 'soluk', 'cizgi']) kokStil.setProperty(`--${k}`, karis(gunduz[k], aksam[k], g))
  s.fonRenk(karis(gunduz.ust, aksam.ust, g), karis(gunduz.alt, aksam.alt, g))
  s.sahne.environmentIntensity = 1 - g * 0.6
  s.gunes.intensity = 2.2 - g * 1.6
  s.hale.strength = 0.07 + g * 0.85
}

// Gösterge: irtifa, nasel açısı, hız
const gIrtifa = document.getElementById('irtifa')
const gNasel = document.getElementById('nasel')
const gHiz = document.getElementById('hiz')
const gCetvel = document.getElementById('cetvel')
const uc = (n) => String(Math.round(n)).padStart(3, '0')

// Güvenlik bölümünde duran motoru işaret eden etiket
const motorEtiketi = document.getElementById('motorEtiketi')
const motorYeri = new THREE.Vector3()

const hedef = new THREE.Vector3()
let onceki = 0
function kare(saniye) {
  const dt = Math.min(0.05, saniye - onceki)
  onceki = saniye
  a.guncelle(saniye, dt, d)
  hedef.set(d.hx, d.hy + a.arac.position.y, d.hz)
  // Dar ekranda (telefon) araç ortada ve üstte, yazılar altta; dikey kadraja sığsın diye geri çekilir
  const dar = innerWidth < 760
  s.kameraAyarla(hedef, d.aci + acilis.aci, d.egim, (d.uzak + acilis.uzak) * (dar ? 1.9 : 1), dar ? 0 : d.ex, dar ? 0.2 : d.ey)
  s.gunes.position.set(2, a.arac.position.y + 12, 3)
  s.gunes.target.position.set(0, a.arac.position.y, 0)
  aksamUygula(d.aksam)
  s.zemin.material.opacity = 0.2 * Math.max(0, 1 - d.irtifa / 1.4)

  const metre = d.irtifa * 190
  gIrtifa.textContent = uc(metre)
  gNasel.textContent = String(Math.round(d.nasel * 90)).padStart(2, '0')
  gHiz.textContent = uc((1 - d.nasel) * 240 + Math.min(1, d.irtifa) * 40 * d.nasel)
  gCetvel.style.transform = `translateY(${-Math.min(1, d.irtifa / 2.4) * 118}px)`
  if (d.ariza > 0.01) {
    a.pervaneYeri(2, motorYeri).project(s.kamera)
    motorEtiketi.style.transform = `translate(${(motorYeri.x * 0.5 + 0.5) * innerWidth}px, ${(-motorYeri.y * 0.5 + 0.5) * innerHeight}px)`
  }
  motorEtiketi.style.opacity = Math.max(0, d.ariza * 2 - 1)
  s.ciz()
}

// Shader'lar perde kalkmadan derlensin ki ilk kare takılmasın
await s.renderer.compileAsync(s.sahne, s.kamera)
aksamUygula(0)
kare(0)
gsap.ticker.add(kare)

// Açılış: perde kalkar, araç hafifçe yerine oturur, yazılar gelir
gsap.timeline({ onComplete: () => lenis.start() })
  .to('#yukleme', { opacity: 0, duration: 0.8, delay: 0.2, onComplete: () => document.getElementById('yukleme')?.remove() })
  .to(acilis, { uzak: 0, aci: 0, duration: 2.4, ease: 'power3.out' }, 0.2)
  .from('.giris > *', { y: 40, opacity: 0, duration: 1.1, stagger: 0.09, ease: 'power3.out' }, 0.8)
  .from('.ust, .gosterge', { opacity: 0, duration: 1 }, 1.2)
