const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { teacherId } = event

  if (!teacherId) {
    return {
      code: 1,
      message: 'teacherId不能为空'
    }
  }

  try {
    const res = await db.collection('course_schedule').where({
      teacherId,
      status: 'available'
    }).get()

    return {
      code: 0,
      data: res.data
    }
  } catch (err) {
    return {
      code: 1,
      message: '查询失败',
      error: err.message
    }
  }
}