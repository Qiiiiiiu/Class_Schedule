const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { teacherId, startDate, endDate } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  const effectiveTeacherId = callerOpenid || teacherId
  if (!effectiveTeacherId) {
    return { code: 1, message: 'teacherId不能为空' }
  }

  try {
    const query = {
      teacherId: effectiveTeacherId,
      status: 'available'
    }

    if (startDate && endDate) {
      query['schedule.date'] = _.gte(startDate).and(_.lte(endDate))
    } else if (startDate) {
      query['schedule.date'] = _.gte(startDate)
    } else if (endDate) {
      query['schedule.date'] = _.lte(endDate)
    }

    const MAX_LIMIT = 100
    let allData = []
    let offset = 0

    while (true) {
      const res = await db.collection('course_schedule').where(query)
        .field({
          _id: true,
          name: true,
          parentId: true,
          price: true,
          classType: true,
          billingMode: true,
          status: true,
          students: true,
          studentCount: true,
          schedule: true
        })
        .skip(offset)
        .limit(MAX_LIMIT)
        .get()

      const batch = res.data || []
      allData = allData.concat(batch)
      if (batch.length < MAX_LIMIT) break
      offset += MAX_LIMIT
    }

    // 为历史未写 classType 的子课补齐类型推断
    const normalized = allData.map(item => ({
      ...item,
      classType: item.classType || (Array.isArray(item.students) && item.students.length > 1 ? 'group' : 'one_on_one'),
      studentCount: Array.isArray(item.students) ? item.students.length : (item.studentCount || 0)
    }))

    return {
      code: 0,
      data: normalized
    }
  } catch (err) {
    return {
      code: 1,
      message: '查询失败',
      error: err.message
    }
  }
}
