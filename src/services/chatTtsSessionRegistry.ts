export type ChatTtsAbortHandle = {
  abort(): void
}

let activeSession: ChatTtsAbortHandle | null = null

export function setActiveChatTtsSession(session: ChatTtsAbortHandle | null): void {
  activeSession = session
}

export function abortActiveChatTtsSession(): void {
  activeSession?.abort()
  activeSession = null
}
