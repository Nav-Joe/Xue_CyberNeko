<script setup lang="ts">
/** 三维雷达：分映射 [-10,10]→半径；纯 SVG，无第三方库 */
import { computed } from 'vue'

const props = defineProps<{
  closeness: number
  trust: number
  rapport: number
}>()

const SIZE = 220
const CX = SIZE / 2
const CY = SIZE / 2
const R = 88

/** 轴角：亲近上、信任右下、投契左下 */
const AXES = [
  { key: 'closeness' as const, label: '亲近', angle: -Math.PI / 2 },
  { key: 'trust' as const, label: '信任', angle: -Math.PI / 2 + (2 * Math.PI) / 3 },
  { key: 'rapport' as const, label: '投契', angle: -Math.PI / 2 + (4 * Math.PI) / 3 }
]

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(10, Math.max(-10, v))
}

/** -10→0，0→0.5，+10→1 */
function radiusRatio(score: number): number {
  return (clampScore(score) + 10) / 20
}

function pointAt(angle: number, ratio: number): { x: number; y: number } {
  return {
    x: CX + Math.cos(angle) * R * ratio,
    y: CY + Math.sin(angle) * R * ratio
  }
}

const gridPolygons = computed(() =>
  [0.25, 0.5, 0.75, 1].map((ratio) =>
    AXES.map((a) => {
      const p = pointAt(a.angle, ratio)
      return `${p.x},${p.y}`
    }).join(' ')
  )
)

const valuePolygon = computed(() => {
  const scores = {
    closeness: props.closeness,
    trust: props.trust,
    rapport: props.rapport
  }
  return AXES.map((a) => {
    const p = pointAt(a.angle, radiusRatio(scores[a.key]))
    return `${p.x},${p.y}`
  }).join(' ')
})

const labels = computed(() =>
  AXES.map((a) => {
    const tip = pointAt(a.angle, 1.18)
    return { ...a, x: tip.x, y: tip.y }
  })
)

const zeroRing = computed(() =>
  AXES.map((a) => {
    const p = pointAt(a.angle, 0.5)
    return `${p.x},${p.y}`
  }).join(' ')
)

const axisTips = computed(() =>
  AXES.map((a) => {
    const tip = pointAt(a.angle, 1)
    return { key: a.key, x2: tip.x, y2: tip.y }
  })
)
</script>

<template>
  <svg
    class="rel-radar"
    :viewBox="`0 0 ${SIZE} ${SIZE}`"
    role="img"
    aria-label="亲近、信任、投契雷达图"
  >
    <polygon
      v-for="(pts, i) in gridPolygons"
      :key="i"
      :points="pts"
      class="rel-radar__grid"
    />
    <polygon :points="zeroRing" class="rel-radar__zero" />
    <line
      v-for="a in axisTips"
      :key="a.key"
      :x1="CX"
      :y1="CY"
      :x2="a.x2"
      :y2="a.y2"
      class="rel-radar__axis"
    />
    <polygon :points="valuePolygon" class="rel-radar__value" />
    <text
      v-for="l in labels"
      :key="l.key"
      :x="l.x"
      :y="l.y"
      class="rel-radar__label"
      text-anchor="middle"
      dominant-baseline="middle"
    >
      {{ l.label }}
    </text>
  </svg>
</template>

<style scoped>
.rel-radar {
  width: 100%;
  max-width: 260px;
  height: auto;
  display: block;
  margin: 0 auto;
}

.rel-radar__grid {
  fill: none;
  stroke: #fbcfe8;
  stroke-width: 1;
}

.rel-radar__zero {
  fill: none;
  stroke: #f9a8d4;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
}

.rel-radar__axis {
  stroke: #f9a8d4;
  stroke-width: 1;
}

.rel-radar__value {
  fill: rgba(219, 39, 119, 0.28);
  stroke: #db2777;
  stroke-width: 2;
}

.rel-radar__label {
  fill: #9d174d;
  font-size: 12px;
  font-weight: 700;
}
</style>
