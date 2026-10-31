/**
 * 功能页 01 演示区草稿：剪影可拖、可点。
 * 真 Live2D 接入时，可把同一 #petDemoStage 换成 canvas 渲染，交互语义不变。
 */
(() => {
  const stage = document.getElementById('petDemoStage')
  const pet = document.getElementById('petDemoPet')
  if (!stage || !pet) return

  let dragging = false
  let moved = false
  let offsetX = 0
  let offsetY = 0
  let startX = 0
  let startY = 0

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n))
  }

  function placeCenter() {
    const sr = stage.getBoundingClientRect()
    const pr = pet.getBoundingClientRect()
    const left = (sr.width - pr.width) / 2
    const top = sr.height * 0.28
    pet.style.left = `${left}px`
    pet.style.top = `${top}px`
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return
    dragging = true
    moved = false
    pet.classList.add('is-dragging')
    pet.setPointerCapture?.(e.pointerId)
    const sr = stage.getBoundingClientRect()
    const left = parseFloat(pet.style.left || '0')
    const top = parseFloat(pet.style.top || '0')
    offsetX = e.clientX - sr.left - left
    offsetY = e.clientY - sr.top - top
    startX = e.clientX
    startY = e.clientY
  }

  function onPointerMove(e) {
    if (!dragging) return
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 4) moved = true
    const sr = stage.getBoundingClientRect()
    const pr = pet.getBoundingClientRect()
    const maxX = sr.width - pr.width
    const maxY = sr.height - pr.height - 28
    const x = clamp(e.clientX - sr.left - offsetX, 8, Math.max(8, maxX - 8))
    const y = clamp(e.clientY - sr.top - offsetY, 36, Math.max(36, maxY))
    pet.style.left = `${x}px`
    pet.style.top = `${y}px`
  }

  function onPointerUp(e) {
    if (!dragging) return
    dragging = false
    pet.classList.remove('is-dragging')
    try {
      pet.releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    if (!moved) {
      pet.classList.remove('is-tap')
      // reflow so animation can replay
      void pet.offsetWidth
      pet.classList.add('is-tap')
    }
  }

  pet.addEventListener('pointerdown', onPointerDown)
  pet.addEventListener('pointermove', onPointerMove)
  pet.addEventListener('pointerup', onPointerUp)
  pet.addEventListener('pointercancel', onPointerUp)
  pet.addEventListener('animationend', () => pet.classList.remove('is-tap'))

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', placeCenter, { once: true })
  } else {
    placeCenter()
  }
  window.addEventListener('resize', placeCenter)
})()
