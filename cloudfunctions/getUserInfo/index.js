const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { openid } = event

  if (!openid) {
    return {
      code: 1,
      message: 'openid不能为空'
    }
  }

  try {
    const res = await db.collection('users').where({
      openid: openid
    }).get()

    if (res.data && res.data.length > 0) {
      return {
        code: 0,
        data: res.data[0]
      }
    }

    return {
      code: 1,
      message: '用户不存在'
    }
  } catch (err) {
    return {
      code: 1,
      message: '查询失败',
      error: err.message
    }
  }
}