const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { openid, name } = event

  if (!openid || !name) {
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
      await db.collection('users').doc(checkRes.data[0]._id).update({
        data: {
          name: name,
          updateTime: db.serverDate()
        }
      })
      
      const userRes = await db.collection('users').doc(checkRes.data[0]._id).get()
      
      return {
        code: 0,
        data: userRes.data,
        message: '用户名更新成功'
      }
    } else {
      return {
        code: 1,
        message: '用户不存在'
      }
    }
  } catch (err) {
    return {
      code: 1,
      message: '更新用户失败',
      error: err.message
    }
  }
}
