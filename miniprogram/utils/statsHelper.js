/**
 * 教师月度收入与工作量统计计算模块
 * 供月度统计看板与课程管理总览页共用，保证口径完全一致
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10
}

function formatMoney(n) {
  const r = round2(n)
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '')
}

function getMonthRange(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  return {
    daysInMonth,
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`
  }
}

function calcDurationHours(startTime, endTime) {
  if (!startTime || !endTime) return 0
  const [sh, sm] = String(startTime).split(':').map(Number)
  const [eh, em] = String(endTime).split(':').map(Number)
  if ([sh, sm, eh, em].some(isNaN)) return 0
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60)
}

function isFinishedSchedule(dateStr, startTime, status, now) {
  if (status === 'finished') return true
  if (!dateStr || !startTime) return false
  const dp = String(dateStr).split('-').map(Number)
  const tp = String(startTime).split(':').map(Number)
  if (dp.length !== 3 || tp.length < 2 || dp.some(isNaN) || tp.some(isNaN)) return false
  const dt = new Date(dp[0], dp[1] - 1, dp[2], tp[0], tp[1], 0)
  return !isNaN(dt.getTime()) && dt < now
}

function computeMonthlyStats(courses, schedules, year, month, nowDate = new Date()) {
  const { daysInMonth } = getMonthRange(year, month)

  // 建立父班级映射（作为 classType / billingMode / price / students 的权威兜底）
  const courseMap = {}
  ;(courses || []).forEach(c => {
    if (!c || !c._id) return
    const studentsLen = Array.isArray(c.students) ? c.students.length : (Number(c.studentCount) || 0)
    const classType = (c.classType === 'one_on_one' || c.classType === 'group')
      ? c.classType
      : (studentsLen > 1 ? 'group' : 'one_on_one')
    const billingMode = classType === 'group' && c.billingMode === 'per_student'
      ? 'per_student'
      : 'per_session'
    courseMap[c._id] = {
      _id: c._id,
      name: c.name || '未命名班级',
      classType,
      billingMode,
      price: Number(c.price) || 0,
      studentsLen
    }
  })

  const dailySeries = []
  for (let d = 1; d <= daysInMonth; d++) {
    dailySeries.push({
      day: d,
      revenue: 0,
      earnedRevenue: 0,
      hours: 0,
      lessons: 0
    })
  }

  let totalRevenue = 0
  let earnedRevenue = 0
  let totalLessons = 0
  let finishedLessons = 0
  let totalHours = 0
  let finishedHours = 0
  const activeDaySet = new Set()

  const typeStats = {
    one_on_one: { revenue: 0, earned: 0, lessons: 0, hours: 0 },
    group: { revenue: 0, earned: 0, lessons: 0, hours: 0 }
  }

  const classAgg = {}

  ;(schedules || []).forEach(item => {
    if (!item || !item.schedule || !item.schedule.date) return
    const sch = item.schedule
    const parent = (item.parentId && courseMap[item.parentId]) || null

    const itemStudentsLen = Array.isArray(item.students) && item.students.length > 0
      ? item.students.length
      : (parent ? parent.studentsLen : (Number(item.studentCount) || 0))

    const classType = parent
      ? parent.classType
      : ((item.classType === 'one_on_one' || item.classType === 'group')
        ? item.classType
        : (itemStudentsLen > 1 ? 'group' : 'one_on_one'))

    const billingMode = classType === 'group' && ((parent && parent.billingMode === 'per_student') || item.billingMode === 'per_student')
      ? 'per_student'
      : 'per_session'

    const unitPrice = (Number(item.price) > 0) ? Number(item.price) : (parent ? parent.price : 0)
    const hours = calcDurationHours(sch.startTime, sch.endTime)
    const multiplier = billingMode === 'per_student' ? itemStudentsLen : 1
    const amount = hours * unitPrice * multiplier
    const finished = isFinishedSchedule(sch.date, sch.startTime, item.status, nowDate)

    totalRevenue += amount
    totalLessons += 1
    totalHours += hours
    if (finished) {
      earnedRevenue += amount
      finishedLessons += 1
      finishedHours += hours
    }
    activeDaySet.add(sch.date)

    const bucket = typeStats[classType === 'group' ? 'group' : 'one_on_one']
    bucket.revenue += amount
    bucket.lessons += 1
    bucket.hours += hours
    if (finished) bucket.earned += amount

    // 日分布
    const dayParts = String(sch.date).split('-').map(Number)
    if (dayParts.length === 3 && dayParts[0] === year && dayParts[1] === month) {
      const idx = dayParts[2] - 1
      if (idx >= 0 && idx < dailySeries.length) {
        dailySeries[idx].revenue += amount
        if (finished) dailySeries[idx].earnedRevenue += amount
        dailySeries[idx].hours += hours
        dailySeries[idx].lessons += 1
      }
    }

    // 班级聚合
    const classKey = item.parentId || `single_${item.name || item._id}`
    if (!classAgg[classKey]) {
      classAgg[classKey] = {
        parentId: item.parentId || '',
        name: (parent && parent.name) || item.name || '未命名班级',
        classType,
        classTypeLabel: classType === 'group' ? '大班课' : '一对一',
        billingLabel: classType === 'group' ? (billingMode === 'per_student' ? '按人头' : '按班次') : '',
        lessons: 0,
        finishedLessons: 0,
        hours: 0,
        revenue: 0,
        earnedRevenue: 0
      }
    }
    const ca = classAgg[classKey]
    ca.lessons += 1
    if (finished) ca.finishedLessons += 1
    ca.hours += hours
    ca.revenue += amount
    if (finished) ca.earnedRevenue += amount
  })

  dailySeries.forEach(d => {
    d.revenue = round2(d.revenue)
    d.earnedRevenue = round2(d.earnedRevenue)
    d.hours = round1(d.hours)
  })

  const totalRevRounded = round2(totalRevenue)
  const earnedRevRounded = round2(earnedRevenue)
  const upcomingRevRounded = round2(Math.max(0, totalRevenue - earnedRevenue))

  const oneOnOneRatio = totalRevRounded > 0
    ? Math.round((typeStats.one_on_one.revenue / totalRevRounded) * 100)
    : (totalLessons > 0 ? Math.round((typeStats.one_on_one.lessons / totalLessons) * 100) : 50)
  const groupRatio = totalLessons > 0 ? Math.max(0, 100 - oneOnOneRatio) : 50

  const classBreakdown = Object.values(classAgg)
    .map(c => ({
      ...c,
      hours: round1(c.hours),
      revenue: round2(c.revenue),
      earnedRevenue: round2(c.earnedRevenue),
      revenueStr: formatMoney(c.revenue),
      earnedStr: formatMoney(c.earnedRevenue),
      sharePct: totalRevRounded > 0
        ? Math.max(2, Math.round((c.revenue / totalRevRounded) * 100))
        : (totalLessons > 0 ? Math.max(2, Math.round((c.lessons / totalLessons) * 100)) : 0)
    }))
    .sort((a, b) => (b.revenue !== a.revenue ? b.revenue - a.revenue : b.hours - a.hours))

  return {
    totalRevenue: totalRevRounded,
    earnedRevenue: earnedRevRounded,
    upcomingRevenue: upcomingRevRounded,
    totalRevenueStr: formatMoney(totalRevRounded),
    earnedRevenueStr: formatMoney(earnedRevRounded),
    upcomingRevenueStr: formatMoney(upcomingRevRounded),
    totalLessons,
    finishedLessons,
    upcomingLessons: totalLessons - finishedLessons,
    totalHours: round1(totalHours),
    finishedHours: round1(finishedHours),
    upcomingHours: round1(Math.max(0, totalHours - finishedHours)),
    activeDays: activeDaySet.size,
    oneOnOne: {
      revenue: round2(typeStats.one_on_one.revenue),
      revenueStr: formatMoney(typeStats.one_on_one.revenue),
      earnedStr: formatMoney(typeStats.one_on_one.earned),
      lessons: typeStats.one_on_one.lessons,
      hours: round1(typeStats.one_on_one.hours),
      ratioPct: oneOnOneRatio
    },
    group: {
      revenue: round2(typeStats.group.revenue),
      revenueStr: formatMoney(typeStats.group.revenue),
      earnedStr: formatMoney(typeStats.group.earned),
      lessons: typeStats.group.lessons,
      hours: round1(typeStats.group.hours),
      ratioPct: groupRatio
    },
    dailySeries,
    classBreakdown
  }
}

module.exports = {
  getMonthRange,
  formatMoney,
  computeMonthlyStats
}
