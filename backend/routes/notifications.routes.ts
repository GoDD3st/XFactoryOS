import { Router } from 'express';
import { NotificationService } from '@/services/notifications/notificationService';
import { validateBody } from '../middleware/validateBody';
import { CreateNotificationSchema } from '../validators';

export const notificationsRouter = Router();

// GET /api/notifications — User's notifications
notificationsRouter.get('/', async (req, res) => {
  try {
    const data = NotificationService.getNotifications();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la récupération des notifications' });
  }
});

// POST /api/notifications — Send notification (user_id forced from req.user)
notificationsRouter.post('/', validateBody(CreateNotificationSchema), async (req, res) => {
  try {
    const { title, message, type } = req.body;
    const user_id = req.user!.id;
    const notif = NotificationService.sendNotification(user_id, title, message, type || 'info');
    res.status(201).json({ success: true, data: notif });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de l\'envoi de la notification' });
  }
});

// PUT /api/notifications/:id/read — Mark notification as read
notificationsRouter.put('/:id/read', async (req, res) => {
  try {
    NotificationService.markAsRead(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Échec de la mise à jour de la notification' });
  }
});
