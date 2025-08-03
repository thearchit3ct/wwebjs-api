const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { adminLogger } = require('../middleware/adminLogger');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

// Log Prisma queries
prisma.$on('query', (e) => {
  adminLogger.logDatabaseQuery({
    query: e.query,
    duration: e.duration,
    params: e.params.split(',').length,
  });
});

prisma.$on('error', (e) => {
  adminLogger.error('Database error', { error: e.message });
});

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtExpiry = process.env.JWT_EXPIRY || '8h';
    this.refreshExpiry = process.env.REFRESH_EXPIRY || '7d';
  }

  async register(data) {
    const { email, password, name, role } = data;
    
    adminLogger.info('Admin registration attempt', { email, role });

    try {
      // Check if admin already exists
      const existing = await prisma.admin.findUnique({ where: { email } });
      if (existing) {
        throw new Error('Admin already exists');
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Create admin
      const admin = await prisma.admin.create({
        data: {
          email,
          passwordHash,
          name,
          role: role || 'VIEWER',
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      // Set default permissions based on role
      await this.setDefaultPermissions(admin.id, admin.role);

      adminLogger.info('Admin registered successfully', {
        adminId: admin.id,
        email: admin.email,
        role: admin.role,
      });

      return admin;
    } catch (error) {
      adminLogger.error('Admin registration failed', {
        error: error.message,
        email,
      });
      throw error;
    }
  }

  async login(email, password, ipAddress, userAgent) {
    adminLogger.info('Admin login attempt', { email, ipAddress });

    try {
      // Find admin
      const admin = await prisma.admin.findUnique({
        where: { email },
        include: { permissions: true },
      });

      if (!admin || !admin.isActive) {
        await this.logLoginAttempt(null, email, ipAddress, userAgent, false, 'Invalid credentials');
        throw new Error('Invalid credentials');
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, admin.passwordHash);
      if (!validPassword) {
        await this.logLoginAttempt(admin.id, email, ipAddress, userAgent, false, 'Invalid password');
        throw new Error('Invalid credentials');
      }

      // Check if 2FA is enabled
      if (admin.twoFactorEnabled) {
        // Return partial token for 2FA verification
        const tempToken = jwt.sign(
          { adminId: admin.id, temp: true },
          this.jwtSecret,
          { expiresIn: '5m' }
        );

        adminLogger.info('2FA required for admin login', { adminId: admin.id });
        
        return {
          requiresTwoFactor: true,
          tempToken,
        };
      }

      // Generate tokens
      const tokens = await this.generateTokens(admin, ipAddress, userAgent);

      // Update last login
      await prisma.admin.update({
        where: { id: admin.id },
        data: { lastLogin: new Date() },
      });

      // Log successful login
      await this.logLoginAttempt(admin.id, email, ipAddress, userAgent, true);

      adminLogger.info('Admin login successful', {
        adminId: admin.id,
        email: admin.email,
        role: admin.role,
      });

      return {
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          permissions: admin.permissions,
        },
        ...tokens,
      };
    } catch (error) {
      adminLogger.error('Admin login failed', {
        error: error.message,
        email,
      });
      throw error;
    }
  }

  async verify2FA(tempToken, code, ipAddress, userAgent) {
    try {
      // Verify temp token
      const decoded = jwt.verify(tempToken, this.jwtSecret);
      if (!decoded.temp) {
        throw new Error('Invalid token');
      }

      // Get admin
      const admin = await prisma.admin.findUnique({
        where: { id: decoded.adminId },
        include: { permissions: true },
      });

      if (!admin || !admin.twoFactorSecret) {
        throw new Error('2FA not configured');
      }

      // Verify TOTP code
      const verified = speakeasy.totp.verify({
        secret: admin.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 2,
      });

      if (!verified) {
        await this.logLoginAttempt(admin.id, admin.email, ipAddress, userAgent, false, '2FA failed');
        throw new Error('Invalid 2FA code');
      }

      // Generate real tokens
      const tokens = await this.generateTokens(admin, ipAddress, userAgent);

      // Update last login
      await prisma.admin.update({
        where: { id: admin.id },
        data: { lastLogin: new Date() },
      });

      // Log successful login
      await this.logLoginAttempt(admin.id, admin.email, ipAddress, userAgent, true);

      return {
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          permissions: admin.permissions,
        },
        ...tokens,
      };
    } catch (error) {
      adminLogger.error('2FA verification failed', { error: error.message });
      throw error;
    }
  }

  async generateTokens(admin, ipAddress, userAgent) {
    // Create session
    const session = await prisma.adminSession.create({
      data: {
        adminId: admin.id,
        token: this.generateSessionToken(),
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Generate JWT
    const accessToken = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        sessionId: session.id,
      },
      this.jwtSecret,
      { expiresIn: this.jwtExpiry }
    );

    const refreshToken = jwt.sign(
      {
        sessionId: session.id,
        type: 'refresh',
      },
      this.jwtSecret,
      { expiresIn: this.refreshExpiry }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 8 * 60 * 60, // 8 hours in seconds
    };
  }

  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtSecret);
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Get session
      const session = await prisma.adminSession.findUnique({
        where: { id: decoded.sessionId },
        include: { admin: true },
      });

      if (!session || session.expiresAt < new Date()) {
        throw new Error('Session expired');
      }

      // Update session last used
      await prisma.adminSession.update({
        where: { id: session.id },
        data: { lastUsed: new Date() },
      });

      // Generate new access token
      const accessToken = jwt.sign(
        {
          id: session.admin.id,
          email: session.admin.email,
          role: session.admin.role,
          sessionId: session.id,
        },
        this.jwtSecret,
        { expiresIn: this.jwtExpiry }
      );

      adminLogger.debug('Token refreshed', {
        adminId: session.admin.id,
        sessionId: session.id,
      });

      return {
        accessToken,
        expiresIn: 8 * 60 * 60,
      };
    } catch (error) {
      adminLogger.error('Token refresh failed', { error: error.message });
      throw error;
    }
  }

  async logout(sessionId) {
    try {
      await prisma.adminSession.delete({
        where: { id: sessionId },
      });

      adminLogger.info('Admin logged out', { sessionId });
    } catch (error) {
      adminLogger.error('Logout failed', { error: error.message });
      throw error;
    }
  }

  async enable2FA(adminId) {
    try {
      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `WWebJS Admin (${adminId})`,
        issuer: 'WWebJS',
      });

      // Update admin
      await prisma.admin.update({
        where: { id: adminId },
        data: {
          twoFactorSecret: secret.base32,
        },
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

      adminLogger.info('2FA enabled for admin', { adminId });

      return {
        secret: secret.base32,
        qrCode: qrCodeUrl,
      };
    } catch (error) {
      adminLogger.error('Failed to enable 2FA', {
        error: error.message,
        adminId,
      });
      throw error;
    }
  }

  async disable2FA(adminId, code) {
    try {
      const admin = await prisma.admin.findUnique({
        where: { id: adminId },
      });

      if (!admin || !admin.twoFactorSecret) {
        throw new Error('2FA not enabled');
      }

      // Verify current code before disabling
      const verified = speakeasy.totp.verify({
        secret: admin.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 2,
      });

      if (!verified) {
        throw new Error('Invalid 2FA code');
      }

      // Disable 2FA
      await prisma.admin.update({
        where: { id: adminId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
      });

      adminLogger.info('2FA disabled for admin', { adminId });

      return { success: true };
    } catch (error) {
      adminLogger.error('Failed to disable 2FA', {
        error: error.message,
        adminId,
      });
      throw error;
    }
  }

  async changePassword(adminId, currentPassword, newPassword) {
    try {
      const admin = await prisma.admin.findUnique({
        where: { id: adminId },
      });

      if (!admin) {
        throw new Error('Admin not found');
      }

      // Verify current password
      const validPassword = await bcrypt.compare(currentPassword, admin.passwordHash);
      if (!validPassword) {
        throw new Error('Invalid current password');
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      // Update password
      await prisma.admin.update({
        where: { id: adminId },
        data: { passwordHash },
      });

      // Invalidate all sessions except current
      await prisma.adminSession.deleteMany({
        where: {
          adminId,
          NOT: {
            id: admin.sessions?.[0]?.id,
          },
        },
      });

      adminLogger.info('Password changed for admin', { adminId });

      return { success: true };
    } catch (error) {
      adminLogger.error('Failed to change password', {
        error: error.message,
        adminId,
      });
      throw error;
    }
  }

  async setDefaultPermissions(adminId, role) {
    const defaultPermissions = {
      SUPER_ADMIN: [
        { resource: 'USERS', actions: ['CREATE', 'READ', 'UPDATE', 'DELETE'] },
        { resource: 'SESSIONS', actions: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE'] },
        { resource: 'SYSTEM', actions: ['READ', 'UPDATE', 'EXECUTE'] },
        { resource: 'ANALYTICS', actions: ['READ', 'EXECUTE'] },
        { resource: 'LOGS', actions: ['READ', 'DELETE'] },
        { resource: 'BILLING', actions: ['READ', 'UPDATE'] },
      ],
      ADMIN: [
        { resource: 'USERS', actions: ['CREATE', 'READ', 'UPDATE'] },
        { resource: 'SESSIONS', actions: ['READ', 'UPDATE', 'EXECUTE'] },
        { resource: 'SYSTEM', actions: ['READ'] },
        { resource: 'ANALYTICS', actions: ['READ'] },
        { resource: 'LOGS', actions: ['READ'] },
      ],
      MANAGER: [
        { resource: 'USERS', actions: ['READ', 'UPDATE'] },
        { resource: 'SESSIONS', actions: ['READ', 'EXECUTE'] },
        { resource: 'ANALYTICS', actions: ['READ'] },
        { resource: 'LOGS', actions: ['READ'] },
      ],
      SUPPORT: [
        { resource: 'USERS', actions: ['READ'] },
        { resource: 'SESSIONS', actions: ['READ'] },
        { resource: 'LOGS', actions: ['READ'] },
      ],
      VIEWER: [
        { resource: 'ANALYTICS', actions: ['READ'] },
      ],
    };

    const permissions = defaultPermissions[role] || [];
    const permissionData = [];

    for (const perm of permissions) {
      for (const action of perm.actions) {
        permissionData.push({
          adminId,
          resource: perm.resource,
          action,
          granted: true,
        });
      }
    }

    await prisma.permission.createMany({
      data: permissionData,
      skipDuplicates: true,
    });
  }

  async logLoginAttempt(adminId, email, ipAddress, userAgent, success, reason = null) {
    await prisma.adminLoginLog.create({
      data: {
        adminId,
        email,
        ipAddress,
        userAgent,
        success,
        reason,
      },
    });
  }

  generateSessionToken() {
    return require('crypto').randomBytes(32).toString('hex');
  }
}

module.exports = new AuthService();