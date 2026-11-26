/**
 * 按日期计算课程子日程 Diff：
 * - 保留日期：保留原 schedule/_id 与 unfinished/_id 及 subscribers；仅当 startTime 变更时重置 teacherReminderSent
 * - 移除日期：删除对应 schedule 与 unfinished
 * - 新增日期：新建 schedule 与 unfinished
 */
function computeScheduleDiff(existingSchedules, unfinishedByScheduleId, selectedDates, newScheduleTime) {
  const uniqueDates = [...new Set((selectedDates || []).filter(Boolean))].sort()
  const targetDateSet = new Set(uniqueDates)

  // 将现有子课按 date 归类（同日若存在重复，仅保留第一条，其余归入删除）
  const keptByDate = new Map()
  const toRemove = []

  for (const sch of existingSchedules || []) {
    const d = sch && sch.schedule && sch.schedule.date
    if (d && targetDateSet.has(d) && !keptByDate.has(d)) {
      keptByDate.set(d, sch)
    } else {
      toRemove.push({
        schedule: sch,
        unfinished: unfinishedByScheduleId.get(sch._id) || null
      })
    }
  }

  const toUpdate = []
  const toAdd = []

  for (const date of uniqueDates) {
    const existing = keptByDate.get(date)
    if (existing) {
      const oldSch = existing.schedule || {}
      const startTimeChanged = oldSch.startTime !== newScheduleTime.startTime
      const endTimeChanged = oldSch.endTime !== newScheduleTime.endTime
      toUpdate.push({
        date,
        schedule: existing,
        unfinished: unfinishedByScheduleId.get(existing._id) || null,
        resetReminderMark: startTimeChanged,
        timeChanged: startTimeChanged || endTimeChanged
      })
    } else {
      toAdd.push(date)
    }
  }

  return { toUpdate, toRemove, toAdd }
}

module.exports = {
  computeScheduleDiff
}
