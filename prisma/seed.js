const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Check if super admin already exists
  const existingAdmin = await prisma.admin.findFirst({
    where: { role: 'SUPER_ADMIN' },
  });

  if (existingAdmin) {
    console.log('✓ Super admin already exists');
    return;
  }

  // Create super admin
  const password = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123!';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const admin = await prisma.admin.create({
    data: {
      email: process.env.SUPER_ADMIN_EMAIL || 'admin@wwebjs.com',
      passwordHash,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  console.log('✓ Super admin created:', admin.email);

  // Create default permissions for super admin
  const resources = ['USERS', 'SESSIONS', 'SYSTEM', 'ANALYTICS', 'LOGS', 'BILLING'];
  const actions = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE'];

  const permissions = [];
  for (const resource of resources) {
    for (const action of actions) {
      // Skip invalid combinations
      if (resource === 'ANALYTICS' && ['CREATE', 'UPDATE', 'DELETE'].includes(action)) continue;
      if (resource === 'LOGS' && ['CREATE', 'UPDATE'].includes(action)) continue;
      
      permissions.push({
        adminId: admin.id,
        resource,
        action,
        granted: true,
      });
    }
  }

  await prisma.permission.createMany({
    data: permissions,
  });

  console.log(`✓ Created ${permissions.length} permissions for super admin`);
  console.log('');
  console.log('🎉 Database seeding completed!');
  console.log('');
  console.log('Login credentials:');
  console.log(`Email: ${admin.email}`);
  console.log(`Password: ${password}`);
  console.log('');
  console.log('⚠️  Please change the password after first login!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });