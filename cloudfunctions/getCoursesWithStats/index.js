const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { teacherId } = event

  if (!teacherId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const [coursesRes, schedulesRes] = await Promise.all([
      db.collection('courses').where({
        teacherId
      }).orderBy('createTime', 'desc').get(),
      db.collection('course_schedule').where({
        teacherId,
        status: 'available'
      }).get()
    ])

    const childCountMap = {}
    schedulesRes.data.forEach(schedule => {
      if (schedule.parentId) {
        if (!childCountMap[schedule.parentId]) {
          childCountMap[schedule.parentId] = 0
        }
        childCountMap[schedule.parentId]++
      }
    })

    const coursesWithStats = coursesRes.data.map(course => ({
      ...course,
      studentCount: course.students ? course.students.length : 0,
      childCourseCount: childCountMap[course._id] || 0
    }))

    return {
      code: 0,
      data: coursesWithStats
    }
  } catch (err) {
    console.error('获取课程失败:', err)
    return {
      code: 1,
      message: '获取失败',
      error: err.message
    }
  }
}
