const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { teacherId, studentId } = event

  if (!teacherId || !studentId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const res = await db.collection('teacher_student_bindings')
      .where({
        teacherId,
        studentId,
        status: 'unbound'
      })
      .update({
        data: {
          status: 'approved',
          approveTime: db.serverDate(),
          remark: '教师手动绑定'
        }
      })

    if (res.stats && res.stats.updated > 0) {
      return {
        code: 0,
        message: '绑定成功'
      }
    } else {
      return {
        code: 1,
        message: '绑定失败，学生状态不是未绑定'
      }
    }
  } catch (err) {
    return {
      code: 1,
      message: '绑定失败',
      error: err.message
    }
  }
}
