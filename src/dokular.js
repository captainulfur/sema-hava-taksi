import * as THREE from 'three'

// Bu dosyadaki bütün dokular tarayıcıda çiziliyor: indirme yok, keskinlik bizde.

function tuval(g, y = g) {
  const c = document.createElement('canvas')
  c.width = g
  c.height = y
  return [c, c.getContext('2d')]
}

// Karbon fiber: 2x2 dimi örgü. Her iplik demeti ışığı farklı yönde yansıtır.
export function karbonDokusu() {
  const [c, x] = tuval(128)
  const h = 16
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const yatay = Math.floor((i + j) / 2) % 2 === 0
      const g = x.createLinearGradient(i * h, j * h, yatay ? i * h : (i + 1) * h, yatay ? (j + 1) * h : j * h)
      g.addColorStop(0, '#0c0d0f')
      g.addColorStop(0.5, yatay ? '#2b2e33' : '#1a1c20')
      g.addColorStop(1, '#0c0d0f')
      x.fillStyle = g
      x.fillRect(i * h, j * h, h, h)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(36, 10)
  t.anisotropy = 8
  return t
}

// Portakal kabuğu: gerçek vernikte yansımayı hafifçe dalgalandıran çok ince pürüz
export function vernikPuruzu() {
  const g = 256
  const [c, x] = tuval(g)
  const yukseklik = new Float32Array(g * g)
  for (let k = 0; k < 900; k++) {
    const cx = Math.random() * g
    const cy = Math.random() * g
    const r = 4 + Math.random() * 9
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) {
        const d = (xx * xx + yy * yy) / (r * r)
        if (d > 1) continue
        const px = (Math.floor(cx + xx) + g) % g
        const py = (Math.floor(cy + yy) + g) % g
        yukseklik[py * g + px] += (1 - d) * (1 - d)
      }
    }
  }
  const veri = x.createImageData(g, g)
  for (let yy = 0; yy < g; yy++) {
    for (let xx = 0; xx < g; xx++) {
      const h = (a, b) => yukseklik[((b + g) % g) * g + ((a + g) % g)]
      const nx = (h(xx - 1, yy) - h(xx + 1, yy)) * 0.5
      const ny = (h(xx, yy - 1) - h(xx, yy + 1)) * 0.5
      const i = (yy * g + xx) * 4
      veri.data[i] = 128 + nx * 60
      veri.data[i + 1] = 128 + ny * 60
      veri.data[i + 2] = 255
      veri.data[i + 3] = 255
    }
  }
  x.putImageData(veri, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(30, 18)
  return t
}

// Dönen pervanenin bulanık izi: göbekte boş, uçta ince turuncu halka, kanat geçişlerinin hafif çizgileri
export function pervaneIzi() {
  const g = 512
  const [c, x] = tuval(g)
  const veri = x.createImageData(g, g)
  const izler = Array.from({ length: 180 }, () => 0.75 + Math.random() * 0.5)
  for (let yy = 0; yy < g; yy++) {
    for (let xx = 0; xx < g; xx++) {
      const dx = xx - g / 2 + 0.5
      const dy = yy - g / 2 + 0.5
      const o = Math.hypot(dx, dy) / (g / 2)
      if (o > 1) continue
      let a = Math.min(1, Math.max(0, (o - 0.13) / 0.3)) * 0.13 * Math.min(1, (1 - o) / 0.025)
      a *= izler[Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 180) % 180]
      const turuncu = o > 0.905 && o < 0.975
      const i = (yy * g + xx) * 4
      veri.data[i] = turuncu ? 255 : 46
      veri.data[i + 1] = turuncu ? 98 : 48
      veri.data[i + 2] = turuncu ? 50 : 52
      veri.data[i + 3] = 255 * (turuncu ? a * 2.4 : a)
    }
  }
  x.putImageData(veri, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Çatı pisti işaretleri: ince çember, kesik iç çember, köşe çizgileri ve pist adı
export function pistDokusu() {
  const g = 1024
  const [c, x] = tuval(g)
  const m = g / 2
  x.strokeStyle = 'rgba(30,34,38,0.55)'
  x.fillStyle = 'rgba(30,34,38,0.55)'
  x.lineWidth = 5
  x.beginPath()
  x.arc(m, m, m * 0.78, 0, Math.PI * 2)
  x.stroke()
  x.setLineDash([22, 18])
  x.lineWidth = 3
  x.beginPath()
  x.arc(m, m, m * 0.64, 0, Math.PI * 2)
  x.stroke()
  x.setLineDash([])
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4
    x.save()
    x.translate(m + Math.cos(a) * m * 0.88, m + Math.sin(a) * m * 0.88)
    x.rotate(a)
    x.fillRect(-3, -40, 6, 80)
    x.restore()
  }
  x.font = '600 34px "JetBrains Mono", monospace'
  x.textAlign = 'center'
  x.fillText('VP · 01   KADIKÖY', m, m + m * 0.72 + 70)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// Gövde yazıları (çıkartma): şeffaf zemin üstüne yazı
export function yaziDokusu(yazi, { genislik = 1024, yukseklik = 256, font, renk = '#15191d', iz = 0 } = {}) {
  const [c, x] = tuval(genislik, yukseklik)
  x.fillStyle = renk
  x.font = font
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  if (iz) x.letterSpacing = `${iz}px`
  x.fillText(yazi, genislik / 2, yukseklik / 2)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
