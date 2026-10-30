import type { RequestFn } from "../client.js";
export interface PublicListingSettings {
  updatedAt: string;
  id: string;
  officeId: string;
  listingId: string;
  title: string;
  description: string;
  photoUrls: string[];
  isPublished: boolean;
}
export type SavePublicListing = Pick<
  PublicListingSettings,
  "title" | "description" | "photoUrls" | "isPublished"
>;
export function createPublicListingsApi(request: RequestFn) {
  return {
    settings: (listingId: string) =>
      request<PublicListingSettings | null>(
        `/public-listings/listing/${listingId}`,
      ),
    save: (listingId: string, body: SavePublicListing) =>
      request<PublicListingSettings>(`/public-listings/listing/${listingId}`, {
        method: "PUT",
        body,
      }),
  };
}
