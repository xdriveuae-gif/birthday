export function requireAdmin(req, res, next) {
  if (req.session?.adminId) return next();
  return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Admin login required.' } });
}
