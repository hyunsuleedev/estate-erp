import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  BookUser,
  Building2,
  CalendarDays,
  ListTodo,
  MessageSquareText,
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
import { ConsultationFormDialog } from '@/routes/_authenticated/consultations/-consultation-form-dialog'

/** 상단바 빠른 등록 (+) — 자주 쓰는 생성 진입점 모음 */
export function QuickCreate() {
  const navigate = useNavigate()
  // 상담은 전화를 받으며 바로 적는 일이라 화면을 옮기지 않고 이 자리에서 창을 연다.
  // 저장하면 상담 목록·대시보드의 최근 상담이 새로 고쳐진다(창이 'consultations' 캐시를 다시 부른다).
  const [consultOpen, setConsultOpen] = useState(false)

  return (
    <>
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
          <DropdownMenuItem onClick={() => setConsultOpen(true)}>
            <MessageSquareText />
            상담 적기
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* ?new=1: 화면을 연 뒤 입력창까지 바로 연다 */}
          <DropdownMenuItem onClick={() => navigate({ to: '/calendar', search: { new: true } })}>
            <CalendarDays />
            일정 추가
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate({ to: '/tasks', search: { new: true } })}>
            <ListTodo />
            업무 추가
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConsultationFormDialog open={consultOpen} onOpenChange={setConsultOpen} />
    </>
  )
}
