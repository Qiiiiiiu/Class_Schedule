const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { studentId, teacherId, studentName, teacherName } = event

  if (!studentId || !teacherId || !studentName || !teacherName) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const checkRes = await db.collection('teacher_student_bindings').where({
      studentId,
      teacherId,
      status: db.command.in(['pending', 'approved'])
    }).get()

    if (checkRes.data && checkRes.data.length > 0) {
      return {
        code: 1,
        message: '绑定申请已存在'
      }
    }

    const res = await db.collection('teacher_student_bindings').add({
      data: {
        studentId,
        teacherId,
        studentName,
        teacherName,
        status: 'pending',
        applyTime: db.serverDate(),
        approveTime: null,
        remark: ''
      }
    })

    return {
      code: 0,
      data: { _id: res._id }
    }
  } catch (err) {
    return {
      code: 1,
      message: '绑定失败',
      error: err.message
    }
  }
}