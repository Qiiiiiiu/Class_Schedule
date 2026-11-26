const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { applicationId, teacherId, remark } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!applicationId) {
    return { code: 1, message: '参数不完整' }
  }
  if (teacherId && teacherId !== callerOpenid) {
    return { code: 1, message: '无权限操作他人申请' }
  }

  try {
    const updateRes = await db.collection('course_applications')
      .where({
        _id: applicationId,
        teacherId: callerOpenid,
        status: 'pending'
      })
      .update({
        data: {
          status: 'rejected',
          remark: remark || '',
          updateTime: db.serverDate()
        }
      })

    if (!updateRes || !updateRes.stats || updateRes.stats.updated === 0) {
      return {
        code: 1,
        message: '申请不存在、无权限或已处理'
      }
    }

    return {
      code: 0,
      message: '已拒绝申请',
      data: { success: true }
    }
  } catch (err) {
    console.error('[rejectCourse] error:', err.message)
    return {
      code: 1,
      message: '操作失败',
      error: err.message
    }
  }
}
