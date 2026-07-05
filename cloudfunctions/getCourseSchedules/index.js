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
    const MAX_LIMIT = 100
    let allSchedules = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const res = await db.collection('course_schedule').where({
        parentId
      }).orderBy('schedule.date', 'asc').skip(offset).limit(MAX_LIMIT).get()

      allSchedules = allSchedules.concat(res.data)
      if (res.data.length < MAX_LIMIT) {
        hasMore = false
      } else {
        offset += MAX_LIMIT
      }
    }

    return {
      code: 0,
      data: allSchedules
    }
  } catch (err) {
    return {
      code: 1,
      message: '查询失败',
      error: err.message
    }
  }
}