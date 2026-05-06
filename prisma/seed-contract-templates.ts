import { PrismaClient } from '@prisma/client';
import {
  seedContractTemplateBodies,
  seedOfficeContractTemplateDefaults,
} from './contract-template-catalog';

export async function seedContractTemplates(prisma: PrismaClient) {
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
