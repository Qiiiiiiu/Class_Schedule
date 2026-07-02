const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { teacherId, startDate, endDate } = event

  if (!teacherId) {
    return {
      code: 1,
      message: 'teacherId不能为空'
    }
  }

  try {
    const query = {
      teacherId,
      status: 'available'
    }

    if (startDate && endDate) {
      query['schedule.date'] = _.gte(startDate).and(_.lte(endDate))
    } else if (startDate) {
      query['schedule.date'] = _.gte(startDate)
    } else if (endDate) {
      query['schedule.date'] = _.lte(endDate)
    }

    const res = await db.collection('course_schedule').where(query)
      .field({
        _id: true,
        name: true,
        parentId: true,
        price: true,
        status: true,
        students: true,
        studentCount: true,
        schedule: true
      })
      .get()

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