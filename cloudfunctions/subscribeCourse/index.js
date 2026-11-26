const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, scheduleId, studentId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!action || !scheduleId) {
    return { code: 1, message: '参数不完整' }
  }
  if (studentId && studentId !== callerOpenid) {
    return { code: 1, message: '无权限操作他人订阅' }
  }

  const effectiveStudentId = callerOpenid

  try {
    if (action === 'subscribe') {
      return await subscribeToCourse(scheduleId, effectiveStudentId)
    } else if (action === 'unsubscribe') {
      return await unsubscribeFromCourse(scheduleId, effectiveStudentId)
    } else if (action === 'getSubscriptionStatus') {
      return await getSubscriptionStatus(scheduleId, effectiveStudentId)
    } else {
      return { code: 1, message: '无效的操作类型' }
    }
  } catch (err) {
    console.error('[subscribeCourse] error:', err.message)
    return {
      code: 1,
      message: '操作失败',
      error: err.message
    }
  }
}

async function subscribeToCourse(scheduleId, studentId) {
  const unfinishedRes = await db.collection('course_unfinished')
    .where({ scheduleId })
    .limit(1)
    .get()

  if (!unfinishedRes.data || unfinishedRes.data.length === 0) {
    return { code: 1, message: '课程不存在或已结束' }
  }

  const course = unfinishedRes.data[0]
  if (course.status === 'finished') {
    return { code: 1, message: '课程已结束，无法订阅' }
  }

  // BUG-12：原子 _.addToSet，防止并发覆盖丢订阅
  await db.collection('course_unfinished').doc(course._id).update({
    data: {
      subscribers: _.addToSet(studentId),
      updateTime: db.serverDate()
    }
  })

  return {
    code: 0,
    message: '订阅成功',
    data: { subscribed: true }
  }
}

async function unsubscribeFromCourse(scheduleId, studentId) {
  const unfinishedRes = await db.collection('course_unfinished')
    .where({ scheduleId })
    .limit(1)
    .get()

  if (!unfinishedRes.data || unfinishedRes.data.length === 0) {
    return { code: 1, message: '课程不存在或已结束' }
  }

  const course = unfinishedRes.data[0]

  // BUG-12：原子 _.pull，防止并发覆盖
  await db.collection('course_unfinished').doc(course._id).update({
    data: {
      subscribers: _.pull(studentId),
      updateTime: db.serverDate()
    }
  })

  return {
    code: 0,
    message: '取消订阅成功',
    data: { subscribed: false }
  }
}

async function getSubscriptionStatus(scheduleId, studentId) {
  const unfinishedRes = await db.collection('course_unfinished')
    .where({ scheduleId })
    .limit(1)
    .get()

  if (!unfinishedRes.data || unfinishedRes.data.length === 0) {
    return {
      code: 0,
      data: { subscribed: false, exists: false, finished: true }
    }
  }

  const course = unfinishedRes.data[0]
  const subscribers = Array.isArray(course.subscribers) ? course.subscribers : []
  const finished = course.status === 'finished'

  return {
    code: 0,
    data: {
      subscribed: !finished && subscribers.includes(studentId),
      exists: !finished,
      finished
    }
  }
}
