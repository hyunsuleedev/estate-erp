export const officeRoom = (officeId: string) => `office:${officeId}`;

export const listingRoom = (officeId: string, listingId: string) =>
  `listing:${officeId}:${listingId}`;

export const propertyRoom = (officeId: string, propertyId: string) =>
  `property:${officeId}:${propertyId}`;

export const listingIntakeRoom = (officeId: string, intakeId: string) =>
  `listing-intake:${officeId}:${intakeId}`;
