import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const typeLabels: Record<string, string> = {
  phone: '전화', visit: '방문', online: '온라인',
};

export const Route = createFileRoute('/_authenticated/contacts/$id')({
  component: ContactDetailPage,
});

function ContactDetailPage() {
  const { id } = Route.useParams();

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contacts', id],
    queryFn: () => api.contacts.findOne(id),
  });

  const { data: consultations } = useQuery({
    queryKey: ['contacts', id, 'consultations'],
    queryFn: () => api.contacts.getConsultations(id),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!contact) return <div className="py-12 text-center text-sm text-muted-foreground">연락처를 찾을 수 없습니다.</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-7" asChild>
          <Link to="/contacts">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">{contact.name}</h1>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="info">기본 정보</TabsTrigger>
          <TabsTrigger value="consultations">상담 이력</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="rounded-xl bg-muted/50 p-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="이름" value={contact.name} />
              <Field label="전화번호" value={contact.phone} mono />
              {contact.phone2 && <Field label="보조 전화" value={contact.phone2} mono />}
              <Field label="이메일" value={contact.email} />
              {contact.tags?.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">태그</dt>
                  <dd className="mt-1 flex gap-1">
                    {contact.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {contact.memo && (
                <div className="sm:col-span-2">
                  <dt className="mb-1.5 text-xs font-medium text-muted-foreground">메모</dt>
                  <dd className="whitespace-pre-wrap rounded-lg bg-background px-3 py-2.5 text-sm leading-relaxed">
                    {contact.memo}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </TabsContent>

        <TabsContent value="consultations">
          <div className="rounded-xl bg-muted/50 p-5">
            {!consultations || (consultations as unknown[]).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">상담 이력이 없습니다.</p>
            ) : (
              <ul className="space-y-2.5">
                {(consultations as { id: string; type: string; content: string; createdAt: string }[]).map((c) => (
                  <li key={c.id} className="rounded-lg bg-background px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="size-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">
                          {typeLabels[c.type] ?? c.type}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed">{c.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium ${mono ? 'tabular-nums' : ''}`}>{value ?? '-'}</dd>
    </div>
  );
}
