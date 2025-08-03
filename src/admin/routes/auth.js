const express = require('express');
const authService = require('../services/authService');
const { adminValidationRules } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { adminLogger } = require('../middleware/adminLogger');

const router = express.Router();

// Register new admin (requires super admin auth)
router.post('/register', authenticate, adminValidationRules.register, async (req, res, next) => {
  try {
    // Only super admins can create new admins
    if (req.admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        error: {
          message: 'Only super admins can create new admins',
          code: 'FORBIDDEN',
        },
      });
    }

    const admin = await authService.register(req.body);
    
    res.status(201).json({
      message: 'Admin created successfully',
      data: admin,
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', adminValidationRules.login, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    const result = await authService.login(email, password, ipAddress, userAgent);

    if (result.requiresTwoFactor) {
      return res.json({
        requiresTwoFactor: true,
        tempToken: result.tempToken,
      });
    }

    res.json({
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Verify 2FA
router.post('/verify-2fa', async (req, res, next) => {
  try {
    const { tempToken, code } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    const result = await authService.verify2FA(tempToken, code, ipAddress, userAgent);

    res.json({
      message: '2FA verification successful',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);

    res.json({
      message: 'Token refreshed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await authService.logout(req.sessionId);

    res.json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Get current admin
router.get('/me', authenticate, async (req, res) => {
  res.json({
    data: {
      id: req.admin.id,
      email: req.admin.email,
      name: req.admin.name,
      role: req.admin.role,
      permissions: req.admin.permissions,
      twoFactorEnabled: req.admin.twoFactorEnabled,
    },
  });
});

// Enable 2FA
router.post('/enable-2fa', authenticate, async (req, res, next) => {
  try {
    const result = await authService.enable2FA(req.admin.id);

    res.json({
      message: '2FA setup initiated',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Disable 2FA
router.post('/disable-2fa', authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;
    const result = await authService.disable2FA(req.admin.id, code);

    res.json({
      message: '2FA disabled successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Change password
router.post('/change-password', authenticate, adminValidationRules.changePassword, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.admin.id, currentPassword, newPassword);

    res.json({
      message: 'Password changed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;