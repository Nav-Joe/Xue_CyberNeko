import { synthesizeQwenTtsHttp } from '../qwenTtsClient'
import { registerCloudTtsProvider, type CloudTtsProvider } from '../provider'

/** 阿里百炼。复刻和设计仍在 cloudVoiceOps，这里只接合成。 */
export const qwenCloudTtsProvider: CloudTtsProvider = {
  id: 'qwen',
  label: '阿里云',
  capabilities: {
    clone: true,
    design: true
  },
  synthesize(args) {
    return synthesizeQwenTtsHttp({
      config: args.config,
      text: args.text,
      signal: args.signal,
      fetchImpl: args.fetchImpl
    })
  }
}

registerCloudTtsProvider(qwenCloudTtsProvider)
