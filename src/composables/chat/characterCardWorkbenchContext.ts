import { inject, type InjectionKey } from 'vue'

import type { useCharacterCardWorkbench } from './useCharacterCardWorkbench'

export type CharacterCardWorkbench = ReturnType<typeof useCharacterCardWorkbench>

export const CHARACTER_CARD_WORKBENCH_KEY: InjectionKey<CharacterCardWorkbench> =
  Symbol('characterCardWorkbench')

export function useCharacterCardWorkbenchContext(): CharacterCardWorkbench {
  const workbench = inject(CHARACTER_CARD_WORKBENCH_KEY)
  if (!workbench) {
    throw new Error('CharacterCardWorkbench 未注入，请在 ChatSettingsView 内使用')
  }
  return workbench
}
