const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const permissions = [
  // Users
  { name: 'View Users', resource: 'USERS', action: 'READ', description: 'View user list and details' },
  { name: 'Create Users', resource: 'USERS', action: 'CREATE', description: 'Create new users' },
  { name: 'Update Users', resource: 'USERS', action: 'UPDATE', description: 'Update user information' },
  { name: 'Delete Users', resource: 'USERS', action: 'DELETE', description: 'Delete users' },
  
  // Sessions
  { name: 'View Sessions', resource: 'SESSIONS', action: 'READ', description: 'View session list and details' },
  { name: 'Manage Sessions', resource: 'SESSIONS', action: 'UPDATE', description: 'Start, stop, restart sessions' },
  { name: 'Delete Sessions', resource: 'SESSIONS', action: 'DELETE', description: 'Delete sessions' },
  
  // Analytics
  { name: 'View Analytics', resource: 'ANALYTICS', action: 'READ', description: 'View analytics and reports' },
  
  // Logs
  { name: 'View Logs', resource: 'LOGS', action: 'READ', description: 'View system and audit logs' },
  { name: 'Export Logs', resource: 'LOGS', action: 'EXECUTE', description: 'Export log data' },
  { name: 'Purge Logs', resource: 'LOGS', action: 'DELETE', description: 'Delete old logs' },
  
  // System
  { name: 'View System Status', resource: 'SYSTEM', action: 'READ', description: 'View system health and status' },
  { name: 'Manage System', resource: 'SYSTEM', action: 'UPDATE', description: 'Update system settings' },
  
  // Roles
  { name: 'View Roles', resource: 'ROLES', action: 'READ', description: 'View roles and permissions' },
  { name: 'Create Roles', resource: 'ROLES', action: 'CREATE', description: 'Create new roles' },
  { name: 'Update Roles', resource: 'ROLES', action: 'UPDATE', description: 'Update role permissions' },
  { name: 'Delete Roles', resource: 'ROLES', action: 'DELETE', description: 'Delete roles' },
  
  // Settings
  { name: 'View Settings', resource: 'SETTINGS', action: 'READ', description: 'View system settings' },
  { name: 'Update Settings', resource: 'SETTINGS', action: 'UPDATE', description: 'Update system settings' },
];

async function seedPermissions() {
  try {
    console.log('Seeding permissions...');
    
    for (const permission of permissions) {
      await prisma.adminPermission.upsert({
        where: {
          resource_action: {
            resource: permission.resource,
            action: permission.action,
          },
        },
        update: {
          name: permission.name,
          description: permission.description,
        },
        create: permission,
      });
      
      console.log(`✓ ${permission.name}`);
    }
    
    console.log('✅ Permissions seeded successfully');
    
    // Create default roles
    const roles = [
      {
        name: 'Super Admin',
        description: 'Full system access',
        isSystem: true,
        permissions: permissions.map(p => ({ resource: p.resource, action: p.action })),
      },
      {
        name: 'Admin',
        description: 'Administrative access',
        isSystem: true,
        permissions: permissions.filter(p => 
          !['DELETE', 'EXECUTE'].includes(p.action) && 
          !['SETTINGS', 'ROLES'].includes(p.resource)
        ).map(p => ({ resource: p.resource, action: p.action })),
      },
      {
        name: 'Manager',
        description: 'User and session management',
        isSystem: true,
        permissions: permissions.filter(p => 
          ['USERS', 'SESSIONS', 'ANALYTICS'].includes(p.resource) &&
          ['READ', 'UPDATE'].includes(p.action)
        ).map(p => ({ resource: p.resource, action: p.action })),
      },
      {
        name: 'Support',
        description: 'Support access',
        isSystem: true,
        permissions: permissions.filter(p => 
          ['USERS', 'SESSIONS', 'LOGS'].includes(p.resource) &&
          p.action === 'READ'
        ).map(p => ({ resource: p.resource, action: p.action })),
      },
      {
        name: 'Viewer',
        description: 'Read-only access',
        isSystem: true,
        permissions: permissions.filter(p => p.action === 'READ')
          .map(p => ({ resource: p.resource, action: p.action })),
      },
    ];
    
    console.log('\nSeeding roles...');
    
    for (const roleData of roles) {
      const { permissions: perms, ...role } = roleData;
      
      const createdRole = await prisma.role.upsert({
        where: { name: role.name },
        update: role,
        create: role,
      });
      
      // Clear existing permissions
      await prisma.rolePermission.deleteMany({
        where: { roleId: createdRole.id },
      });
      
      // Add permissions
      for (const perm of perms) {
        const permission = await prisma.adminPermission.findUnique({
          where: {
            resource_action: {
              resource: perm.resource,
              action: perm.action,
            },
          },
        });
        
        if (permission) {
          await prisma.rolePermission.create({
            data: {
              roleId: createdRole.id,
              permissionId: permission.id,
            },
          });
        }
      }
      
      console.log(`✓ ${role.name}`);
    }
    
    console.log('✅ Roles seeded successfully');
    
  } catch (error) {
    console.error('Error seeding permissions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedPermissions();