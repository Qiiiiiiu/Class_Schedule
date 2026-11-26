const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { studentId, teacherId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  const effectiveTeacherId = callerOpenid || teacherId
  if (!studentId || !effectiveTeacherId) {
    return { code: 1, message: '参数不完整' }
  }
  if (callerOpenid && teacherId && teacherId !== callerOpenid) {
    return { code: 1, message: '无权限查看他人学生课程' }
  }

  try {
    const MAX_LIMIT = 100
    let allCourses = []
    let offset = 0

    while (true) {
      const res = await db.collection('courses').where({
        teacherId: effectiveTeacherId,
        students: _.elemMatch(_.eq(studentId))
      }).skip(offset).limit(MAX_LIMIT).get()

      const batch = res.data || []
      allCourses = allCourses.concat(batch)
      if (batch.length < MAX_LIMIT) break
      offset += MAX_LIMIT
    }

    const normalized = allCourses.map(c => {
      const classType = (c.classType === 'one_on_one' || c.classType === 'group')
        ? c.classType
        : (Array.isArray(c.students) && c.students.length > 1 ? 'group' : 'one_on_one')
      return {
        ...c,
        classType,
        studentCount: Array.isArray(c.students) ? c.students.length : 0
      }
    })

    return {
      code: 0,
      data: normalized
    }
  } catch (err) {
    console.error('[getStudentCourses] error:', err.message)
    return {
      code: 1,
      message: '获取失败',
      error: err.message
    }
  }
}
