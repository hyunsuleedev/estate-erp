import type { RequestFn } from "../client.js";

export interface CommentTarget {
  projectId?: string;
  propertyId?: string;
  listingIntakeId?: string;
  buyerIntakeId?: string;
  dealId?: string;
}

export interface Comment {
  id: string;
  body: string;
  projectId?: string | null;
  propertyId?: string | null;
  listingIntakeId?: string | null;
  buyerIntakeId?: string | null;
  dealId?: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string } | null;
}

export interface CommentList {
  total: number;
  /** 다음(더 오래된) 쪽 커서. 더 없으면 null. */
  nextBefore: string | null;
  items: Comment[];
}

export function createCommentsApi(request: RequestFn) {
  return {
    /** 최근 쪽부터. target 중 정확히 하나만 지정해야 한다. */
    list: (
      target: CommentTarget,
      page?: { before?: string; limit?: number },
    ) =>
      request<CommentList>("/comments", {
        params: {
          ...target,
          ...page,
        } as Record<string, string | number | undefined>,
      }),
    create: (dto: CommentTarget & { body: string }) =>
      request<Comment>("/comments", {
        method: "POST",
        body: dto,
      }),
    update: (id: string, body: string) =>
      request<Comment>(`/comments/${id}`, {
        method: "PATCH",
        body: { body },
      }),
    remove: (id: string) =>
      request<{ success: boolean }>(`/comments/${id}`, {
        method: "DELETE",
      }),
  };
}
