import { PrismaClient } from '@prisma/client';
import {
  seedContractTemplateBodies,
  seedContractTemplateDefinitions,
  seedOfficeContractTemplateDefaults,
} from './contract-template-catalog';

export async function seedContractTemplates(prisma: PrismaClient) {
  // 신규 전역 템플릿 정의(레거시 갭 보강 코드)를 먼저 upsert해야
  // 아래 body 시드가 해당 코드의 metadata(documentEngine)를 채울 수 있다.
  await seedContractTemplateDefinitions(prisma);
  await seedContractTemplateBodies(prisma);

  const offices = await prisma.office.findMany({
    where: { isActive: true },
    select: {
      id: true,
      users: {
        where: { isActive: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, role: true },
      },
    },
  });

  for (const office of offices) {
    const owner = office.users.find((user) => user.role === 'owner') ?? office.users[0];
    await seedOfficeContractTemplateDefaults(prisma, office.id, owner?.id ?? null);
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();

  seedContractTemplates(prisma)
    .then(() => {
      console.log('계약 문서 템플릿 seed 완료');
    })
    .catch((error) => {
      console.error('계약 문서 템플릿 seed 실패:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
