const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { teacherId, studentId } = event

  if (!teacherId || !studentId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    await db.collection('teacher_student_bindings').where({
      teacherId,
      studentId
    }).remove()

    await db.collection('users').doc(studentId).remove()

    return {
      code: 0,
      data: true,
      message: '删除成功'
    }
  } catch (err) {
    console.error('删除学生失败:', err)
    return {
      code: 1,
      message: '删除失败',
      error: err.message
    }
  }
}
