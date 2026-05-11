const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { openid, name, role, phone } = event

  if (!openid || !name || !role) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const checkRes = await db.collection('users').where({
      openid: openid
    }).get()

    if (checkRes.data && checkRes.data.length > 0) {
      return {
        code: 1,
        message: '用户已存在'
      }
    }

    const res = await db.collection('users').add({
      data: {
        openid,
        name,
        role,
        phone: phone || '',
        avatar: '',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    const userRes = await db.collection('users').doc(res._id).get()

    return {
      code: 0,
      data: userRes.data
    }
  } catch (err) {
    return {
      code: 1,
      message: '创建用户失败',
      error: err.message
    }
  }
}