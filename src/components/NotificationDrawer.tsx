import { Bell, Check, ShieldAlert, X } from 'lucide-react';
import type { NotificationRecord } from '../types/civic';
import { markNotificationRead } from '../services/civicService';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: NotificationRecord[];
}

export function NotificationDrawer({ open, onClose, notifications }: NotificationDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="w-full max-w-md bg-white h-full border-l border-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-semibold text-slate-900">Real-Time Notifications</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded"
            aria-label="Close notifications"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No notifications yet. Firestore real-time alerts for assignments, emergencies, MFIRs, and resolutions appear here automatically.
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`p-4 space-y-2 ${n.read ? 'bg-white' : 'bg-blue-50/40'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                    {n.severity === 'Critical' && <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />}
                    <span>{n.title}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 shrink-0">
                    {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                {n.escalationDeadline && !n.acknowledgedAt && (
                  <div className="text-[11px] font-mono text-red-700">
                    Escalation deadline: {new Date(n.escalationDeadline).toLocaleTimeString()}
                  </div>
                )}
                <div className="flex items-center gap-3 pt-1">
                  {!n.read && (
                    <button
                      type="button"
                      onClick={() => void markNotificationRead(n.id, false)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                    >
                      <Check className="w-3.5 h-3.5" /> Mark Read
                    </button>
                  )}
                  {n.requiresAck && !n.acknowledgedAt && (
                    <button
                      type="button"
                      onClick={() => void markNotificationRead(n.id, true)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline"
                    >
                      Acknowledge Alert
                    </button>
                  )}
                  {n.acknowledgedAt && (
                    <span className="text-[11px] text-emerald-700">
                      Acknowledged at {new Date(n.acknowledgedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
