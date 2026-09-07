import { Router } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { listAllGifts, getGiftById, createGift, updateGift, setGiftActive, deleteGift } from '../db/gifts.js';

const ALLOWED_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

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
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => cb(null, `${randomUUID()}${ALLOWED_MIME[file.mimetype] ?? ''}`),
  });
  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
      cb(new Error('INVALID_FILE_TYPE'));
    },
  });
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
      if (req.file) deleteUploadedFile(uploadsDir, `/uploads/gifts/${req.file.filename}`);
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } });
    }
    const imageUrl = req.file ? `/uploads/gifts/${req.file.filename}` : null;
    const gift = createGift(db, { ...parsed.data, imageUrl });
    res.status(201).json({ gift });
  });

  router.put('/:id', handleUpload, (req, res) => {
    const existing = getGiftById(db, req.params.id);
    if (!existing) {
      if (req.file) deleteUploadedFile(uploadsDir, `/uploads/gifts/${req.file.filename}`);
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Gift not found.' } });
    }
    const parsed = giftFormSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file) deleteUploadedFile(uploadsDir, `/uploads/gifts/${req.file.filename}`);
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: parsed.error.issues[0].message } });
    }
    let imageUrl = existing.imageUrl;
    if (req.file) {
      deleteUploadedFile(uploadsDir, existing.imageUrl);
      imageUrl = `/uploads/gifts/${req.file.filename}`;
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
