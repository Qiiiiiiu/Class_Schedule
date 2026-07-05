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
    const MAX_LIMIT = 100
    let allBindings = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const res = await db.collection('teacher_student_bindings').where({
        teacherId,
        status: db.command.in(['pending', 'approved', 'rejected', 'unbound'])
      }).orderBy('applyTime', 'desc').skip(offset).limit(MAX_LIMIT).get()

      allBindings = allBindings.concat(res.data)
      if (res.data.length < MAX_LIMIT) {
        hasMore = false
      } else {
        offset += MAX_LIMIT
      }
    }

    const studentIds = [...new Set(allBindings.map(item => item.studentId))]
    let allStudents = []

    for (let i = 0; i < studentIds.length; i += MAX_LIMIT) {
      const chunk = studentIds.slice(i, i + MAX_LIMIT)
      if (chunk.length > 0) {
        const res = await db.collection('users').where({
          openid: db.command.in(chunk)
        }).get()
        allStudents = allStudents.concat(res.data)
      }
    }

    const studentsMap = {}
    allStudents.forEach(item => {
      studentsMap[item.openid] = item
    })

    const result = allBindings.map(binding => {
      const student = studentsMap[binding.studentId]
      return {
        ...binding,
        studentName: student ? student.name : binding.studentName,
        studentPhone: student ? student.phone : '',
        studentInfo: student,
        nativePlace: student ? student.nativePlace : '',
        grade: student ? student.grade : '',
        subject: student ? student.subject : '',
        remark: student ? student.remark : ''
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
