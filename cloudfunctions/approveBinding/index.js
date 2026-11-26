const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { bindingId, teacherId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!bindingId) {
    return { code: 1, message: '参数不完整' }
  }
  if (teacherId && teacherId !== callerOpenid) {
    return { code: 1, message: '无权限审批他人绑定申请' }
  }

  try {
    const bindingRes = await db.collection('teacher_student_bindings').doc(bindingId).get()

    if (!bindingRes.data || bindingRes.data.teacherId !== callerOpenid) {
      return { code: 1, message: '绑定记录不存在或无权限' }
    }
    if (bindingRes.data.status !== 'pending') {
      return { code: 1, message: '该申请已被处理' }
    }

    await db.collection('teacher_student_bindings').doc(bindingId).update({
      data: {
        status: 'approved',
        approveTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    return {
      code: 0,
      data: { success: true }
    }
  } catch (err) {
    console.error('[approveBinding] error:', err.message)
    return {
      code: 1,
      message: '批准绑定失败',
      error: err.message
    }
  }
}
