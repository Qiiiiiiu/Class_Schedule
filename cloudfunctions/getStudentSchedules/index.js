const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { studentId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  const effectiveStudentId = callerOpenid || studentId
  if (!effectiveStudentId) {
    return { code: 1, message: '参数不完整' }
  }
  if (callerOpenid && studentId && studentId !== callerOpenid) {
    return { code: 1, message: '无权限查看他人课表' }
  }

  try {
    // 1. 分页获取学生已加入的所有课程（包含自建和教师开课）
    const MAX_LIMIT = 100
    let myCourses = []
    let courseOffset = 0
    while (true) {
      const res = await db.collection('courses')
        .where({ students: _.elemMatch(_.eq(effectiveStudentId)) })
        .skip(courseOffset)
        .limit(MAX_LIMIT)
        .get()
      const batch = res.data || []
      myCourses = myCourses.concat(batch)
      if (batch.length < MAX_LIMIT) break
      courseOffset += MAX_LIMIT
    }

    const courseIds = myCourses.map(c => c._id)
    if (courseIds.length === 0) {
      return { code: 0, data: [] }
    }

    const courseMap = {}
    myCourses.forEach(c => {
      courseMap[c._id] = c
    })

    // 2. 分页获取所有对应日程（保留 status='finished' 的历史课程，见 BUG-07）
    let allUnfinished = []
    let offset = 0
    while (true) {
      const res = await db.collection('course_unfinished')
        .where({ parentId: _.in(courseIds) })
        .orderBy('schedule.date', 'asc')
        .orderBy('schedule.startTime', 'asc')
        .skip(offset)
        .limit(MAX_LIMIT)
        .get()
      const batch = res.data || []
      allUnfinished = allUnfinished.concat(batch)
      if (batch.length < MAX_LIMIT) break
      offset += MAX_LIMIT
    }

    const result = allUnfinished.map(unfinished => {
      const course = courseMap[unfinished.parentId]
      const scheduleStatus = unfinished.status || 'pending'
      return {
        ...unfinished,
        courseName: course ? course.name : unfinished.name,
        teacherName: course ? course.teacherName : '',
        creatorRole: course ? course.creatorRole : unfinished.creatorRole,
        createdBy: course ? course.createdBy : unfinished.createdBy,
        price: course ? course.price : 0,
        status: course ? course.status : 'available',
        scheduleStatus,
        isFinished: scheduleStatus === 'finished'
      }
    })

    return {
      code: 0,
      data: result
    }
  } catch (err) {
    console.error('[getStudentSchedules] error:', err.message)
    return {
      code: 1,
      message: '获取失败',
      error: err.message
    }
  }
}
