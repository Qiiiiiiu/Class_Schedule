const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { id, data } = event

  if (!id) {
    return {
      code: 1,
      message: 'id不能为空'
    }
  }

  try {
    const res = await db.collection('course_schedule').doc(id).update({
      data: {
        ...data,
        updateTime: new Date()
      }
    })

    return {
      code: 0,
      data: res
    }
  } catch (err) {
    return {
      code: 1,
      message: '修改失败',
      error: err.message
    }
  }
}