export const officeRoom = (officeId: string) => `office:${officeId}`;

export const listingRoom = (officeId: string, listingId: string) =>
  `listing:${officeId}:${listingId}`;

export const propertyRoom = (officeId: string, propertyId: string) =>
  `property:${officeId}:${propertyId}`;

export const listingIntakeRoom = (officeId: string, intakeId: string) =>
  `listing-intake:${officeId}:${intakeId}`;

/** 공동중개 네트워크 중개방 — 여러 사무소가 같은 채널을 공유한다 (officeId 없음). */
export const networkRoom = (roomId: string) => `network:room:${roomId}`;
