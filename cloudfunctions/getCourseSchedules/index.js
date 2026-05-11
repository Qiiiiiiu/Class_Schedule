const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { parentId } = event

  if (!parentId) {
    return {
      code: 1,
      message: 'parentId不能为空'
    }
  }

  try {
    const res = await db.collection('course_schedule').where({
      parentId
    }).orderBy('schedule.date', 'asc').get()

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