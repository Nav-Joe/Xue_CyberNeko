/** 语料库分区，与 Live2D 点击部位对应 */
export type BodyPart = 'head' | 'arms' | 'body' | 'legs' | 'tail'

export type CorpusData = Record<BodyPart, string[]>
