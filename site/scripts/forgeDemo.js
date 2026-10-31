/**
 * 宣传页音色工坊：两个示意页来回切，里面都不能输入。
 */
(() => {
  const root = document.querySelector('#forgeStage')
  if (!root) return

  const tabs = Array.from(root.querySelectorAll('[data-forge-tab]'))
  const panels = Array.from(root.querySelectorAll('[data-forge-panel]'))

  function show(name) {
    tabs.forEach((tab) => {
      const on = tab.getAttribute('data-forge-tab') === name
      tab.classList.toggle('is-on', on)
      tab.setAttribute('aria-selected', on ? 'true' : 'false')
    })
    panels.forEach((panel) => {
      panel.hidden = panel.getAttribute('data-forge-panel') !== name
    })
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      show(tab.getAttribute('data-forge-tab') || 'update')
    })
  })
})()
