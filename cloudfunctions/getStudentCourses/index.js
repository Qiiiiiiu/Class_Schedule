const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { studentId, teacherId } = event

  if (!studentId || !teacherId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const MAX_LIMIT = 100
    let allCourses = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const res = await db.collection('courses').where({
        teacherId,
        students: _.elemMatch(_.eq(studentId)),
        status: 'available'
      }).skip(offset).limit(MAX_LIMIT).get()

      allCourses = allCourses.concat(res.data)
      if (res.data.length < MAX_LIMIT) {
        hasMore = false
      } else {
        offset += MAX_LIMIT
      }
    }

    return {
      code: 0,
      data: allCourses
    }
  } catch (err) {
    console.error('获取学生课程失败:', err)
    return {
      code: 1,
      message: '获取失败',
      error: err.message
    }
  }
}
