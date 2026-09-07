import { Router } from 'express';
import { verifyPassword } from '../lib/password.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export function createAdminAuthRouter(db, { loginLimiter } = {}) {
  const router = Router();
  const limiter = loginLimiter ?? ((req, res, next) => next());

  router.post('/login', limiter, (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Username and password are required.' } });
    }
    const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect username or password.' } });
    }
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: { code: 'SESSION_ERROR', message: 'Could not start session.' } });
      req.session.adminId = admin.id;
      req.session.username = admin.username;
      res.json({ username: admin.username });
    });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  router.get('/me', requireAdmin, (req, res) => {
    res.json({ username: req.session.username });
  });

  return router;
}
