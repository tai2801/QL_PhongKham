// Logic slot thuan (pure functions) - tach rieng de unit test de dang.
// Thoi gian xu ly theo "local naive": slot_start luu dang 'YYYY-MM-DDTHH:MM'
// de tranh lech mui gio giua server va trinh duyet trong moi truong hoc tap.

export function toDateKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function toTimeKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function parseSlotStart(s) {
  // 'YYYY-MM-DDTHH:MM' -> Date local
  const [datePart, timePart] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}
export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}
export function formatSlotStart(d) {
  return `${toDateKey(d)}T${toTimeKey(d)}`;
}

/**
 * Sinh danh sach slot trong 1 ngay tu cac khung gio lam viec cua bac si.
 * schedules: [{start_time:'08:00', end_time:'11:30'}] cua dung thu trong tuan do.
 * Tra ve [{slotStart, slotEnd}] dang chuoi.
 */
export function generateDaySlots(dateKey, schedules, slotMinutes) {
  const out = [];
  for (const sch of schedules) {
    let cur = parseSlotStart(`${dateKey}T${sch.start_time}`);
    const end = parseSlotStart(`${dateKey}T${sch.end_time}`);
    while (addMinutes(cur, slotMinutes) <= end) {
      const nxt = addMinutes(cur, slotMinutes);
      out.push({ slotStart: formatSlotStart(cur), slotEnd: formatSlotStart(nxt) });
      cur = nxt;
    }
  }
  return out.sort((a, b) => a.slotStart.localeCompare(b.slotStart));
}

/** Kiem tra 1 slotStart co dung luoi slot hop le cua bac si trong ngay do khong. */
export function isAlignedSlot(dateKey, schedules, slotMinutes, slotStart) {
  return generateDaySlots(dateKey, schedules, slotMinutes).some((s) => s.slotStart === slotStart);
}

/** Con du thoi gian de huy/doi lich khong (theo cau hinh cancelMinHours). */
export function canModifyAt(slotStart, now, cancelMinHours) {
  const start = parseSlotStart(slotStart).getTime();
  return start - now.getTime() >= cancelMinHours * 3600 * 1000;
}

export const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'NO_SHOW'];
export const VALID_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'],
  ARRIVED: ['COMPLETED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
export function canTransition(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}
