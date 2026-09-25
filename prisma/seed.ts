import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create users
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const adminHash = await bcrypt.hash('Admin123!', 10);

  const user = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      name: 'Asha Rao',
      email: 'user@example.com',
      passwordHash,
      role: 'USER',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      name: 'Raj Admin',
      email: 'admin@example.com',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });

  // Create diagnostic centres
  const centre1 = await prisma.diagnosticCentre.upsert({
    where: { id: 'centre-1' },
    update: {},
    create: {
      id: 'centre-1',
      name: 'HealthFirst Diagnostics',
      location: 'Bengaluru',
    },
  });

  const centre2 = await prisma.diagnosticCentre.upsert({
    where: { id: 'centre-2' },
    update: {},
    create: {
      id: 'centre-2',
      name: 'MediCare Labs',
      location: 'Mumbai',
    },
  });

  const centre3 = await prisma.diagnosticCentre.upsert({
    where: { id: 'centre-3' },
    update: {},
    create: {
      id: 'centre-3',
      name: 'CityHealth Diagnostics',
      location: 'Delhi',
    },
  });

  // Create diagnostic tests
  const test1 = await prisma.diagnosticTest.upsert({
    where: { id: 'test-1' },
    update: {},
    create: {
      id: 'test-1',
      name: 'Complete Blood Count',
      description: 'Measures different components of blood including red cells, white cells, and platelets',
    },
  });

  const test2 = await prisma.diagnosticTest.upsert({
    where: { id: 'test-2' },
    update: {},
    create: {
      id: 'test-2',
      name: 'Lipid Profile',
      description: 'Measures cholesterol levels including HDL, LDL, and triglycerides',
    },
  });

  const test3 = await prisma.diagnosticTest.upsert({
    where: { id: 'test-3' },
    update: {},
    create: {
      id: 'test-3',
      name: 'Blood Glucose Fasting',
      description: 'Measures blood sugar levels after fasting for 8-12 hours',
    },
  });

  const test4 = await prisma.diagnosticTest.upsert({
    where: { id: 'test-4' },
    update: {},
    create: {
      id: 'test-4',
      name: 'Thyroid Profile',
      description: 'Measures TSH, T3, and T4 levels to assess thyroid function',
    },
  });

  const test5 = await prisma.diagnosticTest.upsert({
    where: { id: 'test-5' },
    update: {},
    create: {
      id: 'test-5',
      name: 'Liver Function Test',
      description: 'Measures liver enzymes and proteins to assess liver health',
    },
  });

  // Link centres to tests with prices
  const centreTests = [
    { centreId: centre1.id, testId: test1.id, price: 450 },
    { centreId: centre1.id, testId: test2.id, price: 900 },
    { centreId: centre1.id, testId: test3.id, price: 200 },
    { centreId: centre1.id, testId: test4.id, price: 650 },
    { centreId: centre2.id, testId: test1.id, price: 500 },
    { centreId: centre2.id, testId: test2.id, price: 850 },
    { centreId: centre2.id, testId: test5.id, price: 700 },
    { centreId: centre3.id, testId: test1.id, price: 400 },
    { centreId: centre3.id, testId: test3.id, price: 250 },
    { centreId: centre3.id, testId: test4.id, price: 600 },
    { centreId: centre3.id, testId: test5.id, price: 750 },
  ];

  for (const ct of centreTests) {
    await prisma.centreTest.upsert({
      where: {
        centreId_testId: { centreId: ct.centreId, testId: ct.testId },
      },
      update: { price: ct.price },
      create: ct,
    });
  }

  console.log('Seed completed:');
  console.log(`  Users: ${user.email} (USER), ${admin.email} (ADMIN)`);
  console.log(`  Password: Password123! / Admin123!`);
  console.log(`  Centres: ${centre1.name}, ${centre2.name}, ${centre3.name}`);
  console.log(`  Tests: ${test1.name}, ${test2.name}, ${test3.name}, ${test4.name}, ${test5.name}`);
  console.log(`  CentreTests: ${centreTests.length} links created`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });