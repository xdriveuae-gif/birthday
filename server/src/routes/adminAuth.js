import { Router } from 'express';
import { hashPassword, verifyPassword } from '../lib/password.js';
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

  router.patch('/credentials', requireAdmin, (req, res) => {
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newUsername = req.body?.newUsername !== undefined ? String(req.body.newUsername).trim() : null;
    const newPassword = req.body?.newPassword !== undefined ? String(req.body.newPassword) : null;

    const admin = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.session.adminId);
    if (!admin || !verifyPassword(currentPassword, admin.password_hash)) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' } });
    }
    if (newUsername !== null && !newUsername) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Username cannot be empty.' } });
    }
    if (newPassword !== null && newPassword.length < 6) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'New password must be at least 6 characters.' } });
    }

    const finalUsername = newUsername || admin.username;
    const finalPasswordHash = newPassword ? hashPassword(newPassword) : admin.password_hash;
    db.prepare('UPDATE admin_users SET username = ?, password_hash = ? WHERE id = ?').run(
      finalUsername,
      finalPasswordHash,
      admin.id
    );
    req.session.username = finalUsername;
    res.json({ username: finalUsername });
  });

  return router;
}
