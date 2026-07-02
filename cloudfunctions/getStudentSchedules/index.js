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
    // 获取学生绑定的所有教师
    const bindingsRes = await db.collection('teacher_student_bindings')
      .where({
        studentId: studentId,
        status: db.command.in(['approved', 'pending'])
      })
      .get()

    const teacherIds = bindingsRes.data.map(b => b.teacherId)

    if (teacherIds.length === 0) {
      return {
        code: 0,
        data: []
      }
    }

    // 获取这些教师的课程安排
    const unfinishedRes = await db.collection('course_unfinished')
      .where({
        teacherId: _.in(teacherIds)
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