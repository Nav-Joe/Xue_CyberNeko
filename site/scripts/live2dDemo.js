/**
 * 功能页 01：在演示区挂官方样板 Live2D（桃濑日和）。
 * 先跑 `node scripts/stage-site-assets.mjs`，再用 `node site/serve.mjs`。
 * 路径用相对地址，GitHub Pages 挂在子路径时也能找到资源。
 */
(() => {
  const MODEL_URL = 'models/hiyori_pro/runtime/hiyori_pro_t11.model3.json'
  const CORE_URL = 'live2d/live2dcubismcore.min.js'
  const PIXI_URL = 'vendor/pixi.min.js'
  const LIVE2D_URL = 'vendor/live2d-cubism4.min.js'

  const stage = document.getElementById('petDemoStage')
  const canvas = document.getElementById('petDemoCanvas')
  const petFallback = document.getElementById('petDemoPet')
  const tip = stage?.querySelector('.feature-demo__tip')
  const badge = stage?.querySelector('.feature-demo__badge')
  if (!stage || !canvas) return

  const DISABLED_IDLE = '__quiet_idle_disabled__'
  let app = null
  let model = null
  let baseW = 1
  let baseH = 1
  let started = false
  let dragging = false
  let moved = false
  let dragDX = 0
  let dragDY = 0

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-demo-src="${src}"]`)
      if (existing) {
        if (existing.dataset.loaded === '1') {
          resolve()
          return
        }
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error(src)), { once: true })
        return
      }
      const script = document.createElement('script')
      script.src = src
      script.async = false
      script.dataset.demoSrc = src
      script.onload = () => {
        script.dataset.loaded = '1'
        resolve()
      }
      script.onerror = () => reject(new Error(`Failed to load ${src}`))
      document.head.appendChild(script)
    })
  }

  function setStatus(kind, text) {
    if (tip) tip.textContent = text
    stage.dataset.demoState = kind
  }

  function showFallback(message) {
    canvas.classList.remove('is-live')
    petFallback?.classList.remove('is-hidden')
    setStatus('fallback', message)
  }

  function layoutModel() {
    if (!app || !model) return
    const w = app.screen.width
    const h = app.screen.height
    // 必须用加载时锁定的逻辑尺寸；model.width 会随 scale 变，重复 layout 会越放越大
    const scale = Math.min((w * 0.5) / baseW, (h * 0.86) / baseH)
    model.scale.set(scale)
    model.anchor.set(0.5, 0.5)
    model.x = w * 0.5
    model.y = h * 0.58
  }

  function configureQuietIdle(liveModel) {
    const mm = liveModel.internalModel?.motionManager
    if (!mm) return
    mm.groups.idle = DISABLED_IDLE
    mm.stopAllMotions()
  }

  function playTapMotion() {
    if (!model) return
    const tryPlay = (group) => {
      try {
        const r = model.motion(group)
        return r != null
      } catch {
        return false
      }
    }
    if (!tryPlay('Tap@Body') && !tryPlay('Tap') && !tryPlay('Flick')) {
      model.tap?.(model.x, model.y)
    }
  }

  function bindDrag() {
    if (!app || !model || !canvas) return

    const onDown = (e) => {
      if (e.button != null && e.button !== 0) return
      const local = mapPointer(e)
      if (!hitModel(local.x, local.y)) return
      dragging = true
      moved = false
      dragDX = local.x - model.x
      dragDY = local.y - model.y
      canvas.setPointerCapture?.(e.pointerId)
      canvas.classList.add('is-dragging')
    }

    const onMove = (e) => {
      if (!dragging || !model) return
      const local = mapPointer(e)
      const nx = local.x - dragDX
      const ny = local.y - dragDY
      if (Math.hypot(nx - model.x, ny - model.y) > 2) moved = true
      model.x = Math.max(40, Math.min(app.screen.width - 40, nx))
      model.y = Math.max(60, Math.min(app.screen.height - 20, ny))
    }

    const onUp = (e) => {
      if (!dragging) return
      dragging = false
      canvas.classList.remove('is-dragging')
      try {
        canvas.releasePointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
      if (!moved) playTapMotion()
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
  }

  function mapPointer(e) {
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * app.screen.width
    const y = ((e.clientY - rect.top) / rect.height) * app.screen.height
    return { x, y }
  }

  function hitModel(x, y) {
    if (!model) return false
    try {
      if (typeof model.containsPoint === 'function') {
        return model.containsPoint({ x, y })
      }
    } catch {
      /* fall through */
    }
    const hw = (model.width * Math.abs(model.scale.x)) / 2
    const hh = (model.height * Math.abs(model.scale.y)) / 2
    return Math.abs(x - model.x) <= hw * 0.7 && Math.abs(y - model.y) <= hh * 0.85
  }

  async function initLive2D() {
    if (started) return
    started = true
    setStatus('loading', '正在加载 Live2D 样板…')

    try {
      if (location.protocol === 'file:') {
        throw new Error('file://')
      }

      await loadScript(CORE_URL)
      if (!window.Live2DCubismCore) {
        throw new Error('Cubism Core missing')
      }
      await loadScript(PIXI_URL)
      await loadScript(LIVE2D_URL)

      const PIXI = window.PIXI
      const Live2DModel = PIXI?.live2d?.Live2DModel
      if (!PIXI || !Live2DModel) {
        throw new Error('PIXI.live2d unavailable')
      }

      Live2DModel.registerTicker(PIXI.Ticker)

      const width = Math.max(stage.clientWidth, 320)
      const height = Math.max(stage.clientHeight, 280)

      app = new PIXI.Application({
        view: canvas,
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      })

      model = await Live2DModel.from(MODEL_URL, {
        autoInteract: true,
        autoUpdate: true,
        idleMotionGroup: DISABLED_IDLE,
        motionPreload: 0,
      })
      configureQuietIdle(model)
      model.anchor.set(0.5, 0.5)
      model.interactive = false
      model.scale.set(1)
      // 锁定未缩放时的显示尺寸，供后续 resize 复用
      baseW = Math.max(model.width || model.internalModel?.width || 1, 1)
      baseH = Math.max(model.height || model.internalModel?.height || 1, 1)
      app.stage.addChild(model)
      layoutModel()
      bindDrag()

      canvas.classList.add('is-live')
      petFallback?.classList.add('is-hidden')
      if (badge) {
        badge.dataset.i18n = 'f1DemoBadgeLive'
        badge.textContent = '官方样板 · 桃濑日和'
      }
      setStatus('live', '可拖动 · 点击有动作')

      const ro = new ResizeObserver(() => {
        if (!app) return
        const w = Math.max(stage.clientWidth, 320)
        const h = Math.max(stage.clientHeight, 280)
        app.renderer.resize(w, h)
        layoutModel()
      })
      ro.observe(stage)
    } catch (err) {
      console.warn('[site live2d demo]', err)
      const fileHint =
        err && String(err.message || err).includes('file:')
          ? '请用 node site/serve.mjs 打开本页'
          : 'Live2D 加载失败 · 可先拖剪影'
      showFallback(fileHint)
      // keep silhouette demo usable
      import('./petDemo.js').catch(() => {})
    }
  }

  function watchSlide() {
    const slide = document.getElementById('features')
    if (!slide) {
      void initLive2D()
      return
    }
    if (slide.classList.contains('is-active')) {
      void initLive2D()
    }
    const mo = new MutationObserver(() => {
      if (slide.classList.contains('is-active')) void initLive2D()
    })
    mo.observe(slide, { attributes: true, attributeFilter: ['class'] })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchSlide, { once: true })
  } else {
    watchSlide()
  }
})()
