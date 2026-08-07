import { describe, expect, it, beforeEach } from 'vitest'

import {
  __resetMicDeviceCacheForTests,
  resolveMicChoice
} from '../micDevices'

describe('resolveMicChoice', () => {
  beforeEach(() => {
    __resetMicDeviceCacheForTests()
  })

  it('empty id uses system default', () => {
    expect(resolveMicChoice('', [{ deviceId: 'a', label: 'Mic A' }])).toEqual({
      label: '系统默认',
      missing: false
    })
  })

  it('matches configured deviceId', () => {
    expect(
      resolveMicChoice('dev-2', [
        { deviceId: 'dev-1', label: 'Mic 1' },
        { deviceId: 'dev-2', label: 'Mic 2' }
      ])
    ).toEqual({ deviceId: 'dev-2', label: 'Mic 2', missing: false })
  })

  it('marks missing when saved id not in list', () => {
    expect(resolveMicChoice('gone', [{ deviceId: 'a', label: 'A' }])).toEqual({
      deviceId: 'gone',
      label: '已保存的麦克风（当前列表中未找到）',
      missing: true
    })
  })
})
