/** 摸摸计数类型（与语料 BodyPart 对齐） */

export type PetTouchPart = 'head' | 'arms' | 'body' | 'legs' | 'tail'

export const PET_TOUCH_PARTS: PetTouchPart[] = ['head', 'arms', 'body', 'legs', 'tail']

export const PET_TOUCH_PART_LABELS: Record<PetTouchPart, string> = {
  head: '头部',
  arms: '手臂',
  body: '身体',
  legs: '腿部',
  tail: '尾巴'
}

/** 每日亲近加分封顶（全部位合计） */
export const PET_TOUCH_AFFECTION_DAILY_CAP = 10

export type PetTouchDaySnapshot = {
  dayKey: string
  counts: Record<PetTouchPart, number>
  total: number
  affectionGrants: number
  affectionCap: number
}

export type RecordPetTouchResult = PetTouchDaySnapshot & {
  /** 本次是否授予 +0.01 亲近 */
  affectionGranted: boolean
}
