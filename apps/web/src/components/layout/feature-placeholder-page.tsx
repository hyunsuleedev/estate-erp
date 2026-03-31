import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type FeaturePlaceholderPageProps = {
  title: string
  description: string
  icon: LucideIcon
  checklist: string[]
}

export function FeaturePlaceholderPage({
  title,
  description,
  icon: Icon,
  checklist,
}: FeaturePlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Badge variant="outline" className="w-fit">
          임시 연결
        </Badge>
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardHeader>
          <CardTitle>기본 진입 화면을 먼저 연결했습니다.</CardTitle>
          <CardDescription>
            실제 데이터 화면은 다음 항목들을 중심으로 확장하면 됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {checklist.map((item) => (
            <div
              key={item}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-background px-4 py-3"
            >
              <span className="mt-1 size-2 shrink-0 rounded-full bg-primary/70" />
              <p className="text-sm text-foreground/90">{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
