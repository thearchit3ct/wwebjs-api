const express = require('express');
const { body, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');
const { adminLogger } = require('../middleware/adminLogger');
const { authorizeResource } = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Apply authorization
router.use(authorizeResource('ROLES'));

// GET /api/admin/roles - Get all roles
router.get('/', async (req, res, next) => {
  try {
    adminLogger.info('Fetching roles', {
      adminId: req.admin.id,
    });

    const roles = await prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: { admins: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Transform the data
    const transformedRoles = roles.map(role => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map(rp => rp.permission),
      userCount: role._count.admins,
      isActive: role.isActive,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));

    res.json({
      success: true,
      data: transformedRoles,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/roles/:id - Get specific role
router.get('/:id', 
  param('id').isUUID(),
  handleValidationErrors,
  async (req, res, next) => {
  try {
    const { id } = req.params;

    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        admins: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!role) {
      return res.status(404).json({
        error: {
          message: 'Role not found',
          code: 'ROLE_NOT_FOUND',
        },
      });
    }

    res.json({
      success: true,
      data: {
        ...role,
        permissions: role.permissions.map(rp => rp.permission),
        userCount: role.admins.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/roles - Create new role
router.post('/',
  body('name').notEmpty().trim(),
  body('description').optional().trim(),
  body('permissions').isArray(),
  body('isActive').optional().isBoolean(),
  handleValidationErrors,
  async (req, res, next) => {
  try {
    const { name, description, permissions, isActive = true } = req.body;

    adminLogger.info('Creating role', {
      adminId: req.admin.id,
      roleName: name,
    });

    // Check if role name already exists
    const existingRole = await prisma.role.findUnique({
      where: { name },
    });

    if (existingRole) {
      return res.status(400).json({
        error: {
          message: 'Role name already exists',
          code: 'ROLE_NAME_EXISTS',
        },
      });
    }

    // Create the role
    const role = await prisma.role.create({
      data: {
        name,
        description,
        isActive,
        permissions: {
          create: permissions.map(permissionId => ({
            permissionId,
          })),
        },
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    // Log the action
    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin.id,
        action: 'role.create',
        resource: 'ROLES',
        resourceId: role.id,
        details: { roleName: name },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        ...role,
        permissions: role.permissions.map(rp => rp.permission),
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/roles/:id - Update role
router.put('/:id',
  param('id').isUUID(),
  body('name').optional().notEmpty().trim(),
  body('description').optional().trim(),
  body('permissions').optional().isArray(),
  body('isActive').optional().isBoolean(),
  handleValidationErrors,
  async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, permissions, isActive } = req.body;

    adminLogger.info('Updating role', {
      adminId: req.admin.id,
      roleId: id,
    });

    // Check if role exists and is not system role
    const existingRole = await prisma.role.findUnique({
      where: { id },
    });

    if (!existingRole) {
      return res.status(404).json({
        error: {
          message: 'Role not found',
          code: 'ROLE_NOT_FOUND',
        },
      });
    }

    if (existingRole.isSystem && name && name !== existingRole.name) {
      return res.status(400).json({
        error: {
          message: 'Cannot rename system role',
          code: 'SYSTEM_ROLE_RENAME',
        },
      });
    }

    // Update role
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    const role = await prisma.role.update({
      where: { id },
      data: updateData,
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    // Update permissions if provided
    if (permissions) {
      // Remove all existing permissions
      await prisma.rolePermission.deleteMany({
        where: { roleId: id },
      });

      // Add new permissions
      await prisma.rolePermission.createMany({
        data: permissions.map(permissionId => ({
          roleId: id,
          permissionId,
        })),
      });
    }

    // Log the action
    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin.id,
        action: 'role.update',
        resource: 'ROLES',
        resourceId: id,
        details: req.body,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    // Fetch updated role with permissions
    const updatedRole = await prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: {
        ...updatedRole,
        permissions: updatedRole.permissions.map(rp => rp.permission),
      },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/roles/:id - Delete role
router.delete('/:id',
  param('id').isUUID(),
  handleValidationErrors,
  async (req, res, next) => {
  try {
    const { id } = req.params;

    adminLogger.info('Deleting role', {
      adminId: req.admin.id,
      roleId: id,
    });

    // Check if role exists and can be deleted
    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { admins: true },
        },
      },
    });

    if (!role) {
      return res.status(404).json({
        error: {
          message: 'Role not found',
          code: 'ROLE_NOT_FOUND',
        },
      });
    }

    if (role.isSystem) {
      return res.status(400).json({
        error: {
          message: 'Cannot delete system role',
          code: 'SYSTEM_ROLE_DELETE',
        },
      });
    }

    if (role._count.admins > 0) {
      return res.status(400).json({
        error: {
          message: 'Cannot delete role with assigned users',
          code: 'ROLE_HAS_USERS',
        },
      });
    }

    // Delete role permissions first
    await prisma.rolePermission.deleteMany({
      where: { roleId: id },
    });

    // Delete the role
    await prisma.role.delete({
      where: { id },
    });

    // Log the action
    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin.id,
        action: 'role.delete',
        resource: 'ROLES',
        resourceId: id,
        details: { roleName: role.name },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.json({
      success: true,
      message: 'Role deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/roles/:id/users - Get users with this role
router.get('/:id/users',
  param('id').isUUID(),
  handleValidationErrors,
  async (req, res, next) => {
  try {
    const { id } = req.params;

    const users = await prisma.admin.findMany({
      where: { roleId: id },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;