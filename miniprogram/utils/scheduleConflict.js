/**
 * 排课时间冲突检测工具
 * 覆盖：新建班级/加课（单选日期 & 重复排课）、单节改期、批量顺延/批量改期
 */
const api = require('./api.js')

function formatDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDaysToDateStr(dateStr, offsetDays) {
  const parts = String(dateStr || '').split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr
  const d = new Date(parts[0], parts[1] - 1, parts[2] + offsetDays)
  return formatDateStr(d)
}

function parseTimeToMinutes(timeStr) {
  const parts = String(timeStr || '').split(':').map(Number)
  if (parts.length < 2 || parts.some(isNaN)) return null
  return parts[0] * 60 + parts[1]
}

/**
 * 与云函数 addCourse/addCourseSchedule 保持一致的重复排课日期展开逻辑
 */
function expandRepeatDates(repeatStartDate, weekdays, repeatCount) {
  if (!Array.isArray(weekdays) || weekdays.length === 0) return []
  const weekdaySet = new Set(weekdays.map(Number).filter(n => !isNaN(n)))
  if (weekdaySet.size === 0) return []

  let startDate
  if (repeatStartDate) {
    const parts = String(repeatStartDate).split('-').map(Number)
    if (parts.length === 3 && !parts.some(isNaN)) {
      startDate = new Date(parts[0], parts[1] - 1, parts[2])
    }
  }
  if (!startDate || isNaN(startDate.getTime())) {
    const today = new Date()
    startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  }

  const maxCount = repeatCount === -1 ? 100 : Math.min(Math.max(1, Number(repeatCount) || 1), 200)
  const dates = []
  const cursor = new Date(startDate)
  let guard = 0

  while (dates.length < maxCount && guard < 1500) {
    guard++
    if (weekdaySet.has(cursor.getDay())) {
      dates.push(formatDateStr(cursor))
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

/**
 * 判断同一天两段时间是否重叠（首尾相接如 09:00-10:00 与 10:00-11:00 不算冲突）
 */
function isTimeOverlap(startA, endA, startB, endB) {
  const sa = parseTimeToMinutes(startA)
  const ea = parseTimeToMinutes(endA)
  const sb = parseTimeToMinutes(startB)
  const eb = parseTimeToMinutes(endB)
  if (sa === null || ea === null || sb === null || eb === null) return false
  return sa < eb && sb < ea
}

/**
 * 纯函数冲突比对（方便单测）
 * @param {Array<{date: string, startTime: string, endTime: string, label?: string}>} proposedSlots
 * @param {Array} existingSchedules
 * @param {Array<string>} excludeIds 需要排除的已有日程 _id（改期/批量移动自身时排除）
 */
function findConflicts(proposedSlots, existingSchedules, excludeIds = []) {
  const excludeSet = new Set((excludeIds || []).filter(Boolean).map(String))
  const existingByDate = {}

  ;(existingSchedules || []).forEach(item => {
    if (!item || !item.schedule || !item.schedule.date) return
    if (item._id && excludeSet.has(String(item._id))) return
    const d = item.schedule.date
    if (!existingByDate[d]) existingByDate[d] = []
    existingByDate[d].push(item)
  })

  const conflicts = []
  const seenKeys = new Set()

  // 1. 与老师现有课表比对
  ;(proposedSlots || []).forEach(slot => {
    if (!slot || !slot.date || !slot.startTime || !slot.endTime) return
    const dayList = existingByDate[slot.date] || []
    dayList.forEach(exist => {
      const sch = exist.schedule || {}
      if (isTimeOverlap(slot.startTime, slot.endTime, sch.startTime, sch.endTime)) {
        const key = `${slot.date}|${slot.startTime}|${slot.endTime}|${exist._id || exist.name}`
        if (seenKeys.has(key)) return
        seenKeys.add(key)
        conflicts.push({
          type: 'existing',
          date: slot.date,
          proposedRange: `${slot.startTime}-${slot.endTime}`,
          conflictName: exist.name || '已有课程',
          conflictRange: `${sch.startTime || ''}-${sch.endTime || ''}`,
          conflictId: exist._id || ''
        })
      }
    })
  })

  // 2. 待提交多节排课之间的内部冲突
  const list = (proposedSlots || []).filter(s => s && s.date && s.startTime && s.endTime)
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      if (a.date === b.date && isTimeOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
        const key = `self|${a.date}|${a.startTime}|${b.startTime}`
        if (seenKeys.has(key)) continue
        seenKeys.add(key)
        conflicts.push({
          type: 'self',
          date: a.date,
          proposedRange: `${a.startTime}-${a.endTime}`,
          conflictName: b.label || '本次待排其他课次',
          conflictRange: `${b.startTime}-${b.endTime}`,
          conflictId: ''
        })
      }
    }
  }

  conflicts.sort((a, b) => `${a.date} ${a.proposedRange}`.localeCompare(`${b.date} ${b.proposedRange}`))
  return conflicts
}

function formatConflictSummary(conflicts, maxLines = 4) {
  const shown = conflicts.slice(0, maxLines).map(c => {
    const md = String(c.date || '').slice(5).replace('-', '/')
    return `• ${md} ${c.proposedRange} 与「${c.conflictName}」(${c.conflictRange}) 重叠`
  })
  if (conflicts.length > maxLines) {
    shown.push(`…等共 ${conflicts.length} 处时间冲突`)
  }
  return shown.join('\n')
}

/**
 * 查询老师对应日期区间内的课表并弹窗确认冲突
 * @returns {Promise<boolean>} true 表示无冲突或用户确认仍要保存；false 表示用户取消
 */
async function checkAndConfirmConflicts(teacherId, proposedSlots, options = {}) {
  const validSlots = (proposedSlots || []).filter(s => s && s.date && s.startTime && s.endTime)
  if (!teacherId || validSlots.length === 0) return true

  const dates = validSlots.map(s => s.date).sort()
  const startDate = dates[0]
  const endDate = dates[dates.length - 1]

  let existing = []
  try {
    const res = await api.getSchedule(teacherId, { startDate, endDate })
    if (Array.isArray(res)) existing = res
  } catch (err) {
    console.warn('[scheduleConflict] fetch existing schedule failed:', err)
    return true
  }

  const conflicts = findConflicts(validSlots, existing, options.excludeIds || [])
  if (conflicts.length === 0) return true

  const detailText = formatConflictSummary(conflicts, 4)
  return new Promise(resolve => {
    wx.showModal({
      title: `检测到 ${conflicts.length} 处排课冲突`,
      content: `${detailText}\n\n是否仍要继续保存？`,
      cancelText: '返回修改',
      confirmText: '仍要保存',
      confirmColor: '#f59e0b',
      success: res => resolve(Boolean(res.confirm)),
      fail: () => resolve(false)
    })
  })
}

module.exports = {
  formatDateStr,
  addDaysToDateStr,
  parseTimeToMinutes,
  expandRepeatDates,
  isTimeOverlap,
  findConflicts,
  formatConflictSummary,
  checkAndConfirmConflicts
}
