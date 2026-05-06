import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  seedContractTemplateBodies,
  seedOfficeContractTemplateDefaults,
} from './contract-template-catalog';

const DEMO_PASSWORD = 'estate1234';
const TEST_OFFICE_LICENSE_NO = '11740-2026-0001';

const TEST_OFFICE_DATA = {
  name: '강동 부동산',
  licenseNo: TEST_OFFICE_LICENSE_NO,
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
};

export async function seedTestOffice(prisma: PrismaClient) {
  console.log('\n4. 테스트 사무소/사용자 seed...');

  const existingOffice = await prisma.office.findFirst({
    where: { licenseNo: TEST_OFFICE_LICENSE_NO },
  });

  const office = existingOffice
    ? await prisma.office.update({
        where: { id: existingOffice.id },
        data: TEST_OFFICE_DATA,
      })
    : await prisma.office.create({
        data: TEST_OFFICE_DATA,
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

  const seededUsers = [];
  for (const user of demoUsers) {
    const seededUser = await prisma.user.upsert({
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
    seededUsers.push(seededUser);
  }

  const owner = seededUsers.find((user) => user.role === 'owner') ?? seededUsers[0];
  await seedContractTemplateBodies(prisma);
  await seedOfficeContractTemplateDefaults(prisma, office.id, owner?.id ?? null);

  console.log(`   사무소: ${office.name}`);
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
