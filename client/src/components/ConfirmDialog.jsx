import { motion, AnimatePresence } from 'framer-motion';

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-sm rounded-3xl bg-purple-900 p-6 text-white shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >
            <h2 id="confirm-dialog-title" className="mb-2 text-xl font-extrabold">
              {title}
            </h2>
            <p className="mb-6 text-sm text-white/80">{description}</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onCancel} className="rounded-full bg-white/10 px-5 py-2 font-bold hover:bg-white/20">
                Cancel
              </button>
              <button type="button" onClick={onConfirm} className="rounded-full bg-red-600 px-5 py-2 font-bold hover:bg-red-500">
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
