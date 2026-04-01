import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const DEMO_PASSWORD = 'estate1234';

export async function seedTestOffice(prisma: PrismaClient) {
  console.log('\n4. 테스트 사무소/사용자 seed...');

  const office = await prisma.office.upsert({
    where: { code: 'GD7291' },
    update: {
      name: '강동 부동산',
      licenseNo: '11740-2026-0001',
      ceoName: '홍대표',
      phone: '02-1234-5678',
      address: '서울특별시 강동구 고덕로 123',
      subscription: 'pro',
      maxUsers: 10,
      isActive: true,
      commissionConfig: {
        distributionType: 'percentage',
        defaultAgentRate: 50,
        listingAgentRate: 50,
        buyingAgentRate: 50,
        dualAgentRate: 70,
        managerRate: 10,
        closerBonus: 0,
      },
    },
    create: {
      code: 'GD7291',
      name: '강동 부동산',
      licenseNo: '11740-2026-0001',
      ceoName: '홍대표',
      phone: '02-1234-5678',
      address: '서울특별시 강동구 고덕로 123',
      subscription: 'pro',
      maxUsers: 10,
      isActive: true,
      commissionConfig: {
        distributionType: 'percentage',
        defaultAgentRate: 50,
        listingAgentRate: 50,
        buyingAgentRate: 50,
        dualAgentRate: 70,
        managerRate: 10,
        closerBonus: 0,
      },
    },
  });

  const password = await bcrypt.hash(DEMO_PASSWORD, 10);

  const demoUsers = [
    {
      loginId: 'owner@gd7291.test',
      email: 'owner@gd7291.test',
      name: '홍대표',
      phone: '010-1000-1000',
      role: 'owner',
    },
    {
      loginId: 'GD7291-0001',
      email: 'manager@gd7291.test',
      name: '김팀장',
      phone: '010-1000-1001',
      role: 'manager',
    },
    {
      loginId: 'GD7291-0002',
      email: 'agent@gd7291.test',
      name: '이중개',
      phone: '010-1000-1002',
      role: 'agent',
    },
  ] as const;

  for (const user of demoUsers) {
    await prisma.user.upsert({
      where: { loginId: user.loginId },
      update: {
        officeId: office.id,
        email: user.email,
        password,
        name: user.name,
        phone: user.phone,
        role: user.role,
        isActive: true,
      },
      create: {
        officeId: office.id,
        loginId: user.loginId,
        email: user.email,
        password,
        name: user.name,
        phone: user.phone,
        role: user.role,
        isActive: true,
      },
    });
  }

  console.log(`   사무소: ${office.name} (${office.code})`);
  console.log(`   사용자: ${demoUsers.map((user) => user.loginId).join(', ')}`);
  console.log(`   공통 비밀번호: ${DEMO_PASSWORD}`);
}

if (require.main === module) {
  const prisma = new PrismaClient();

  seedTestOffice(prisma)
    .catch((e) => {
      console.error('Seed 실패:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
