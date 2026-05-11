const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 订阅消息模板ID
const TEMPLATE_ID = 'w223WKtyfXebjCpkNc2TbtczBuGuR4SUk2IRbMcRreU'

exports.main = async (event, context) => {
  const { courseId, teacherId, triggerType, Type, triggerName } = event

  console.log('Received event:', JSON.stringify(event))

  // 定时触发模式：自动检测即将开始的课程
  // 支持多种触发方式：
  // 1. 手动传入 triggerType=cron
  // 2. 定时器自动触发（Type='Timer'）
  // 3. 定时器自动触发（triggerName包含cron）
  // 4. 没有传入 courseId 和 teacherId（定时触发）
  const isCronTrigger = triggerType === 'cron' || 
                        Type === 'Timer' || 
                        (triggerName && triggerName.includes('cron')) ||
                        (!courseId && !teacherId)

  if (isCronTrigger) {
    return await handleCronTrigger()
  }

  // 手动触发模式
  if (!courseId || !teacherId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    return await sendReminderToTeacher(courseId, teacherId)
  } catch (err) {
    return {
      code: 1,
      message: '发送提醒失败',
      error: err.message
    }
  }
}

// 处理定时触发
async function handleCronTrigger() {
  const now = new Date()
  // 服务器时间是UTC，需要转换为北京时间（UTC+8）来计算
  // 使用Date.now()获取UTC时间戳，然后加上8小时偏移得到北京时间戳
  const nowUTC = Date.now()
  const beijingTimeOffset = 8 * 60 * 60 * 1000 // UTC+8偏移
  const nowBeijing = nowUTC + beijingTimeOffset
  
  console.log(`定时任务执行，服务器UTC时间: ${now.toISOString()}, 北京时间戳: ${nowBeijing}`)

  try {
    // 查询课程安排
    const scheduleRes = await db.collection('course_schedule')
      .where({
        status: 'available'
      })
      .get()

    console.log(`查询到 ${scheduleRes.data.length} 条可用课程安排`)

    let successCount = 0
    let failCount = 0

    for (const schedule of scheduleRes.data) {
      console.log(`处理课程安排: ${schedule._id}`)
      
      // 手动解析日期时间（课程时间存储的是北京时间）
      const dateStr = schedule.schedule.date
      const timeStr = schedule.schedule.startTime
      const [year, month, day] = dateStr.split('-').map(Number)
      const [hours, minutes] = timeStr.split(':').map(Number)
      
      // 课程时间已经是北京时间，需要转换为UTC时间戳进行计算
      // 北京时间 = UTC时间 + 8小时，所以 UTC时间 = 北京时间 - 8小时
      const courseUTC = Date.UTC(year, month - 1, day, hours, minutes) - beijingTimeOffset
      // 现在courseUTC已经是正确的UTC时间戳，不需要再偏移，直接用于时间比较
      const courseBeijing = courseUTC + beijingTimeOffset // 仅用于显示
      console.log(`课程时间(北京): ${dateStr} ${timeStr}, UTC时间戳: ${courseUTC}, 北京时间戳: ${courseBeijing}`)
      
      // 获取父课程信息
      const courseRes = await db.collection('courses').doc(schedule.parentId).get()
      const course = courseRes.data
      
      // 获取提醒时间设置：优先使用子课程的设置，否则使用父课程的，默认15分钟
      const reminderMinutes = schedule.reminderTime || course.reminderTime || 15
      console.log(`父课程: ${course.name}, 子课程提醒时间: ${schedule.reminderTime || '未设置'}, 父课程提醒时间: ${course.reminderTime || '未设置'}, 使用: ${reminderMinutes}分钟`)

      // 计算提醒时间点（使用UTC时间戳）
      const reminderUTC = courseUTC - reminderMinutes * 60 * 1000
      const reminderBeijing = reminderUTC + beijingTimeOffset // 仅用于显示
      console.log(`提醒时间点(北京): ${new Date(reminderBeijing).toLocaleString()}, UTC时间戳: ${reminderUTC}, 北京时间戳: ${reminderBeijing}`)
      console.log(`调试信息 - nowUTC: ${nowUTC}, courseUTC: ${courseUTC}, reminderMinutes: ${reminderMinutes}, reminderUTC: ${reminderUTC}`)

      // 检查是否在当前时间附近5分钟内需要提醒（使用UTC时间戳比较）
      const timeDiff = Math.abs(reminderUTC - nowUTC)
      const within5Minutes = timeDiff <= 5 * 60 * 1000
      console.log(`时间差: ${Math.round(timeDiff / 1000)}秒, 是否在5分钟内: ${within5Minutes}`)

      // 只在提醒时间之后且课程开始之前发送（使用UTC时间戳比较）
      if (within5Minutes && nowUTC < courseUTC) {
        try {
          await sendSubscribeMessage({
            teacherId: course.teacherId,
            courseName: course.name,
            schedule: schedule.schedule
          })
          console.log(`提醒发送成功: ${course.name}`)
          successCount++
        } catch (err) {
          console.error(`发送提醒失败: ${err.message}`)
          failCount++
        }
      } else {
        console.log(`跳过: ${nowUTC < courseUTC ? '不在提醒时间窗口' : '课程已结束'}`)
      }
    }

    return {
      code: 0,
      message: `定时提醒发送完成`,
      data: {
        successCount,
        failCount
      }
    }
  } catch (err) {
    return {
      code: 1,
      message: '定时任务执行失败',
      error: err.message
    }
  }
}

// 发送单个课程提醒
async function sendReminderToTeacher(courseId, teacherId) {
  const courseRes = await db.collection('courses').doc(courseId).get()

  if (!courseRes.data || courseRes.data.teacherId !== teacherId) {
    return {
      code: 1,
      message: '课程不存在'
    }
  }

  const course = courseRes.data

  // 查询子课程
  const scheduleRes = await db.collection('course_schedule')
    .where({ parentId: courseId })
    .get()

  let successCount = 0

  for (const schedule of scheduleRes.data) {
    try {
      await sendSubscribeMessage({
        teacherId: course.teacherId,
        courseName: course.name,
        schedule: schedule.schedule
      })
      successCount++
    } catch (err) {
      console.error(`发送提醒失败: ${err.message}`)
    }
  }

  return {
    code: 0,
    data: {
      success: true,
      reminderCount: successCount,
      courseName: course.name
    }
  }
}

// 发送订阅消息
async function sendSubscribeMessage({ teacherId, courseName, schedule }) {
  return await cloud.openapi.subscribeMessage.send({
    touser: teacherId,
    templateId: TEMPLATE_ID,
    page: '/pages/teacher/schedule/index',
    data: {
      time6: { value: schedule.startTime },
      thing5: { value: courseName },
      date4: { value: schedule.date },
      date9: { value: schedule.endTime }
    }
  })
}
