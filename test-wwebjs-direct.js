const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

async function testSession() {
  console.log('Creating WhatsApp client...');
  
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'test-direct-client',
      dataPath: path.join(__dirname, 'sessions')
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', (qr) => {
    console.log('QR Code received:', qr);
  });

  client.on('ready', () => {
    console.log('Client is ready!');
  });

  client.on('authenticated', () => {
    console.log('Client is authenticated!');
  });

  client.on('auth_failure', (msg) => {
    console.error('Authentication failure:', msg);
  });

  try {
    console.log('Initializing client...');
    await client.initialize();
    console.log('Client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize client:', error);
  }
}

testSession();