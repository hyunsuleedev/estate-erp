import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PublicListingSettings,
  SavePublicListing,
} from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

export function PublicListingEditor({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["public-listing", listingId],
    queryFn: () => api.publicListings.settings(listingId),
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="mt-2">
          공개 매물 설정
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>고객에게 공개할 매물</DialogTitle>
          <DialogDescription>
            공개용 설명과 사진을 입력하세요. 가격은 현재 거래 조건과 연동됩니다.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p role="status">불러오는 중…</p>
        ) : query.isError ? (
          <div role="alert">
            설정을 불러오지 못했습니다.{" "}
            <Button onClick={() => query.refetch()}>다시 시도</Button>
          </div>
        ) : (
          <Editor
            key={listingId}
            listingId={listingId}
            initial={query.data ?? null}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function Editor({
  listingId,
  initial,
}: {
  listingId: string;
  initial: (PublicListingSettings & { updatedAt?: string }) | null;
}) {
  const cache = useQueryClient();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [photos, setPhotos] = useState(initial?.photoUrls.join("\n") ?? "");
  const [published, setPublished] = useState(initial?.isPublished ?? false);
  const [saved, setSaved] = useState(initial);
  const [notice, setNotice] = useState("");
  const mutation = useMutation({
    mutationFn: (body: SavePublicListing) =>
      api.publicListings.save(listingId, body),
    onSuccess: (value) => {
      setSaved(value);
      setNotice("저장했습니다.");
      void cache.invalidateQueries({ queryKey: ["public-listing", listingId] });
    },
  });
  const origin =
    import.meta.env.VITE_PUBLIC_CATALOG_URL ||
    (import.meta.env.DEV ? "http://localhost:5180" : "");
  const url =
    saved && origin ? `${origin.replace(/\/$/, "")}/homes/${saved.id}` : "";
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setNotice("");
        mutation.mutate({
          title,
          description,
          photoUrls: photos
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          isPublished: published,
        });
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>공개 제목</span>
        <Input
          required
          minLength={2}
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>매물 소개</span>
        <Textarea
          rows={5}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="채광, 주변 환경, 방문 가능 시간 등을 소개하세요."
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>공개 사진 주소 (HTTPS, 한 줄에 하나, 최대 12장)</span>
        <Textarea
          rows={3}
          value={photos}
          onChange={(e) => setPhotos(e.target.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        공개 권한이 있는 사진을 사용하세요. 설명과 사진에 소유자 연락처·호수 등
        비공개 정보가 없는지 확인해 주세요.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
        />
        고객에게 공개
      </label>
      <p className="text-xs text-muted-foreground">
        사무소 연락처·등록번호·대표자·주소가 함께 표시됩니다. 보류·계약 중·종료
        상태에서는 노출되지 않으며, 다시 거래 가능해지면 공개 설정에 따라
        노출됩니다.
      </p>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <p role="status" className="text-sm">
        {notice}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "저장 중…" : "저장"}
        </Button>
        {saved?.isPublished && url && (
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setNotice("공개 매물 링크를 복사했습니다.");
              } catch {
                setNotice("링크를 직접 선택해 복사해 주세요.");
              }
            }}
          >
            링크 복사
          </Button>
        )}
      </div>
      {saved?.isPublished && url && (
        <label className="block text-xs">
          공개 매물 링크
          <Input readOnly value={url} onFocus={(e) => e.target.select()} />
        </label>
      )}
      {saved?.isPublished && origin && (
        <label className="block text-xs">
          사무소 매물 목록 링크
          <Input
            readOnly
            value={`${origin.replace(/\/$/, "")}/offices/${saved.officeId}`}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
      {saved?.isPublished && !origin && (
        <p className="text-sm">공개 사이트 주소가 설정되지 않았습니다.</p>
      )}
    </form>
  );
}
