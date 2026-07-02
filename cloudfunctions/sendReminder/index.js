const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 订阅消息模板ID
const TEMPLATE_ID = 'w223WKtyfXebjCpkNc2TbtczBuGuR4SUk2IRbMcRreU'

// 单次处理的最大记录数
const MAX_BATCH_SIZE = 20

// 只处理未来几天内的课程（避免处理太遥远的课程）
const LOOK_AHEAD_DAYS = 7

exports.main = async (event, context) => {
  const { courseId, teacherId, triggerType, Type, triggerName, batchSize = MAX_BATCH_SIZE } = event

  console.log('Received event:', JSON.stringify(event))

  // 定时触发模式
  const isCronTrigger = triggerType === 'cron' || 
                        Type === 'Timer' || 
                        (triggerName && triggerName.includes('cron')) ||
                        (!courseId && !teacherId)

  if (isCronTrigger) {
    return await handleCronTrigger(batchSize)
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
async function handleCronTrigger(batchSize) {
  const now = new Date()
  const nowUTC = Date.now()
  const beijingTimeOffset = 8 * 60 * 60 * 1000
  const nowBeijing = nowUTC + beijingTimeOffset
  
  console.log(`定时任务执行，服务器UTC时间: ${now.toISOString()}, 北京时间戳: ${nowBeijing}`)

  try {
    // 计算日期范围：只查询未来几天内的课程
    const today = new Date(nowBeijing)
    const endDate = new Date(nowBeijing)
    endDate.setDate(today.getDate() + LOOK_AHEAD_DAYS)
    
    const todayStr = formatDate(today)
    const endDateStr = formatDate(endDate)
    
    console.log(`查询日期范围: ${todayStr} 至 ${endDateStr}`)

    // 只查询未来几天内的课程，大大减少处理的数据量
    const unfinishedRes = await db.collection('course_unfinished')
      .where({
        'schedule.date': _.gte(todayStr).and(_.lte(endDateStr))
      })
      .limit(batchSize)
      .get()

    const unfinishedList = unfinishedRes.data
    console.log(`查询到 ${unfinishedList.length} 条需要处理的课程`)

    if (unfinishedList.length === 0) {
      return {
        code: 0,
        message: '没有需要处理的课程',
        data: {
          successCount: 0,
          failCount: 0,
          deleteCount: 0,
          hasMore: false
        }
      }
    }

    // 批量获取所有相关的课程安排
    const scheduleIds = unfinishedList.map(u => u.scheduleId)
    const scheduleMap = await getScheduleMap(scheduleIds)
    
    // 批量获取所有相关的父课程
    const parentIds = [...new Set(unfinishedList.map(u => u.parentId).filter(Boolean))]
    const courseMap = await getCourseMap(parentIds)

    let successCount = 0
    let failCount = 0
    let deleteCount = 0
    const deletePromises = []
    const sendPromises = []
    const successStudents = new Map()

    for (const unfinished of unfinishedList) {
      console.log(`处理未完成课程: ${unfinished._id}, scheduleId: ${unfinished.scheduleId}`)
      
      // 手动解析日期时间
      const dateStr = unfinished.schedule.date
      const timeStr = unfinished.schedule.startTime
      
      if (!dateStr || !timeStr) {
        console.log(`课程时间信息缺失，删除: ${unfinished._id}`)
        deletePromises.push(db.collection('course_unfinished').doc(unfinished._id).remove())
        deleteCount++
        continue
      }

      const [year, month, day] = dateStr.split('-').map(Number)
      const [hours, minutes] = timeStr.split(':').map(Number)
      
      const courseUTC = Date.UTC(year, month - 1, day, hours, minutes) - beijingTimeOffset
      const [endHours, endMinutes] = unfinished.schedule.endTime.split(':').map(Number)
      const courseEndUTC = Date.UTC(year, month - 1, day, endHours, endMinutes) - beijingTimeOffset
      
      console.log(`课程时间(北京): ${dateStr} ${timeStr}, 结束时间: ${unfinished.schedule.endTime}`)
      
      // 检查课程是否已结束
      if (nowUTC >= courseEndUTC) {
        console.log(`课程已结束，从course_unfinished中删除: ${unfinished._id}`)
        deletePromises.push(db.collection('course_unfinished').doc(unfinished._id).remove())
        deleteCount++
        continue
      }
      
      // 获取课程安排详细信息
      const schedule = scheduleMap.get(unfinished.scheduleId)
      if (!schedule) {
        console.log(`课程安排不存在，删除: ${unfinished._id}`)
        deletePromises.push(db.collection('course_unfinished').doc(unfinished._id).remove())
        deleteCount++
        continue
      }
      
      // 获取父课程信息
      const course = courseMap.get(schedule.parentId)
      if (!course) {
        console.log(`父课程不存在，删除: ${unfinished._id}`)
        deletePromises.push(db.collection('course_unfinished').doc(unfinished._id).remove())
        deleteCount++
        continue
      }
      
      // 获取提醒时间设置
      const reminderMinutes = schedule.reminderTime || course.reminderTime || 15
      console.log(`父课程: ${course.name}, 使用提醒时间: ${reminderMinutes}分钟`)

      // 计算提醒时间点
      const reminderUTC = courseUTC - reminderMinutes * 60 * 1000

      // 检查是否在当前时间附近5分钟内需要提醒
      const timeDiff = Math.abs(reminderUTC - nowUTC)
      const within5Minutes = timeDiff <= 5 * 60 * 1000

      // 只在提醒时间之后且课程开始之前发送
      if (within5Minutes && nowUTC < courseUTC) {
        // 向教师发送提醒（只发送一次，使用 teacherReminderSent 标记）
        if (!unfinished.teacherReminderSent) {
          sendPromises.push({
            promise: sendSubscribeMessage({
              touser: course.teacherId,
              courseName: course.name,
              schedule: schedule.schedule,
              isTeacher: true
            }),
            courseName: course.name,
            type: 'teacher',
            unfinishedId: unfinished._id,
            isUpdate: true
          })
        } else {
          console.log(`教师提醒已发送过，跳过: ${course.name}`)
        }

        const subscribers = unfinished.subscribers || []
        console.log(`课程 ${course.name} 有 ${subscribers.length} 个订阅学生`)
        for (const studentId of subscribers) {
          sendPromises.push({
            promise: sendSubscribeMessage({
              touser: studentId,
              courseName: course.name,
              schedule: schedule.schedule,
              isTeacher: false
            }),
            courseName: course.name,
            type: 'student',
            studentId,
            unfinishedId: unfinished._id
          })
        }
      } else {
        console.log(`跳过: ${nowUTC < courseUTC ? '不在提醒时间窗口' : '课程已结束'}`)
      }
    }

    // 并行执行删除操作
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises)
    }

    // 记录成功发送的教师提醒
    const sentTeacherReminders = []

    // 并行执行发送提醒操作
    if (sendPromises.length > 0) {
      const results = await Promise.allSettled(sendPromises.map(item => item.promise))
      results.forEach((result, index) => {
        const item = sendPromises[index]
        if (result.status === 'fulfilled') {
          console.log(`提醒发送成功: ${item.courseName}`)
          successCount++
          if (item.type === 'teacher' && item.isUpdate && item.unfinishedId) {
            sentTeacherReminders.push(item.unfinishedId)
          } else if (item.type === 'student' && item.studentId && item.unfinishedId) {
            if (!successStudents.has(item.unfinishedId)) {
              successStudents.set(item.unfinishedId, [])
            }
            successStudents.get(item.unfinishedId).push(item.studentId)
          }
        } else {
          console.error(`发送提醒失败: ${result.reason?.message || 'unknown error'}`)
          failCount++
        }
      })
    }

    // 清除已发送成功学生的订阅状态
    if (successStudents.size > 0) {
      console.log(`清除已发送成功学生的订阅状态...`)
      for (const [unfinishedId, students] of successStudents) {
        const unfinished = unfinishedList.find(u => u._id === unfinishedId)
        if (unfinished) {
          const remainingSubscribers = (unfinished.subscribers || []).filter(s => !students.includes(s))
          await db.collection('course_unfinished').doc(unfinishedId).update({
            data: {
              subscribers: remainingSubscribers,
              updateTime: db.serverDate()
            }
          })
          console.log(`课程 ${unfinishedId} 已清除 ${students.length} 个学生的订阅状态`)
        }
      }
    }

    // 标记教师提醒已发送
    for (const unfinishedId of sentTeacherReminders) {
      await db.collection('course_unfinished').doc(unfinishedId).update({
        data: {
          teacherReminderSent: true,
          updateTime: db.serverDate()
        }
      })
      console.log(`教师提醒已标记为已发送: ${unfinishedId}`)
    }

    return {
      code: 0,
      message: `定时提醒发送完成`,
      data: {
        successCount,
        failCount,
        deleteCount,
        hasMore: unfinishedList.length >= batchSize
      }
    }
  } catch (err) {
    console.error('定时任务执行失败:', err)
    return {
      code: 1,
      message: '定时任务执行失败',
      error: err.message
    }
  }
}

// 格式化日期为 YYYY-MM-DD（使用北京时间）
function formatDate(date) {
  const beijingTimeOffset = 8 * 60 * 60 * 1000
  const beijingDate = new Date(date.getTime() + beijingTimeOffset)
  const year = beijingDate.getUTCFullYear()
  const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(beijingDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 批量获取课程安排映射
async function getScheduleMap(scheduleIds) {
  const map = new Map()
  if (scheduleIds.length === 0) return map
  
  const res = await db.collection('course_schedule')
    .where({
      _id: _.in(scheduleIds)
    })
    .get()
  
  res.data.forEach(item => {
    map.set(item._id, item)
  })
  
  return map
}

// 批量获取课程映射
async function getCourseMap(courseIds) {
  const map = new Map()
  if (courseIds.length === 0) return map
  
  const res = await db.collection('courses')
    .where({
      _id: _.in(courseIds)
    })
    .get()
  
  res.data.forEach(item => {
    map.set(item._id, item)
  })
  
  return map
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

  // 查询子课程，只查询未来几天内的
  const today = new Date()
  const endDate = new Date()
  endDate.setDate(today.getDate() + LOOK_AHEAD_DAYS)
  
  const todayStr = formatDate(today)
  const endDateStr = formatDate(endDate)
  
  console.log(`当前日期: ${todayStr}, 结束日期: ${endDateStr}`)

  console.log(`查询课程安排: parentId=${courseId}, 日期范围: ${todayStr} 至 ${endDateStr}`)
  
  // 先查询所有属于该课程的课程安排，不限制日期
  const allScheduleRes = await db.collection('course_schedule')
    .where({ 
      parentId: courseId
    })
    .get()
  
  console.log(`该课程所有课程安排数量: ${allScheduleRes.data.length}`)
  if (allScheduleRes.data.length > 0) {
    console.log(`所有课程安排日期: ${JSON.stringify(allScheduleRes.data.map(s => s.schedule?.date))}`)
  }
  
  const scheduleRes = await db.collection('course_schedule')
    .where({ 
      parentId: courseId,
      'schedule.date': _.gte(todayStr).and(_.lte(endDateStr))
    })
    .get()
  
  console.log(`日期范围内课程安排数量: ${scheduleRes.data.length}`)
  if (scheduleRes.data.length > 0) {
    console.log(`课程安排详情: ${JSON.stringify(scheduleRes.data)}`)
  }

  // 获取未完成课程的订阅者信息
  console.log(`查询未完成课程: parentId=${courseId}, 日期范围: ${todayStr} 至 ${endDateStr}`)
  
  const unfinishedRes = await db.collection('course_unfinished')
    .where({
      parentId: courseId,
      'schedule.date': _.gte(todayStr).and(_.lte(endDateStr))
    })
    .get()
  
  console.log(`查询到未完成课程数量: ${unfinishedRes.data.length}`)
  if (unfinishedRes.data.length > 0) {
    console.log(`未完成课程详情: ${JSON.stringify(unfinishedRes.data)}`)
  }

  const unfinishedMap = new Map()
  unfinishedRes.data.forEach(u => {
    if (u.scheduleId) {
      unfinishedMap.set(u.scheduleId, u)
    }
  })

  let successCount = 0
  let teacherSuccess = false
  let teacherFailReason = ''
  const sendPromises = []
  const successStudents = new Map()

  for (const schedule of scheduleRes.data) {
    // 向教师发送提醒
    sendPromises.push({
      promise: sendSubscribeMessage({
        touser: course.teacherId,
        courseName: course.name,
        schedule: schedule.schedule,
        isTeacher: true
      }),
      type: 'teacher',
      scheduleId: schedule._id
    })

    // 向订阅的学生发送提醒
    const unfinished = unfinishedMap.get(schedule._id)
    const subscribers = unfinished ? (unfinished.subscribers || []) : []
    console.log(`课程 ${course.name} 有 ${subscribers.length} 个订阅学生`)

    for (const studentId of subscribers) {
      sendPromises.push({
        promise: sendSubscribeMessage({
          touser: studentId,
          courseName: course.name,
          schedule: schedule.schedule,
          isTeacher: false
        }),
        type: 'student',
        studentId,
        scheduleId: schedule._id
      })
    }
  }

  console.log(`待发送消息数量: ${sendPromises.length}`)

  if (sendPromises.length > 0) {
    const results = await Promise.allSettled(sendPromises.map(item => item.promise))
    results.forEach((result, index) => {
      const item = sendPromises[index]
      if (result.status === 'fulfilled') {
        console.log(`消息发送成功: ${item.type} - ${item.studentId || 'teacher'}`)
        successCount++
        if (item.type === 'teacher') {
          teacherSuccess = true
        } else if (item.type === 'student' && item.studentId && item.scheduleId) {
          if (!successStudents.has(item.scheduleId)) {
            successStudents.set(item.scheduleId, [])
          }
          successStudents.get(item.scheduleId).push(item.studentId)
        }
      } else {
        console.error(`消息发送失败: ${item.type} - ${item.studentId || 'teacher'}, 原因: ${result.reason?.message || result.reason || 'unknown'}`)
        if (item.type === 'teacher') {
          teacherFailReason = result.reason?.message || result.reason || 'unknown'
        }
      }
    })
  }

  console.log(`发送完成: 成功 ${successCount} 条, 失败 ${sendPromises.length - successCount} 条`)

  if (successStudents.size > 0) {
    console.log(`清除已发送成功学生的订阅状态...`)
    for (const [scheduleId, students] of successStudents) {
      const unfinished = unfinishedMap.get(scheduleId)
      if (unfinished) {
        const remainingSubscribers = (unfinished.subscribers || []).filter(s => !students.includes(s))
        await db.collection('course_unfinished').doc(unfinished._id).update({
          data: {
            subscribers: remainingSubscribers,
            updateTime: db.serverDate()
          }
        })
        console.log(`课程安排 ${scheduleId} 已清除 ${students.length} 个学生的订阅状态`)
      }
    }
  }

  const hasStudentSubscribers = scheduleRes.data.some(schedule => {
    const unfinished = unfinishedMap.get(schedule._id)
    return unfinished && (unfinished.subscribers || []).length > 0
  })

  let message = '发送完成'
  if (!teacherSuccess && teacherFailReason.includes('43101')) {
    message = '教师端订阅消息授权已过期，请重新授权'
  }

  return {
    code: 0,
    data: {
      success: true,
      reminderCount: successCount,
      courseName: course.name,
      teacherSuccess,
      teacherFailReason,
      hasStudentSubscribers,
      message
    }
  }
}

// 发送订阅消息
async function sendSubscribeMessage({ touser, courseName, schedule, isTeacher }) {
  const page = isTeacher ? '/pages/teacher/schedule/index' : '/pages/student/my-courses/index'
  const noticeType = isTeacher ? '上课提醒' : '课程提醒'

  return await cloud.openapi.subscribeMessage.send({
    touser: touser,
    templateId: TEMPLATE_ID,
    page: page,
    data: {
      time6: { value: schedule.startTime },
      thing5: { value: courseName },
      date4: { value: schedule.date },
      date9: { value: schedule.endTime }
    }
  })
}
