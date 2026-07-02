const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, scheduleId, studentId } = event

  if (!action || !scheduleId || !studentId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    if (action === 'subscribe') {
      return await subscribeToCourse(scheduleId, studentId)
    } else if (action === 'unsubscribe') {
      return await unsubscribeFromCourse(scheduleId, studentId)
    } else if (action === 'getSubscriptionStatus') {
      return await getSubscriptionStatus(scheduleId, studentId)
    } else {
      return {
        code: 1,
        message: '无效的操作类型'
      }
    }
  } catch (err) {
    return {
      code: 1,
      message: '操作失败',
      error: err.message
    }
  }
}

async function subscribeToCourse(scheduleId, studentId) {
  const unfinishedRes = await db.collection('course_unfinished')
    .where({
      scheduleId: scheduleId
    })
    .get()

  if (unfinishedRes.data.length === 0) {
    return {
      code: 1,
      message: '课程不存在或已结束'
    }
  }

  const course = unfinishedRes.data[0]

  const subscribers = course.subscribers || []

  if (subscribers.includes(studentId)) {
    return {
      code: 0,
      message: '已经订阅过了',
      data: { subscribed: true }
    }
  }

  subscribers.push(studentId)

  await db.collection('course_unfinished').doc(course._id).update({
    data: {
      subscribers: subscribers,
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
    .where({
      scheduleId: scheduleId
    })
    .get()

  if (unfinishedRes.data.length === 0) {
    return {
      code: 1,
      message: '课程不存在或已结束'
    }
  }

  const course = unfinishedRes.data[0]

  const subscribers = course.subscribers || []

  const index = subscribers.indexOf(studentId)
  if (index === -1) {
    return {
      code: 0,
      message: '未订阅',
      data: { subscribed: false }
    }
  }

  subscribers.splice(index, 1)

  await db.collection('course_unfinished').doc(course._id).update({
    data: {
      subscribers: subscribers,
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
    .where({
      scheduleId: scheduleId
    })
    .get()

  if (unfinishedRes.data.length === 0) {
    return {
      code: 0,
      data: { subscribed: false, exists: false }
    }
  }

  const course = unfinishedRes.data[0]
  const subscribers = course.subscribers || []

  return {
    code: 0,
    data: {
      subscribed: subscribers.includes(studentId),
      exists: true
    }
  }
}