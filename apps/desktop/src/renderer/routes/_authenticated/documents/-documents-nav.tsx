import { Link } from '@tanstack/react-router';
import { FileTextIcon, ImageIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const TABS = [
  { to: '/documents', label: '공적장부', icon: FileTextIcon, exact: true },
  { to: '/documents/photos', label: '매물 사진', icon: ImageIcon, exact: false },
] as const;

/** 자료실 하위 탭 — 공적장부 발급 이력 / 매물 사진 브라우저 전환. */
export function DocumentsNav() {
  return (
    <div className="mb-4 flex gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          activeOptions={{ exact: tab.exact }}
          className={cn(
            '-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
          )}
          activeProps={{
            className: 'border-primary font-medium text-foreground',
          }}
        >
          <tab.icon className="size-4" />
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
