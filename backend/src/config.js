// Cau hinh tap trung - doc tu bien moi truong, co gia tri mac dinh cho dev.
export const config = {
  port: Number(process.env.PORT || 4000),
  dbClient: process.env.DB_CLIENT || 'sqlite', // 'sqlite' (dev/test) | 'mysql' (xem database/schema.sql)
  dbFile: process.env.DB_FILE || ':memory:',
  jwtSecret: process.env.JWT_SECRET || 'medibook-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  // Giu slot tam (phut) khi benh nhan dang o buoc xac nhan dat lich
  slotHoldMinutes: Number(process.env.SLOT_HOLD_MINUTES || 10),
  // Huy/doi lich chi duoc phep khi con it nhat X gio truoc gio kham
  cancelMinHours: Number(process.env.CANCEL_MIN_HOURS || 4),
};
