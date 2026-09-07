import { Router } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { listAllGifts, getGiftById, createGift, updateGift, setGiftActive, deleteGift } from '../db/gifts.js';

const ALLOWED_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Verify the file's actual bytes match a known image signature, rather than trusting
// the client-supplied Content-Type header (which a renamed .txt->.png file can spoof).
function sniffImageMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

const giftFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  productUrl: z
    .string()
    .trim()
    .min(1, 'Product URL is required')
    .refine((u) => {
      try {
        const parsed = new URL(u);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'Must be a valid http(s) URL'),
  active: z.enum(['true', 'false']).transform((v) => v === 'true'),
});

function createUploadMiddleware(uploadsDir) {
  const dest = path.join(uploadsDir, 'gifts');
  fs.mkdirSync(dest, { recursive: true });
  // Buffer the upload in memory so we can sniff its real content before trusting it,
  // then write it to disk ourselves once validated (see writeUploadedFile below).
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
      cb(new Error('INVALID_FILE_TYPE'));
    },
  });
}

// Persists a validated in-memory upload to disk, rejecting it if the actual file
// bytes don't match a real image signature for the declared type.
function writeUploadedFile(uploadsDir, file) {
  const sniffed = sniffImageMime(file.buffer);
  if (!sniffed || !ALLOWED_MIME[sniffed]) {
    return { error: 'INVALID_FILE_TYPE' };
  }
  const dest = path.join(uploadsDir, 'gifts');
  const filename = `${randomUUID()}${ALLOWED_MIME[sniffed]}`;
  fs.writeFileSync(path.join(dest, filename), file.buffer);
  return { filename };
}

function deleteUploadedFile(uploadsDir, imageUrl) {
  if (!imageUrl) return;
  const filePath = path.join(uploadsDir, imageUrl.replace(/^\/uploads\//, ''));
  fs.unlink(filePath, () => {});
}

export function createAdminGiftsRouter(db, uploadsDir) {
  const router = Router();
  let uploadSingle;

  function handleUpload(req, res, next) {
    if (!uploadSingle) uploadSingle = createUploadMiddleware(uploadsDir).single('image');
    uploadSingle(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: 'Image must be 5MB or smaller.' } });
      }
      if (err) {
        return res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: 'Only JPEG, PNG, or WEBP images are allowed.' } });
      }
      next();
    });
  }

  router.get('/', (req, res) => {
    res.json({ gifts: listAllGifts(db) });
  });

  router.post('/', handleUpload, (req, res) => {
    const parsed = giftFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } });
    }
    let imageUrl = null;
    if (req.file) {
      const written = writeUploadedFile(uploadsDir, req.file);
      if (written.error) {
        return res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: 'Only JPEG, PNG, or WEBP images are allowed.' } });
      }
      imageUrl = `/uploads/gifts/${written.filename}`;
    }
    const gift = createGift(db, { ...parsed.data, imageUrl });
    res.status(201).json({ gift });
  });

  router.put('/:id', handleUpload, (req, res) => {
    const existing = getGiftById(db, req.params.id);
    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gift not found.' } });
    }
    const parsed = giftFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } });
    }
    let imageUrl = existing.imageUrl;
    if (req.file) {
      const written = writeUploadedFile(uploadsDir, req.file);
      if (written.error) {
        return res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: 'Only JPEG, PNG, or WEBP images are allowed.' } });
      }
      deleteUploadedFile(uploadsDir, existing.imageUrl);
      imageUrl = `/uploads/gifts/${written.filename}`;
    }
    const gift = updateGift(db, req.params.id, { ...parsed.data, imageUrl });
    res.json({ gift });
  });

  router.patch('/:id/active', (req, res) => {
    const existing = getGiftById(db, req.params.id);
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gift not found.' } });
    const schema = z.object({ active: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'active must be a boolean.' } });
    res.json({ gift: setGiftActive(db, req.params.id, parsed.data.active) });
  });

  router.delete('/:id', (req, res) => {
    const existing = getGiftById(db, req.params.id);
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gift not found.' } });
    deleteUploadedFile(uploadsDir, existing.imageUrl);
    deleteGift(db, req.params.id);
    res.json({ ok: true });
  });

  return router;
}
