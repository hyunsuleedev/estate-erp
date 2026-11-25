import { Link } from '@tanstack/react-router'
import { MapPinOff } from 'lucide-react'

import { EmptyState } from '@/components/domain'
import { Button } from '@/components/ui/button'

/**
 * 없는 주소로 들어왔을 때(지운 화면의 주소를 쥔 채 다시 연 탭, 잘못 붙여 넣은 주소).
 * 예전에는 라우터 기본값인 "Not Found" 한 줄만 흰 바탕에 떠 돌아갈 길이 없었다.
 * 라우터 전체의 기본 화면으로 쓴다(main.tsx의 defaultNotFoundComponent).
 */
export function NotFoundScreen() {
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center bg-background px-4">
      <EmptyState
        icon={MapPinOff}
        title="찾는 화면이 없습니다"
        description="주소가 바뀌었거나 없어진 화면입니다. 대시보드에서 다시 찾아 주세요."
        action={
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard">대시보드로 가기</Link>
          </Button>
        }
      />
    </div>
  )
}
