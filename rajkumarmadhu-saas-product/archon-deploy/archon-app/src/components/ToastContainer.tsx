import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react'
import type { Toast } from '../hooks/useToast'

const icons = {
    success: <CheckCircle size={18} />,
    error: <XCircle size={18} />,
    warning: <AlertTriangle size={18} />,
    info: <Info size={18} />,
}

interface Props {
    toasts: Toast[]
    onRemove: (id: string) => void
}

export default function ToastContainer({ toasts, onRemove }: Props) {
    return (
        <div className="toast-container">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 80, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 80, scale: 0.9 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className={`toast toast-${toast.type}`}
                    >
                        <div className="toast-icon">{icons[toast.type]}</div>
                        <div className="toast-body">
                            <p className="toast-title">{toast.title}</p>
                            {toast.message && <p className="toast-message">{toast.message}</p>}
                        </div>
                        <button className="toast-close" onClick={() => onRemove(toast.id)}>
                            <X size={14} />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
}
