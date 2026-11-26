const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { teacherId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  const effectiveTeacherId = callerOpenid || teacherId
  if (!effectiveTeacherId) {
    return { code: 1, message: '参数不完整' }
  }
  if (callerOpenid && teacherId && teacherId !== callerOpenid) {
    return { code: 1, message: '无权限查看他人课程申请' }
  }

  try {
    const MAX_LIMIT = 100
    let list = []
    let offset = 0

    while (true) {
      const res = await db.collection('course_applications')
        .where({
          teacherId: effectiveTeacherId,
          status: 'pending'
        })
        .orderBy('applyTime', 'desc')
        .skip(offset)
        .limit(MAX_LIMIT)
        .get()
      const batch = res.data || []
      list = list.concat(batch)
      if (batch.length < MAX_LIMIT) break
      offset += MAX_LIMIT
    }

    return {
      code: 0,
      data: list
    }
  } catch (err) {
    const msg = String((err && err.message) || err)
    if (msg.includes('-502005') || msg.includes('DATABASE_COLLECTION_NOT_EXIST') || msg.includes('not exist')) {
      return { code: 0, data: [] }
    }
    console.error('[getPendingApplications] error:', err.message)
    return {
      code: 1,
      message: '获取待处理申请失败',
      error: err.message
    }
  }
}
