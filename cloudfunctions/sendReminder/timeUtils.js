const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 将 UTC 毫秒时间戳格式化为北京时间 YYYY-MM-DD（仅加一次 +8h）
 */
function formatBeijingDate(utcMs) {
  const ts = typeof utcMs === 'number' ? utcMs : Date.now()
  const bj = new Date(ts + BEIJING_OFFSET_MS)
  const year = bj.getUTCFullYear()
  const month = String(bj.getUTCMonth() + 1).padStart(2, '0')
  const day = String(bj.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 将北京时间 YYYY-MM-DD 与 HH:mm 解析为 UTC 毫秒时间戳；非法返回 null
 */
function parseBeijingDateTimeToUTC(dateStr, hhmm) {
  if (typeof dateStr !== 'string' || typeof hhmm !== 'string') return null
  const dParts = dateStr.trim().split('-').map(Number)
  const tParts = hhmm.trim().split(':').map(Number)
  if (dParts.length !== 3 || tParts.length < 2) return null
  const [year, month, day] = dParts
  const [hour, minute] = tParts
  if ([year, month, day, hour, minute].some(n => !Number.isFinite(n))) return null
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }
  return Date.UTC(year, month - 1, day, hour, minute) - BEIJING_OFFSET_MS
}

/**
 * 显式判空解析提醒提前量（0 表示“不提醒”，不可被 || 吞掉）
 */
function resolveReminderMinutes(schedule, course) {
  if (schedule && typeof schedule.reminderTime === 'number' && Number.isFinite(schedule.reminderTime)) {
    return schedule.reminderTime
  }
  if (course && typeof course.reminderTime === 'number' && Number.isFinite(course.reminderTime)) {
    return course.reminderTime
  }
  return 15
}

/**
 * 判断当前 UTC 时间是否处于应触发提醒的窗口：
 * - reminderMinutes <= 0 直接返回 false（不提醒）
 * - 窗口为 [reminderUTC - 30s, courseUTC)，避免提前 5 分钟早发，也不因 cron 轻微延迟漏发
 */
function shouldTriggerReminder({ nowUTC, courseUTC, reminderMinutes }) {
  if (!Number.isFinite(nowUTC) || !Number.isFinite(courseUTC)) return false
  if (!Number.isFinite(reminderMinutes) || reminderMinutes <= 0) return false
  const reminderUTC = courseUTC - reminderMinutes * 60 * 1000
  return nowUTC >= (reminderUTC - 30 * 1000) && nowUTC < courseUTC
}

function maskId(id) {
  if (!id || typeof id !== 'string') return ''
  if (id.length <= 8) return '***'
  return `${id.slice(0, 4)}***${id.slice(-4)}`
}

module.exports = {
  BEIJING_OFFSET_MS,
  DAY_MS,
  formatBeijingDate,
  parseBeijingDateTimeToUTC,
  resolveReminderMinutes,
  shouldTriggerReminder,
  maskId
}
