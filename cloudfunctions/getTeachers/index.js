const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { studentId } = event

  try {
    const teachersRes = await db.collection('users').where({
      role: 'teacher'
    }).get()

    let teacherList = teachersRes.data.map(teacher => ({
      openid: teacher.openid,
      name: teacher.name,
      phone: teacher.phone,
      bindingStatus: 'not_binding'
    }))

    if (studentId) {
      const bindingsRes = await db.collection('teacher_student_bindings').where({
        studentId
      }).get()

      const bindingMap = {}
      bindingsRes.data.forEach(item => {
        bindingMap[item.teacherId] = item.status
      })

      teacherList = teacherList.map(teacher => ({
        ...teacher,
        bindingStatus: bindingMap[teacher.openid] || 'not_binding'
      }))
    }

    return {
      code: 0,
      data: teacherList
    }
  } catch (err) {
    console.error('获取教师列表失败:', err)
    return {
      code: 1,
      message: '获取失败',
      error: err.message
    }
  }
}
