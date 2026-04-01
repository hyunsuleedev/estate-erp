import { PrismaClient } from '@prisma/client';
import { seedLegalDong } from './seed-legal-dong';
import { seedTestOffice } from './seed-test-office';

async function main() {
  const prisma = new PrismaClient();

  try {
    await seedLegalDong(prisma);
    await seedTestOffice(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Seed 실패:', e);
  process.exit(1);
});
