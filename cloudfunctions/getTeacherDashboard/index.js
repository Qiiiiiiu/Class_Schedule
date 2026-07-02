const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { teacherId, startDate, endDate } = event

  if (!teacherId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const scheduleQuery = {
      teacherId,
      status: 'available'
    }

    if (startDate && endDate) {
      scheduleQuery['schedule.date'] = _.gte(startDate).and(_.lte(endDate))
    } else if (startDate) {
      scheduleQuery['schedule.date'] = _.gte(startDate)
    } else if (endDate) {
      scheduleQuery['schedule.date'] = _.lte(endDate)
    }

    const [studentsRes, coursesRes, scheduleRes, bindingsCountRes, applicationsCountRes, bindingsRes, applicationsRes] = await Promise.all([
      db.collection('users').where({
        teacherId,
        role: 'student'
      }).count(),
      db.collection('courses').where({
        teacherId
      }).count(),
      db.collection('course_schedule').where(scheduleQuery).get(),
      db.collection('teacher_student_bindings').where({
        teacherId,
        status: 'pending'
      }).count(),
      db.collection('course_applications').where({
        teacherId,
        status: 'pending'
      }).count(),
      db.collection('teacher_student_bindings').where({
        teacherId,
        status: 'pending'
      }).orderBy('applyTime', 'desc').limit(2).get(),
      db.collection('course_applications').where({
        teacherId,
        status: 'pending'
      }).limit(2).get()
    ])

    const pendingBindings = bindingsRes.data.map(item => ({
      _id: item._id,
      studentName: item.studentName
    }))

    const pendingApplications = applicationsRes.data.map(item => ({
      _id: item._id,
      studentName: item.studentName,
      courseName: item.courseName
    }))

    return {
      code: 0,
      data: {
        studentCount: studentsRes.total,
        courseCount: coursesRes.total,
        scheduleCount: scheduleRes.data.length,
        schedules: scheduleRes.data,
        pendingBindingsCount: bindingsCountRes.total,
        pendingApplicationsCount: applicationsCountRes.total,
        pendingBindings,
        pendingApplications
      }
    }
  } catch (err) {
    console.error('获取仪表盘数据失败:', err)
    return {
      code: 1,
      message: '获取失败',
      error: err.message
    }
  }
}
