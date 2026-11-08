import { registerCloudTtsProvider, type CloudTtsProvider } from '../provider'
import { synthesizeSeedTtsHttp } from '../seedTtsClient'

/** 火山引擎豆包 Seed-TTS。复刻不在这一步。 */
export const seedCloudTtsProvider: CloudTtsProvider = {
  id: 'seed',
  label: 'Seed',
  capabilities: {
    clone: false,
    design: false
  },
  synthesize(args) {
    return synthesizeSeedTtsHttp({
      config: args.config,
      text: args.text,
      signal: args.signal,
      fetchImpl: args.fetchImpl
    })
  }
}

registerCloudTtsProvider(seedCloudTtsProvider)
