import { useNavigate } from '@tanstack/react-router'
import {
  BookUser,
  Building2,
  CalendarDays,
  ListTodo,
  Plus,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** 상단바 빠른 등록 (+) — 자주 쓰는 생성 진입점 모음 */
export function QuickCreate() {
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-8 gap-1">
          <Plus className="size-4" />
          <span className="hidden sm:inline">빠른 등록</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => navigate({ to: '/properties/new' })}>
          <Building2 />
          매물 등록
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate({ to: '/contacts/new' })}>
          <BookUser />
          연락처 추가
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: '/calendar' })}>
          <CalendarDays />
          일정 추가
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate({ to: '/tasks' })}>
          <ListTodo />
          업무 추가
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
