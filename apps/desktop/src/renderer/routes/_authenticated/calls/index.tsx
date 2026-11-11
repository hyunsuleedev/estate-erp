import { createFileRoute, redirect } from '@tanstack/react-router';

// 통화는 상담의 일부라 상담분석으로 합쳤다 (아직 상담이 아닌 녹음은 상담분석 위 '연결 대기'). 예전 주소로 들어오면 상담분석으로 보낸다.
export const Route = createFileRoute('/_authenticated/calls/')({
  beforeLoad: () => {
    throw redirect({ to: '/consultations' });
  },
});
