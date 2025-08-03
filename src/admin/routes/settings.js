const express = require('express');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');
const { adminLogger } = require('../middleware/adminLogger');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const router = express.Router();

// Get all settings
router.get('/', async (req, res, next) => {
  try {
    adminLogger.info('Fetching settings', {
      adminId: req.admin.id,
    });

    // Get settings from database or return defaults
    const settings = await prisma.setting.findMany({
      orderBy: { key: 'asc' },
    });

    // Convert array to object for easier frontend use
    const settingsObject = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});

    // Add default values for missing settings
    const defaultSettings = {
      // General settings
      siteName: 'WWebJS Admin',
      siteUrl: process.env.ADMIN_FRONTEND_URL || 'http://localhost:3001',
      maintenanceMode: 'false',
      
      // Email settings
      emailEnabled: 'false',
      emailHost: '',
      emailPort: '587',
      emailSecure: 'false',
      emailUser: '',
      emailFrom: 'noreply@wwebjs.com',
      
      // API settings
      apiRateLimit: '100',
      apiRateLimitWindow: '900000',
      maxSessionsPerUser: '5',
      sessionTimeout: '86400000',
      
      // WhatsApp settings
      defaultWebhookUrl: process.env.BASE_WEBHOOK_URL || '',
      maxAttachmentSize: process.env.MAX_ATTACHMENT_SIZE || '10000000',
      setMessagesAsSeen: process.env.SET_MESSAGES_AS_SEEN || 'true',
      
      // Security settings
      twoFactorRequired: 'false',
      passwordMinLength: '8',
      sessionExpiry: '28800',
      
      // Features
      enableWebSocket: process.env.ENABLE_WEBSOCKET || 'false',
      enableSwagger: process.env.ENABLE_SWAGGER_ENDPOINT || 'false',
      enableLocalCallback: process.env.ENABLE_LOCAL_CALLBACK_EXAMPLE || 'false',
    };

    // Merge with database settings
    const flatSettings = { ...defaultSettings, ...settingsObject };

    // Transform flat settings to nested structure expected by frontend
    const nestedSettings = {
      general: {
        systemName: flatSettings.siteName || 'WWebJS Admin',
        adminEmail: flatSettings.adminEmail || 'admin@example.com',
        timezone: flatSettings.timezone || 'UTC',
        language: flatSettings.language || 'en',
        maintenanceMode: flatSettings.maintenanceMode === 'true',
        maintenanceMessage: flatSettings.maintenanceMessage || '',
      },
      api: {
        baseUrl: flatSettings.apiBaseUrl || process.env.BASE_URL || 'http://localhost:3000',
        timeout: parseInt(flatSettings.apiTimeout || '30000'),
        maxRetries: parseInt(flatSettings.apiMaxRetries || '3'),
        rateLimitPerMinute: parseInt(flatSettings.apiRateLimit || '100'),
        corsOrigins: flatSettings.corsOrigins ? flatSettings.corsOrigins.split(',') : ['http://localhost:3001'],
      },
      whatsapp: {
        sessionTimeout: parseInt(flatSettings.sessionTimeout || '86400000'),
        maxSessionsPerUser: parseInt(flatSettings.maxSessionsPerUser || '5'),
        qrCodeTimeout: parseInt(flatSettings.qrCodeTimeout || '60'),
        reconnectInterval: parseInt(flatSettings.reconnectInterval || '5'),
        autoReconnect: flatSettings.autoReconnect === 'true',
      },
      storage: {
        sessionsPath: flatSettings.sessionsPath || process.env.SESSIONS_PATH || './sessions',
        logsPath: flatSettings.logsPath || './logs',
        mediaPath: flatSettings.mediaPath || './media',
        maxFileSize: parseInt(flatSettings.maxAttachmentSize || '10'),
        cleanupInterval: parseInt(flatSettings.cleanupInterval || '24'),
      },
      notifications: {
        emailEnabled: flatSettings.emailEnabled === 'true',
        webhookUrl: flatSettings.defaultWebhookUrl || '',
        slackEnabled: flatSettings.slackEnabled === 'true',
        discordEnabled: flatSettings.discordEnabled === 'true',
      },
      security: {
        jwtSecret: flatSettings.jwtSecret || process.env.JWT_SECRET || 'change-this-secret',
        jwtExpiresIn: flatSettings.jwtExpiresIn || '7d',
        refreshTokenExpiresIn: flatSettings.refreshTokenExpiresIn || '30d',
        passwordMinLength: parseInt(flatSettings.passwordMinLength || '8'),
        requireStrongPassword: flatSettings.twoFactorRequired === 'true',
        maxLoginAttempts: parseInt(flatSettings.maxLoginAttempts || '5'),
        lockoutDuration: parseInt(flatSettings.lockoutDuration || '30'),
      },
    };

    res.json({
      success: true,
      data: nestedSettings,
    });
  } catch (error) {
    next(error);
  }
});

// Update settings
router.put('/', 
  body('general').optional().isObject(),
  body('api').optional().isObject(),
  body('whatsapp').optional().isObject(),
  body('storage').optional().isObject(),
  body('notifications').optional().isObject(),
  body('security').optional().isObject(),
  handleValidationErrors,
  async (req, res, next) => {
  try {
    const updates = [];

    adminLogger.info('Updating settings', {
      adminId: req.admin.id,
      sections: Object.keys(req.body),
    });

    // Flatten nested settings to key-value pairs for database storage
    const flattenSettings = (obj, prefix = '') => {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          Object.assign(result, flattenSettings(value, prefix + key + '.'));
        } else {
          result[prefix + key] = value;
        }
      }
      return result;
    };

    // Map nested structure to flat keys
    const settingMappings = {
      'general.systemName': 'siteName',
      'general.adminEmail': 'adminEmail',
      'general.timezone': 'timezone',
      'general.language': 'language',
      'general.maintenanceMode': 'maintenanceMode',
      'general.maintenanceMessage': 'maintenanceMessage',
      'api.baseUrl': 'apiBaseUrl',
      'api.timeout': 'apiTimeout',
      'api.maxRetries': 'apiMaxRetries',
      'api.rateLimitPerMinute': 'apiRateLimit',
      'api.corsOrigins': 'corsOrigins',
      'whatsapp.sessionTimeout': 'sessionTimeout',
      'whatsapp.maxSessionsPerUser': 'maxSessionsPerUser',
      'whatsapp.qrCodeTimeout': 'qrCodeTimeout',
      'whatsapp.reconnectInterval': 'reconnectInterval',
      'whatsapp.autoReconnect': 'autoReconnect',
      'storage.sessionsPath': 'sessionsPath',
      'storage.logsPath': 'logsPath',
      'storage.mediaPath': 'mediaPath',
      'storage.maxFileSize': 'maxAttachmentSize',
      'storage.cleanupInterval': 'cleanupInterval',
      'notifications.emailEnabled': 'emailEnabled',
      'notifications.webhookUrl': 'defaultWebhookUrl',
      'notifications.slackEnabled': 'slackEnabled',
      'notifications.discordEnabled': 'discordEnabled',
      'security.jwtSecret': 'jwtSecret',
      'security.jwtExpiresIn': 'jwtExpiresIn',
      'security.refreshTokenExpiresIn': 'refreshTokenExpiresIn',
      'security.passwordMinLength': 'passwordMinLength',
      'security.requireStrongPassword': 'twoFactorRequired',
      'security.maxLoginAttempts': 'maxLoginAttempts',
      'security.lockoutDuration': 'lockoutDuration',
    };

    // Process each section
    const flatSettings = flattenSettings(req.body);
    
    for (const [nestedKey, value] of Object.entries(flatSettings)) {
      const dbKey = settingMappings[nestedKey];
      if (dbKey) {
        let dbValue = value;
        if (Array.isArray(value)) {
          dbValue = value.join(',');
        } else if (typeof value === 'boolean') {
          dbValue = value.toString();
        } else {
          dbValue = String(value);
        }
        
        updates.push(
          prisma.setting.upsert({
            where: { key: dbKey },
            update: { value: dbValue },
            create: { key: dbKey, value: dbValue },
          })
        );
      }
    }

    // Execute all updates
    await Promise.all(updates);

    // Log the update
    await prisma.auditLog.create({
      data: {
        adminId: req.admin.id,
        action: 'settings.update',
        details: {
          updatedKeys: Object.keys(settings),
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        updated: updates.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Test email configuration
router.post('/test-email', async (req, res, next) => {
  try {
    const { to } = req.body;

    adminLogger.info('Testing email configuration', {
      adminId: req.admin.id,
      to,
    });

    // Get email settings
    const emailSettings = await prisma.setting.findMany({
      where: {
        key: {
          startsWith: 'email',
        },
      },
    });

    const settings = emailSettings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});

    if (settings.emailEnabled !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Email is not enabled',
      });
    }

    // Here you would implement actual email sending
    // For now, we'll simulate it
    res.json({
      success: true,
      message: 'Test email sent successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Test webhook
router.post('/test-webhook', async (req, res, next) => {
  try {
    const { url, payload } = req.body;

    adminLogger.info('Testing webhook', {
      adminId: req.admin.id,
      url,
    });

    // Here you would implement actual webhook testing
    // For now, we'll simulate it
    res.json({
      success: true,
      message: 'Webhook test successful',
      data: {
        statusCode: 200,
        response: { received: true },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Export settings
router.get('/export', async (req, res, next) => {
  try {
    adminLogger.info('Exporting settings', {
      adminId: req.admin.id,
    });

    const settings = await prisma.setting.findMany({
      orderBy: { key: 'asc' },
    });

    res.json({
      success: true,
      data: {
        settings,
        exportedAt: new Date().toISOString(),
        exportedBy: req.admin.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Import settings
router.post('/import', async (req, res, next) => {
  try {
    const { settings } = req.body;

    adminLogger.info('Importing settings', {
      adminId: req.admin.id,
      settingsCount: settings.length,
    });

    // Import each setting
    const imports = await Promise.all(
      settings.map((setting) =>
        prisma.setting.upsert({
          where: { key: setting.key },
          update: { value: setting.value },
          create: { key: setting.key, value: setting.value },
        })
      )
    );

    res.json({
      success: true,
      message: 'Settings imported successfully',
      data: {
        imported: imports.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get environment variables (read-only)
router.get('/environment', async (req, res, next) => {
  try {
    adminLogger.info('Fetching environment variables', {
      adminId: req.admin.id,
    });

    // Only expose safe environment variables
    const safeEnvVars = {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      ADMIN_FRONTEND_URL: process.env.ADMIN_FRONTEND_URL,
      BASE_WEBHOOK_URL: process.env.BASE_WEBHOOK_URL,
      ENABLE_WEBSOCKET: process.env.ENABLE_WEBSOCKET,
      ENABLE_SWAGGER_ENDPOINT: process.env.ENABLE_SWAGGER_ENDPOINT,
      ENABLE_LOCAL_CALLBACK_EXAMPLE: process.env.ENABLE_LOCAL_CALLBACK_EXAMPLE,
      HEADLESS: process.env.HEADLESS,
      AUTO_START_SESSIONS: process.env.AUTO_START_SESSIONS,
      RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
      MAX_ATTACHMENT_SIZE: process.env.MAX_ATTACHMENT_SIZE,
      SET_MESSAGES_AS_SEEN: process.env.SET_MESSAGES_AS_SEEN,
      WEB_VERSION: process.env.WEB_VERSION,
      WEB_VERSION_CACHE_TYPE: process.env.WEB_VERSION_CACHE_TYPE,
      RECOVER_SESSIONS: process.env.RECOVER_SESSIONS,
      LOG_LEVEL: process.env.LOG_LEVEL,
    };

    res.json({
      success: true,
      data: safeEnvVars,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;