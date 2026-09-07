import session from 'express-session';

export class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT data, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expires < Date.now()) return callback(null, null);
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sessionData, callback) {
    try {
      const maxAge = sessionData.cookie?.maxAge ?? 8 * 60 * 60 * 1000;
      const expires = Date.now() + maxAge;
      this.db
        .prepare(
          `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`
        )
        .run(sid, JSON.stringify(sessionData), expires);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid, callback) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }
}
