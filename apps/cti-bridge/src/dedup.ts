/**
 * 채널/시퀀스 기반 착신 중복 억제.
 *
 * 레거시는 프로바이더 핸들러마다 직전 채널 문자열을 비교했다
 * (sKTPreChannel = caller|seqno, sLGUPreChannel = rechannel|uniqueid).
 * 여기서는 TTL 캐시로 일반화 — 같은 channelKey가 TTL 안에 다시 오면 무시한다.
 * 서버도 CallEvent [officeId, channelKey] unique로 2차 방어한다.
 */
export class ChannelDedup {
  private readonly seen = new Map<string, number>();

  constructor(private readonly ttlMs = 30_000) {}

  /** true = 처음 보는 키 (처리해야 함), false = TTL 내 중복 (무시) */
  shouldProcess(channelKey: string, now = Date.now()): boolean {
    this.prune(now);

    const seenAt = this.seen.get(channelKey);
    if (seenAt !== undefined && now - seenAt < this.ttlMs) {
      return false;
    }

    this.seen.set(channelKey, now);
    return true;
  }

  private prune(now: number) {
    for (const [key, seenAt] of this.seen) {
      if (now - seenAt >= this.ttlMs) {
        this.seen.delete(key);
      }
    }
  }
}
