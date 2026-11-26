const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function resolveClassType(course) {
  if (course.classType === 'one_on_one' || course.classType === 'group') {
    return course.classType
  }
  return Array.isArray(course.students) && course.students.length > 1 ? 'group' : 'one_on_one'
}

exports.main = async (event, context) => {
  const { teacherId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  const effectiveTeacherId = callerOpenid || teacherId
  if (!effectiveTeacherId) {
    return { code: 1, message: '参数不完整' }
  }
  if (callerOpenid && teacherId && teacherId !== callerOpenid) {
    return { code: 1, message: '无权限查看他人课程统计' }
  }

  try {
    const MAX_LIMIT = 100
    let allCourses = []
    let offset = 0
    while (true) {
      const res = await db.collection('courses')
        .where({ teacherId: effectiveTeacherId })
        .orderBy('createTime', 'desc')
        .skip(offset)
        .limit(MAX_LIMIT)
        .get()
      const batch = res.data || []
      allCourses = allCourses.concat(batch)
      if (batch.length < MAX_LIMIT) break
      offset += MAX_LIMIT
    }

    let allSchedules = []
    offset = 0
    while (true) {
      const res = await db.collection('course_schedule')
        .where({
          teacherId: effectiveTeacherId,
          status: 'available'
        })
        .skip(offset)
        .limit(MAX_LIMIT)
        .get()
      const batch = res.data || []
      allSchedules = allSchedules.concat(batch)
      if (batch.length < MAX_LIMIT) break
      offset += MAX_LIMIT
    }

    const scheduleMap = {}
    allSchedules.forEach(schedule => {
      if (schedule.parentId) {
        if (!scheduleMap[schedule.parentId]) {
          scheduleMap[schedule.parentId] = []
        }
        scheduleMap[schedule.parentId].push(schedule)
      }
    })

    const now = new Date()

    const coursesWithStats = allCourses.map(course => {
      const classType = resolveClassType(course)
      const capacity = typeof course.capacity === 'number'
        ? course.capacity
        : (classType === 'one_on_one' ? 1 : 0)
      const billingMode = classType === 'group' && course.billingMode === 'per_student'
        ? 'per_student'
        : 'per_session'
      const allowApply = typeof course.allowApply === 'boolean'
        ? course.allowApply
        : (classType === 'group')

      const childCourses = scheduleMap[course._id] || []
      const pricePerHour = course.price || 0
      const classStudentCount = Array.isArray(course.students) ? course.students.length : 0

      let totalAmount = 0
      let earnedAmount = 0
      let finishedCourseCount = 0

      childCourses.forEach(child => {
        if (child.schedule && child.schedule.startTime && child.schedule.endTime) {
          const [startH, startM] = child.schedule.startTime.split(':').map(Number)
          const [endH, endM] = child.schedule.endTime.split(':').map(Number)
          const hours = Math.max(0, (endH * 60 + endM - startH * 60 - startM) / 60)
          const childPrice = child.price || pricePerHour
          const childStudents = (Array.isArray(child.students) && child.students.length > 0)
            ? child.students.length
            : classStudentCount
          const multiplier = billingMode === 'per_student' ? childStudents : 1
          const sessionAmount = hours * childPrice * multiplier

          totalAmount += sessionAmount

          if (child.schedule.date) {
            const courseDateTime = new Date(`${child.schedule.date}T${child.schedule.startTime}:00+08:00`)
            if (courseDateTime < now) {
              earnedAmount += sessionAmount
              finishedCourseCount += 1
            }
          }
        }
      })

      return {
        ...course,
        classType,
        capacity,
        billingMode,
        allowApply,
        studentCount: classStudentCount,
        childCourseCount: childCourses.length,
        finishedCourseCount,
        totalAmount: Math.round(totalAmount * 100) / 100,
        earnedAmount: Math.round(earnedAmount * 100) / 100
      }
    })

    return {
      code: 0,
      data: coursesWithStats
    }
  } catch (err) {
    console.error('[getCoursesWithStats] error:', err.message)
    return {
      code: 1,
      message: '获取失败',
      error: err.message
    }
  }
}
