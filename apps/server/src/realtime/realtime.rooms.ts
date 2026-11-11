export const officeRoom = (officeId: string) => `office:${officeId}`;

/** 한 사용자의 모든 연결. 비활성화·비밀번호 재설정 때 이 방으로 한꺼번에 끊는다. */
export const userRoom = (userId: string) => `user:${userId}`;

export const listingRoom = (officeId: string, listingId: string) =>
  `listing:${officeId}:${listingId}`;

export const propertyRoom = (officeId: string, propertyId: string) =>
  `property:${officeId}:${propertyId}`;

export const listingIntakeRoom = (officeId: string, intakeId: string) =>
  `listing-intake:${officeId}:${intakeId}`;

/** 공동중개 네트워크 중개방 — 여러 사무소가 같은 채널을 공유한다 (officeId 없음). */
export const networkRoom = (roomId: string) => `network:room:${roomId}`;
