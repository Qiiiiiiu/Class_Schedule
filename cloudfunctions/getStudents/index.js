const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { teacherId } = event

  if (!teacherId) {
    return {
      code: 1,
      message: 'teacherId不能为空'
    }
  }

  try {
    const bindingsRes = await db.collection('teacher_student_bindings').where({
      teacherId,
      status: db.command.in(['pending', 'approved', 'rejected', 'unbound'])
    }).orderBy('applyTime', 'desc').get()

    const studentIds = [...new Set(bindingsRes.data.map(item => item.studentId))]

    const studentsRes = await db.collection('users').where({
      openid: db.command.in(studentIds)
    }).get()

    const studentsMap = {}
    studentsRes.data.forEach(item => {
      studentsMap[item.openid] = item
    })

    const result = bindingsRes.data.map(binding => {
      const student = studentsMap[binding.studentId]
      return {
        ...binding,
        studentName: student ? student.name : binding.studentName,
        studentPhone: student ? student.phone : '',
        studentInfo: student
      }
    })

    return {
      code: 0,
      data: result
    }
  } catch (err) {
    return {
      code: 1,
      message: '查询失败',
      error: err.message
    }
  }
}