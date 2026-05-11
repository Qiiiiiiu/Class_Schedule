const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { teacherId, teacherName } = event

  if (!teacherId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const verifyCode = Math.random().toString().slice(2, 8).padStart(6, '0')
    const expireTime = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await db.collection('bind_verify_codes').add({
      data: {
        teacherId,
        teacherName: teacherName || '',
        verifyCode,
        expireTime,
        used: false,
        usedBy: null,
        usedAt: null,
        createTime: db.serverDate()
      }
    })

    return {
      code: 0,
      data: {
        verifyCode,
        expireTime: expireTime.toISOString()
      }
    }
  } catch (err) {
    console.error('生成验证码失败:', err)
    return {
      code: 1,
      message: '生成失败',
      error: err.message
    }
  }
}
