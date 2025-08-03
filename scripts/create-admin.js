const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    const email = 'admin@wwebjs.com';
    const password = 'admin123';
    
    // Check if admin already exists
    const existing = await prisma.admin.findUnique({
      where: { email }
    });
    
    if (existing) {
      console.log('Admin already exists');
      return;
    }
    
    // Create admin
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: {
        email,
        passwordHash: hashedPassword,
        name: 'Admin User',
        role: 'SUPER_ADMIN',
        isActive: true
      }
    });
    
    console.log('Admin created successfully:', {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role
    });
    
  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();