const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { studentId, studentName, verifyCode } = event

  if (!studentId || !verifyCode) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const now = new Date()

    const codeRes = await db.collection('bind_verify_codes').where({
      verifyCode,
      used: false
    }).get()

    if (!codeRes.data || codeRes.data.length === 0) {
      return {
        code: 1,
        message: '验证码无效'
      }
    }

    const codeRecord = codeRes.data[0]

    if (new Date(codeRecord.expireTime) < now) {
      // 自动删除当前已过期的验证码
      try {
        await db.collection('bind_verify_codes').doc(codeRecord._id).remove()
      } catch (delErr) {
        console.error('删除当前过期验证码失败:', delErr)
      }

      // 自动清理所有其他已过期的验证码记录
      try {
        const _ = db.command
        await db.collection('bind_verify_codes').where({
          expireTime: _.lt(now)
        }).remove()
      } catch (cleanErr) {
        console.error('清理其他过期验证码失败:', cleanErr)
      }

      return {
        code: 1,
        message: '验证码已过期'
      }
    }

    const teacherId = codeRecord.teacherId
    const teacherName = codeRecord.teacherName

    const checkBindingRes = await db.collection('teacher_student_bindings').where({
      teacherId,
      studentId,
      status: db.command.in(['pending', 'approved'])
    }).get()

    if (checkBindingRes.data && checkBindingRes.data.length > 0) {
      return {
        code: 1,
        message: '您已绑定该教师，无需重复绑定'
      }
    }

    await db.collection('bind_verify_codes').doc(codeRecord._id).update({
      data: {
        used: true,
        usedBy: studentId,
        usedAt: db.serverDate()
      }
    })

    await db.collection('teacher_student_bindings').add({
      data: {
        teacherId,
        studentId,
        teacherName,
        studentName: studentName || '',
        status: 'approved',
        applyTime: db.serverDate(),
        approveTime: db.serverDate(),
        remark: '学生通过验证码绑定',
        tempId: `verify_${Date.now()}`
      }
    })

    return {
      code: 0,
      message: '绑定成功',
      data: {
        teacherId,
        teacherName
      }
    }
  } catch (err) {
    console.error('验证码绑定失败:', err)
    return {
      code: 1,
      message: '绑定失败',
      error: err.message
    }
  }
}
