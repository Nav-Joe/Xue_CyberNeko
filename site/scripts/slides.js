/**
 * 整页滑块导航（参考 shikigami.app）：
 * - 滚轮/触控/方向键按屏切换
 * - IntersectionObserver 给当前屏加 is-active
 * - .slide-reveal 子元素在 is-active 时错落入场
 */
(() => {
  const SLIDE_SEL = 'section.slide'
  const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']
  const TRANSITION_MS = 900
  /** 触控板惯性会连发 wheel；锁结束后再挡一阵，避免一次手势跳两屏 */
  const WHEEL_COOLDOWN_MS = 1200

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function mountRail(sections) {
    const dots = Array.from(document.querySelectorAll('[data-rail-target]'))
    const label = document.querySelector('[data-rail-current]')

    function updateActive(el) {
      const idx = sections.indexOf(el)
      if (idx < 0) return
      sections.forEach((s) => s.classList.toggle('is-active', s === el))
      dots.forEach((d) => d.setAttribute('aria-current', 'false'))
      const match = dots.find((d) => d.dataset.railTarget === el.id)
      if (match) match.setAttribute('aria-current', 'true')
      if (label) label.textContent = ROMANS[idx] ?? String(idx + 1)
    }

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) updateActive(visible.target)
      },
      { threshold: [0.35, 0.55, 0.75], rootMargin: '-10% 0px -10% 0px' },
    )
    sections.forEach((s) => io.observe(s))
    updateActive(sections[0])
  }

  function mountSnap(sections) {
    if (reducedMotion() || sections.length === 0) return

    let index = 0
    let locking = false
    let wheelCoolUntil = 0

    const track = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!visible || locking) return
        const i = sections.indexOf(visible.target)
        if (i >= 0) index = i
      },
      { threshold: [0.4, 0.6, 0.85] },
    )
    sections.forEach((s) => track.observe(s))

    function unlockTransition() {
      locking = false
      document.documentElement.classList.remove('slide-transitioning')
      document.body.classList.remove('slide-transitioning')
    }

    function go(to) {
      const next = Math.max(0, Math.min(sections.length - 1, to))
      if (next === index || locking) return
      index = next
      locking = true
      wheelCoolUntil = performance.now() + WHEEL_COOLDOWN_MS
      document.documentElement.classList.add('slide-transitioning')
      document.body.classList.add('slide-transitioning')
      sections[next].scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.setTimeout(unlockTransition, TRANSITION_MS)
    }

    function step(delta) {
      go(index + delta)
    }

    /** 区内可滚：未顶/底时放行；顶/底再交给整页切换 */
    function shouldDeferToInnerScroll(e) {
      if (!(e.target instanceof Element)) return false
      const scroller = e.target.closest('[data-allow-scroll]')
      if (!(scroller instanceof HTMLElement)) return false
      const goingDown = e.deltaY > 0
      const goingUp = e.deltaY < 0
      const top = scroller.scrollTop <= 1
      const bottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
      if (goingDown && !bottom) return true
      if (goingUp && !top) return true
      return false
    }

    window.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
        if (shouldDeferToInnerScroll(e)) return
        e.preventDefault()
        if (locking) return
        if (performance.now() < wheelCoolUntil) return
        if (Math.abs(e.deltaY) < 8) return
        wheelCoolUntil = performance.now() + WHEEL_COOLDOWN_MS
        step(e.deltaY > 0 ? 1 : -1)
      },
      { passive: false },
    )

    window.addEventListener('keydown', (e) => {
      const el = document.activeElement
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      ) {
        return
      }
      if (locking) {
        if (
          e.key === 'ArrowDown' ||
          e.key === 'ArrowUp' ||
          e.key === 'PageDown' ||
          e.key === 'PageUp' ||
          e.key === ' '
        ) {
          e.preventDefault()
        }
        return
      }
      switch (e.key) {
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault()
          step(1)
          break
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault()
          step(-1)
          break
        case 'Home':
          e.preventDefault()
          go(0)
          break
        case 'End':
          e.preventDefault()
          go(sections.length - 1)
          break
        default:
          break
      }
    })

    let touchY = 0
    let touchT = 0
    let tracking = false

    window.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length > 1) {
          tracking = false
          return
        }
        if (e.target instanceof Element && e.target.closest('[data-allow-scroll]')) {
          tracking = false
          return
        }
        touchY = e.touches[0].clientY
        touchT = e.timeStamp
        tracking = true
      },
      { passive: true },
    )

    window.addEventListener(
      'touchmove',
      (e) => {
        if (!tracking) return
        if (e.touches.length > 1) return
        if (e.cancelable) e.preventDefault()
      },
      { passive: false },
    )

    window.addEventListener(
      'touchend',
      (e) => {
        if (!tracking) return
        tracking = false
        const dy = touchY - e.changedTouches[0].clientY
        const dt = Math.max(1, e.timeStamp - touchT)
        const speed = Math.abs(dy) / dt
        if (Math.abs(dy) > 40 || speed > 0.3) step(dy > 0 ? 1 : -1)
      },
      { passive: true },
    )

    window.addEventListener(
      'touchcancel',
      () => {
        tracking = false
      },
      { passive: true },
    )

    document.addEventListener('click', (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null
      if (!a) return
      const id = a.getAttribute('href')?.slice(1)
      if (!id) return
      const i = sections.findIndex((s) => s.id === id)
      if (i < 0) return
      e.preventDefault()
      go(i)
      history.replaceState(null, '', `#${id}`)
    })

    if (window.location.hash) {
      const id = window.location.hash.slice(1)
      const i = sections.findIndex((s) => s.id === id)
      if (i > 0) {
        setTimeout(() => {
          index = i
          sections[i].scrollIntoView({ behavior: 'auto', block: 'start' })
        }, 0)
      }
    }
  }

  function mountHeader() {
    const header = document.getElementById('site-header')
    if (!header) return
    const sync = () => header.classList.toggle('is-scrolled', window.scrollY > 16)
    sync()
    window.addEventListener('scroll', sync, { passive: true })
  }

  function init() {
    const sections = Array.from(document.querySelectorAll(SLIDE_SEL))
    if (!sections.length) return
    mountRail(sections)
    mountSnap(sections)
    mountHeader()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }
})()
