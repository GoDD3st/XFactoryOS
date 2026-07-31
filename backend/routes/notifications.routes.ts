import { Router } from 'express';
import { NotificationService } from '@/services/notifications/notificationService';

export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  try {
    const data = NotificationService.getNotifications();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

notificationsRouter.post('/', async (req, res) => {
  try {
    const { user_id, title, message, type } = req.body;
    const notif = NotificationService.sendNotification(user_id, title, message, type);
    res.json({ success: true, data: notif });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to send notification' });
  }
});

notificationsRouter.put('/:id/read', async (req, res) => {
  try {
    NotificationService.markAsRead(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
});
