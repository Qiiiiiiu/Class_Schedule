const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { applicationId, teacherId, remark } = event

  if (!applicationId || !teacherId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    await db.collection('course_applications').doc(applicationId).update({
      data: {
        status: 'rejected',
        remark: remark || '',
        updateTime: new Date()
      }
    })

    return {
      code: 0,
      message: '已拒绝申请'
    }
  } catch (err) {
    console.error('拒绝申请失败:', err)
    return {
      code: 1,
      message: '操作失败',
      error: err.message
    }
  }
}
