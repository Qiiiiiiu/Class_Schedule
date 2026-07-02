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
    await db.collection('teacher_student_bindings').where({
      teacherId,
      studentId
    }).remove()

    if (studentId.startsWith('teacher_add_')) {
      const usersRes = await db.collection('users').where({
        openid: studentId
      }).get()

      if (usersRes.data && usersRes.data.length > 0) {
        await db.collection('users').doc(usersRes.data[0]._id).remove()
      }
    }

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
