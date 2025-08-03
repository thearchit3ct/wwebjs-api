const axios = require('axios');
const logger = require('pino')();

// Create axios instance for WWebJS API
const wwebjsApi = axios.create({
  baseURL: process.env.WWEBJS_API_URL || 'http://localhost:3050',
  headers: {
    'x-api-key': process.env.API_KEY || '0c33ba9d185a7f8c675fe136d6370706be92a9e1e22b0a4dd24cc8a2d6de0b7a',
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Service methods for interacting with WWebJS API
const wwebjsApiService = {
  /**
   * Get all WWebJS sessions
   */
  async getSessions() {
    try {
      const response = await wwebjsApi.get('/session/getSessions');
      return response.data;
    } catch (error) {
      logger.error('Failed to get WWebJS sessions', { error: error.message });
      throw error;
    }
  },

  /**
   * Start a new WWebJS session
   */
  async startSession(sessionId) {
    try {
      const response = await wwebjsApi.get(`/session/start/${sessionId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to start WWebJS session', { 
        sessionId, 
        error: error.message 
      });
      throw error;
    }
  },

  /**
   * Stop a WWebJS session
   */
  async stopSession(sessionId) {
    try {
      const response = await wwebjsApi.get(`/session/stop/${sessionId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to stop WWebJS session', { 
        sessionId, 
        error: error.message 
      });
      throw error;
    }
  },

  /**
   * Get session status
   */
  async getSessionStatus(sessionId) {
    try {
      const response = await wwebjsApi.get(`/session/status/${sessionId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get session status', { 
        sessionId, 
        error: error.message 
      });
      throw error;
    }
  },

  /**
   * Get QR code for session
   */
  async getSessionQr(sessionId) {
    try {
      const response = await wwebjsApi.get(`/session/qr/${sessionId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get session QR', { 
        sessionId, 
        error: error.message 
      });
      throw error;
    }
  },

  /**
   * Get QR code image for session
   */
  async getSessionQrImage(sessionId) {
    try {
      const response = await wwebjsApi.get(`/session/qr/${sessionId}/image`, {
        responseType: 'arraybuffer',
      });
      return {
        image: Buffer.from(response.data).toString('base64'),
        contentType: response.headers['content-type'] || 'image/png',
      };
    } catch (error) {
      logger.error('Failed to get session QR image', { 
        sessionId, 
        error: error.message 
      });
      throw error;
    }
  },

  /**
   * Restart a session
   */
  async restartSession(sessionId) {
    try {
      const response = await wwebjsApi.get(`/session/restart/${sessionId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to restart session', { 
        sessionId, 
        error: error.message 
      });
      throw error;
    }
  },

  /**
   * Terminate a session
   */
  async terminateSession(sessionId) {
    try {
      const response = await wwebjsApi.get(`/session/terminate/${sessionId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to terminate session', { 
        sessionId, 
        error: error.message 
      });
      throw error;
    }
  },

  /**
   * Send a message through WWebJS
   */
  async sendMessage(sessionId, messageData) {
    try {
      const response = await wwebjsApi.post(`/client/sendMessage/${sessionId}`, messageData);
      return response.data;
    } catch (error) {
      logger.error('Failed to send message', { 
        sessionId, 
        error: error.message 
      });
      throw error;
    }
  },

  /**
   * Get session info
   */
  async getSessionInfo(sessionId) {
    try {
      const response = await wwebjsApi.get(`/client/getClassInfo/${sessionId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get session info', { 
        sessionId, 
        error: error.message 
      });
      throw error;
    }
  },
};

module.exports = wwebjsApiService;