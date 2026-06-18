import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, runMigrations } from './db.mjs';
import { hashPassword, verifyPassword, generateToken, verifyToken } from './auth.mjs';
import apiHandler from './api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth Token Verification Middleware
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  next();
});

// Authentication Endpoints
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '請輸入電子郵件與密碼' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const rows = await db.sql`SELECT * FROM users WHERE email = ${normalizedEmail}`;
    if (rows.length === 0) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }

    const user = rows[0];
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name || user.email,
        roles: user.roles
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '登入伺服器出錯，請稍後再試' });
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ user: req.user });
});

// Bridge Netlify Web request format to Express
app.all('/api/:route', async (req, res) => {
  const webReq = {
    method: req.method,
    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    json: async () => req.body,
    user: req.user,
    query: req.query,
    params: req.params,
    body: req.body
  };

  try {
    const response = await apiHandler(webReq);
    const status = response.status || 200;
    const data = await response.json();
    res.status(status).json(data);
  } catch (err) {
    console.error('API route error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Serve compiled static frontend
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Startup logic
async function bootstrapApp() {
  try {
    // Run database migrations
    await runMigrations();

    // Seed default admin account
    const adminEmail = 'admin@eavo.com.tw';
    const adminCheck = await db.sql`SELECT * FROM users WHERE email = ${adminEmail}`;
    if (adminCheck.length === 0) {
      const defaultPassHash = await hashPassword('admin123456');
      await db.sql`
        INSERT INTO users (email, password_hash, roles, full_name, company)
        VALUES (${adminEmail}, ${defaultPassHash}, '{admin,dealer}', 'Admin User', '東瑭國際')
      `;
      console.info('====================================================');
      console.info(`Default admin account created:`);
      console.info(`Email: ${adminEmail}`);
      console.info(`Password: admin123456`);
      console.info('====================================================');
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start application:', err);
    process.exit(1);
  }
}

bootstrapApp();
