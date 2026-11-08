import { registerCloudTtsProvider, type CloudTtsProvider } from '../provider'
import { synthesizeEdgeTts } from '../edgeTtsClient'

/** 微软 Edge 在线语音。不需要 API Key，声线用 Neural 名称。 */
export const edgeCloudTtsProvider: CloudTtsProvider = {
  id: 'edge',
  label: 'Edge',
  capabilities: {
    clone: false,
    design: false
  },
  synthesize(args) {
    return synthesizeEdgeTts({
      config: args.config,
      text: args.text,
      signal: args.signal
    })
  }
}

registerCloudTtsProvider(edgeCloudTtsProvider)
