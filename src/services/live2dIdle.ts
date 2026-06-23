import type { Live2DModel } from 'pixi-live2d-display/cubism4'

/** 占位组名：库在无动作时会尝试播放 Idle，指向不存在的组即可静默跳过 */
const DISABLED_IDLE_GROUP = '__quiet_idle_disabled__'

export const QUIET_IDLE_MODEL_OPTIONS = {
  autoInteract: false,
  autoUpdate: true,
  idleMotionGroup: DISABLED_IDLE_GROUP,
  motionPreload: 'NONE' as const
}

/** 待机：不播 Idle 动作，保留物理 / 呼吸 / 眨眼 / 鼠标视角跟随 */
export function configureQuietIdle(model: Live2DModel): void {
  const motionManager = model.internalModel.motionManager
  motionManager.groups.idle = DISABLED_IDLE_GROUP
  motionManager.stopAllMotions()
}
