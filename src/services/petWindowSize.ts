/** 桌宠透明窗口：按不透明像素包围盒计算窗口尺寸 */

/** 整体缩放（越小猫娘越小） */
export const PET_DISPLAY_SCALE = 0.1

export const PET_FRAME_PADDING_X = 10
export const PET_FRAME_PADDING_TOP = 8
export const PET_FRAME_PADDING_BOTTOM = 8
export const PET_FRAME_MAX_WIDTH = 420
export const PET_FRAME_MAX_HEIGHT = 560
export const PET_FRAME_MIN_WIDTH = 160
export const PET_FRAME_MIN_HEIGHT = 200

export interface PetFrameSize {
  width: number
  height: number
  scale: number
}

export const PET_FRAME_PADDING = {
  x: PET_FRAME_PADDING_X,
  top: PET_FRAME_PADDING_TOP,
  bottom: PET_FRAME_PADDING_BOTTOM
}

/** 根据不透明包围盒尺寸计算桌宠窗口大小与模型缩放 */
export function computePetFrameFromOpaqueBounds(
  opaqueWidth: number,
  opaqueHeight: number
): PetFrameSize {
  const visualWidth = Math.max(opaqueWidth, 1)
  const visualHeight = Math.max(opaqueHeight, 1)
  let scale = PET_DISPLAY_SCALE

  const maxInnerW = PET_FRAME_MAX_WIDTH - PET_FRAME_PADDING_X * 2
  const maxInnerH =
    PET_FRAME_MAX_HEIGHT - PET_FRAME_PADDING_TOP - PET_FRAME_PADDING_BOTTOM

  if (visualWidth * scale > maxInnerW) {
    scale = maxInnerW / visualWidth
  }
  if (visualHeight * scale > maxInnerH) {
    scale = Math.min(scale, maxInnerH / visualHeight)
  }

  const width = Math.round(visualWidth * scale + PET_FRAME_PADDING_X * 2)
  const height = Math.round(
    visualHeight * scale + PET_FRAME_PADDING_TOP + PET_FRAME_PADDING_BOTTOM
  )

  return {
    width: Math.max(PET_FRAME_MIN_WIDTH, width),
    height: Math.max(PET_FRAME_MIN_HEIGHT, height),
    scale
  }
}
