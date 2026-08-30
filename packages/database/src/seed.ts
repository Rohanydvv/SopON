import { prisma } from './index';

async function main() {
  console.log('Seeding initial data...');
  // Baseline initial seed
  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
