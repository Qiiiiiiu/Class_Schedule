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
      message: '参数不完整'
    }
  }

  try {
    const res = await db.collection('courses').where({
      teacherId
    }).orderBy('createTime', 'desc').get()

    return {
      code: 0,
      data: res.data
    }
  } catch (err) {
    console.error('获取课程失败:', err)
    return {
      code: 1,
      message: '获取失败',
      error: err.message
    }
  }
}
