const express = require('express');
const { adminLogger } = require('../middleware/adminLogger');
const { authorizeResource } = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Apply authorization
router.use(authorizeResource('ROLES'));

// GET /api/admin/permissions - Get all permissions
router.get('/', async (req, res, next) => {
  try {
    adminLogger.info('Fetching permissions', {
      adminId: req.admin.id,
    });

    const permissions = await prisma.adminPermission.findMany({
      orderBy: [
        { resource: 'asc' },
        { action: 'asc' },
      ],
    });

    res.json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;