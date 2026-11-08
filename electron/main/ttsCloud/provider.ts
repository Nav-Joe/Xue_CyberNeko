import type { AppFetch } from './appFetch'
import type { TtsCloudConfig, TtsCloudSynthResult } from './types'

/** 已内置的云端语音服务。新家先加 id，再写适配器，不要在调用方写厂商分支。 */
export type CloudTtsProviderId = 'qwen' | 'seed' | 'edge'

export type CloudTtsCapabilities = {
  /** 用参考音登记一条声线 */
  clone: boolean
  /** 用文字描述设计一条声线 */
  design: boolean
}

export type CloudTtsSynthesizeArgs = {
  config: TtsCloudConfig
  text: string
  signal?: AbortSignal
  fetchImpl?: AppFetch
}

/**
 * 一家云端语音服务。
 * 合成是每家都要实现的。复刻和设计看 capabilities，没有就保持 false。
 * 语料预热和触摸缓存不在这里：它们只反复调用 synthesize，再把 wav 写进 tts-cloud-cache。
 */
export interface CloudTtsProvider {
  readonly id: CloudTtsProviderId
  readonly label: string
  readonly capabilities: CloudTtsCapabilities
  synthesize(args: CloudTtsSynthesizeArgs): Promise<TtsCloudSynthResult>
}

const providers = new Map<CloudTtsProviderId, CloudTtsProvider>()

export function registerCloudTtsProvider(provider: CloudTtsProvider): void {
  providers.set(provider.id, provider)
}

export function getCloudTtsProvider(id: CloudTtsProviderId): CloudTtsProvider | null {
  return providers.get(id) ?? null
}

export function listCloudTtsProviders(): readonly CloudTtsProvider[] {
  return [...providers.values()]
}

/**
 * 热路径用：只有已经切到云端模式才返回适配器。
 * 试听和预热不要用这个。那些路径在未切云端模式时也要能对 qwen 音色合成。
 */
export function resolveCloudTtsProvider(config: TtsCloudConfig): CloudTtsProvider | null {
  if (config.ttsBackend !== 'qwen' && config.ttsBackend !== 'seed' && config.ttsBackend !== 'edge') return null
  return getCloudTtsProvider(config.ttsBackend)
}
