import crypto from 'node:crypto';

export async function queueAnnouncement(pool, senderId, body, now = new Date()) {
  const { message, recipientIds, allTasters, scheduledAt } = body ?? {};
  if (typeof message !== 'string' || !message.trim() || message.length > 150) throw new Error('Enter a message of 1–150 characters.');
  const due = scheduledAt == null ? now : new Date(scheduledAt);
  if (!Number.isFinite(due.getTime()) || (scheduledAt != null && due <= now)) throw new Error('Choose a future date and time.');
  if (allTasters !== true && (!Array.isArray(recipientIds) || !recipientIds.length || recipientIds.some(id => !Number.isSafeInteger(id) || id < 1))) throw new Error('Select at least one taster.');
  const requested = allTasters === true ? null : [...new Set(recipientIds)];
  const [users] = await pool.query("SELECT user_id FROM users WHERE role = 'tester' AND is_active = 1" + (requested ? ' AND user_id IN (?)' : ''), requested ? [requested] : []);
  if (!users.length || (requested && users.length !== requested.length)) throw new Error('One or more selected tasters are unavailable. Refresh the list and try again.');
  const id = crypto.randomUUID();
  // One insert is atomic: all intended recipients are queued together.
  await pool.query('INSERT INTO tester_announcements (announcement_id, user_id, sender_id, message, scheduled_at) VALUES ?', [users.map(user => [id, user.user_id, senderId, message.trim(), due])]);
  return { id, recipientCount: users.length, scheduledAt: due.toISOString() };
}

export async function deliverAnnouncements(pool, sockets) {
  for (const socket of sockets) {
    const userId = Number(socket.data.auth?.id);
    if (!socket.connected || socket.data.auth?.role !== 'tester') continue;
    const [rows] = await pool.query(`SELECT a.announcement_id AS id, a.message, a.scheduled_at AS sentAt
      FROM tester_announcements a JOIN users u ON u.user_id = a.user_id
      WHERE a.user_id = ? AND u.is_active = 1 AND a.dismissed_at IS NULL AND a.scheduled_at <= NOW(3)
      ORDER BY a.scheduled_at, a.created_at`, [userId]);
    socket.data.sentAnnouncements ??= new Set();
    for (const row of rows) {
      if (!socket.connected || socket.data.sentAnnouncements.has(row.id)) continue;
      socket.emit('admin-announcement', { ...row, sentAt: new Date(row.sentAt).toISOString() });
      socket.data.sentAnnouncements.add(row.id);
    }
  }
}
