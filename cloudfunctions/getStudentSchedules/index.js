const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { studentId } = event

  if (!studentId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    // 获取学生已加入的所有课程 (包含自建和教师开课)
    const myCoursesRes = await db.collection('courses')
      .where({
        students: _.elemMatch(_.eq(studentId))
      })
      .get()

    const courseIds = myCoursesRes.data.map(c => c._id)

    if (courseIds.length === 0) {
      return {
        code: 0,
        data: []
      }
    }

    // 获取这些课程的日程安排
    const unfinishedRes = await db.collection('course_unfinished')
      .where({
        parentId: _.in(courseIds)
      })
      .orderBy('schedule.date', 'asc')
      .orderBy('schedule.startTime', 'asc')
      .get()

    // 获取课程详情
    const parentIds = [...new Set(unfinishedRes.data.map(u => u.parentId))]
    const coursesRes = await db.collection('courses')
      .where({
        _id: _.in(parentIds)
      })
      .get()

    const courseMap = {}
    coursesRes.data.forEach(c => {
      courseMap[c._id] = c
    })

    const result = unfinishedRes.data.map(unfinished => {
      const course = courseMap[unfinished.parentId]
      return {
        ...unfinished,
        courseName: course ? course.name : unfinished.name,
        teacherName: course ? course.teacherName : '',
        price: course ? course.price : 0,
        status: course ? course.status : 'available'
      }
    })

    return {
      code: 0,
      data: result
    }
  } catch (err) {
    console.error('获取学生课程安排失败:', err)
    return {
      code: 1,
      message: '获取失败',
      error: err.message
    }
  }
}