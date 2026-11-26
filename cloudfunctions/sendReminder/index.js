const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const {
  DAY_MS,
  formatBeijingDate,
  parseBeijingDateTimeToUTC,
  resolveReminderMinutes,
  shouldTriggerReminder,
  maskId
} = require('./timeUtils')

const TEMPLATE_ID = process.env.REMINDER_TEMPLATE_ID || 'w223WKtyfXebjCpkNc2TbtczBuGuR4SUk2IRbMcRreU'
const MAX_BATCH_SIZE = 100
const LOOK_AHEAD_DAYS = 1
const ARCHIVE_RETENTION_DAYS = 90
const CRON_TIME_BUDGET_MS = 15000
const DEBUG = process.env.DEBUG_REMINDER === '1'

function debugLog(...args) {
  if (DEBUG) {
    console.log(...args)
  }
}

exports.main = async (event, context) => {
  const { courseId, teacherId, triggerType, Type, triggerName, batchSize = MAX_BATCH_SIZE } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  // 定时触发模式：严格判断定时器标识或无调用方上下文
  const isCronTrigger = triggerType === 'cron' ||
    Type === 'Timer' ||
    (typeof triggerName === 'string' && triggerName.includes('cron')) ||
    (!callerOpenid && !courseId && !teacherId)

  if (isCronTrigger) {
    return await handleCronTrigger(Math.min(Number(batchSize) || MAX_BATCH_SIZE, MAX_BATCH_SIZE))
  }

  // 手动触发模式：必须校验调用者身份
  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!courseId) {
    return { code: 1, message: '参数不完整' }
  }
  if (teacherId && teacherId !== callerOpenid) {
    return { code: 1, message: '无权限操作他人课程' }
  }

  try {
    return await sendReminderToTeacher(courseId, callerOpenid)
  } catch (err) {
    console.error('[sendReminder:manual] error:', err.message)
    return {
      code: 1,
      message: '发送提醒失败',
      error: err.message
    }
  }
}

// 处理定时触发（支持游标分页防饿死、软结束保留历史、额度校验、原子抢占）
async function handleCronTrigger(batchSize) {
  const startTimeMs = Date.now()
  const nowUTC = startTimeMs
  const todayStr = formatBeijingDate(nowUTC)
  const endDateStr = formatBeijingDate(nowUTC + LOOK_AHEAD_DAYS * DAY_MS)

  debugLog(`[sendReminder:cron] window <= ${endDateStr} (today=${todayStr})`)

  let successCount = 0
  let failCount = 0
  let finishedCount = 0
  let orphanDeleteCount = 0
  let processedTotal = 0
  let hasMore = false
  let lastId = null

  const teacherQuotaCache = new Map()

  try {
    while (true) {
      if (Date.now() - startTimeMs > CRON_TIME_BUDGET_MS) {
        hasMore = true
        break
      }

      const whereCond = {
        'schedule.date': _.lte(endDateStr),
        status: _.neq('finished')
      }
      if (lastId) {
        whereCond._id = _.gt(lastId)
      }

      const unfinishedRes = await db.collection('course_unfinished')
        .where(whereCond)
        .orderBy('_id', 'asc')
        .limit(batchSize)
        .get()

      const unfinishedList = unfinishedRes.data || []
      if (unfinishedList.length === 0) {
        break
      }

      lastId = unfinishedList[unfinishedList.length - 1]._id
      processedTotal += unfinishedList.length

      const scheduleIds = [...new Set(unfinishedList.map(u => u.scheduleId).filter(Boolean))]
      const parentIds = [...new Set(unfinishedList.map(u => u.parentId).filter(Boolean))]
      const [scheduleMap, courseMap] = await Promise.all([
        getDocMapByIds('course_schedule', scheduleIds),
        getDocMapByIds('courses', parentIds)
      ])

      // 预拉本批涉及教师的提醒额度
      const batchTeacherIds = [...new Set(
        [...courseMap.values()]
          .map(c => c.teacherId)
          .filter(id => id && id !== 'custom_teacher' && !teacherQuotaCache.has(id))
      )]
      if (batchTeacherIds.length > 0) {
        await preloadTeacherQuotas(batchTeacherIds, teacherQuotaCache)
      }

      const softFinishOps = []
      const orphanRemoveOps = []
      const sendTasks = []

      for (const unfinished of unfinishedList) {
        const schObj = unfinished.schedule || {}
        const courseUTC = parseBeijingDateTimeToUTC(schObj.date, schObj.startTime)
        const courseEndUTC = parseBeijingDateTimeToUTC(schObj.date, schObj.endTime)

        if (courseUTC === null || courseEndUTC === null) {
          console.warn(`[sendReminder:cron] invalid schedule time, removing orphan id=${unfinished._id}`)
          orphanRemoveOps.push(db.collection('course_unfinished').doc(unfinished._id).remove())
          orphanDeleteCount++
          continue
        }

        // 课程已结束：改为软结束 status='finished'，保留学生历史周课表（BUG-07）
        if (nowUTC >= courseEndUTC) {
          softFinishOps.push(
            db.collection('course_unfinished').doc(unfinished._id).update({
              data: {
                status: 'finished',
                finishedTime: db.serverDate(),
                updateTime: db.serverDate()
              }
            })
          )
          finishedCount++
          continue
        }

        const schedule = scheduleMap.get(unfinished.scheduleId)
        if (!schedule) {
          orphanRemoveOps.push(db.collection('course_unfinished').doc(unfinished._id).remove())
          orphanDeleteCount++
          continue
        }

        const course = courseMap.get(schedule.parentId)
        if (!course) {
          orphanRemoveOps.push(db.collection('course_unfinished').doc(unfinished._id).remove())
          orphanDeleteCount++
          continue
        }

        if (course.status && course.status !== 'available') {
          continue
        }

        // BUG-05：显式判空，0 表示“不提醒”直接跳过
        const reminderMinutes = resolveReminderMinutes(schedule, course)
        if (reminderMinutes <= 0) {
          continue
        }

        if (!shouldTriggerReminder({ nowUTC, courseUTC, reminderMinutes })) {
          continue
        }

        // 1. 教师提醒（跳过学生自建课、无有效 teacherId、已发送、额度不足）
        const isStudentSelfCourse = course.creatorRole === 'student' || !course.teacherId || course.teacherId === 'custom_teacher'
        if (!isStudentSelfCourse && !unfinished.teacherReminderSent) {
          const currentQuota = teacherQuotaCache.get(course.teacherId) || 0
          if (currentQuota > 0) {
            // 原子抢占发送权，防止并发 cron 重复发送
            const claimRes = await db.collection('course_unfinished')
              .where({ _id: unfinished._id, teacherReminderSent: _.neq(true) })
              .update({
                data: {
                  teacherReminderSent: true,
                  updateTime: db.serverDate()
                }
              })
            if (claimRes && claimRes.stats && claimRes.stats.updated === 1) {
              teacherQuotaCache.set(course.teacherId, currentQuota - 1)
              sendTasks.push({
                type: 'teacher',
                unfinishedId: unfinished._id,
                teacherId: course.teacherId,
                courseId: course._id,
                promise: sendSubscribeMessage({
                  touser: course.teacherId,
                  courseName: course.name,
                  schedule: schedule.schedule,
                  isTeacher: true
                })
              })
            }
          } else {
            debugLog(`[sendReminder:cron] skip teacher=${maskId(course.teacherId)} quota=0`)
          }
        }

        // 2. 订阅学生提醒
        const subscribers = Array.isArray(unfinished.subscribers) ? unfinished.subscribers : []
        for (const studentId of subscribers) {
          sendTasks.push({
            type: 'student',
            unfinishedId: unfinished._id,
            studentId,
            courseId: course._id,
            promise: sendSubscribeMessage({
              touser: studentId,
              courseName: course.name,
              schedule: schedule.schedule,
              isTeacher: false
            })
          })
        }
      }

      if (softFinishOps.length > 0) {
        await Promise.allSettled(softFinishOps)
      }
      if (orphanRemoveOps.length > 0) {
        await Promise.allSettled(orphanRemoveOps)
      }

      if (sendTasks.length > 0) {
        const results = await Promise.allSettled(sendTasks.map(t => t.promise))
        const successStudentsByUnfinished = new Map()
        const postOps = []

        results.forEach((res, idx) => {
          const task = sendTasks[idx]
          if (res.status === 'fulfilled') {
            successCount++
            if (task.type === 'teacher') {
              postOps.push(
                db.collection('users')
                  .where({ openid: task.teacherId, reminderQuota: _.gt(0) })
                  .update({
                    data: {
                      reminderQuota: _.inc(-1),
                      updateTime: db.serverDate()
                    }
                  })
              )
            } else if (task.type === 'student') {
              if (!successStudentsByUnfinished.has(task.unfinishedId)) {
                successStudentsByUnfinished.set(task.unfinishedId, [])
              }
              successStudentsByUnfinished.get(task.unfinishedId).push(task.studentId)
            }
          } else {
            failCount++
            const reasonMsg = String((res.reason && res.reason.message) || res.reason || 'unknown')
            console.warn(`[sendReminder:cron] send failed type=${task.type} courseId=${task.courseId} reason=${reasonMsg}`)
            // 教师发送遇非授权过期（43101）的瞬时错误时回滚抢占标记，允许下轮重试
            if (task.type === 'teacher' && !reasonMsg.includes('43101')) {
              postOps.push(
                db.collection('course_unfinished').doc(task.unfinishedId).update({
                  data: {
                    teacherReminderSent: false,
                    updateTime: db.serverDate()
                  }
                })
              )
            }
          }
        })

        // 原子移除已发送学生的订阅（使用 _.pullAll 防止覆盖并发新订阅）
        for (const [unfinishedId, students] of successStudentsByUnfinished) {
          postOps.push(
            db.collection('course_unfinished').doc(unfinishedId).update({
              data: {
                subscribers: _.pullAll(students),
                updateTime: db.serverDate()
              }
            })
          )
        }

        if (postOps.length > 0) {
          await Promise.allSettled(postOps)
        }
      }

      if (unfinishedList.length < batchSize) {
        break
      }
    }

    // 低频归档清理：清理超过 90 天的已结束记录，控制集合规模
    let archivedCount = 0
    if (Date.now() - startTimeMs < CRON_TIME_BUDGET_MS) {
      const archiveCutoffStr = formatBeijingDate(nowUTC - ARCHIVE_RETENTION_DAYS * DAY_MS)
      const oldFinished = await db.collection('course_unfinished')
        .where({
          status: 'finished',
          'schedule.date': _.lt(archiveCutoffStr)
        })
        .field({ _id: true })
        .limit(50)
        .get()
      if (oldFinished.data && oldFinished.data.length > 0) {
        await Promise.allSettled(
          oldFinished.data.map(doc => db.collection('course_unfinished').doc(doc._id).remove())
        )
        archivedCount = oldFinished.data.length
      }
    }

    console.log(`[sendReminder:cron] done processed=${processedTotal} sent=${successCount} fail=${failCount} finished=${finishedCount} archived=${archivedCount} hasMore=${hasMore}`)

    return {
      code: 0,
      message: '定时提醒发送完成',
      data: {
        processedTotal,
        successCount,
        failCount,
        finishedCount,
        orphanDeleteCount,
        archivedCount,
        hasMore
      }
    }
  } catch (err) {
    console.error('[sendReminder:cron] fatal error:', err.message)
    return {
      code: 1,
      message: '定时任务执行失败',
      error: err.message
    }
  }
}

async function getDocMapByIds(collectionName, ids) {
  const map = new Map()
  if (!ids || ids.length === 0) return map

  const CHUNK_SIZE = 100
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    const res = await db.collection(collectionName)
      .where({ _id: _.in(chunk) })
      .limit(CHUNK_SIZE)
      .get()
    ;(res.data || []).forEach(item => {
      map.set(item._id, item)
    })
  }
  return map
}

async function preloadTeacherQuotas(teacherIds, cacheMap) {
  const CHUNK_SIZE = 100
  for (let i = 0; i < teacherIds.length; i += CHUNK_SIZE) {
    const chunk = teacherIds.slice(i, i + CHUNK_SIZE)
    const res = await db.collection('users')
      .where({ openid: _.in(chunk) })
      .field({ openid: true, reminderQuota: true })
      .limit(CHUNK_SIZE)
      .get()
    ;(res.data || []).forEach(u => {
      cacheMap.set(u.openid, Math.max(0, Number(u.reminderQuota) || 0))
    })
    chunk.forEach(id => {
      if (!cacheMap.has(id)) cacheMap.set(id, 0)
    })
  }
}

// 手动发送单个课程提醒（兼容传入父课程 ID 或子课 schedule ID）
async function sendReminderToTeacher(inputId, teacherId) {
  let course = null
  let resolvedCourseId = inputId

  try {
    const courseRes = await db.collection('courses').doc(inputId).get()
    if (courseRes && courseRes.data) {
      course = courseRes.data
    }
  } catch (e) {
    // 若按父课程查不到，尝试按子课 ID 反查 parentId（BUG-09 双保险）
    try {
      const schRes = await db.collection('course_schedule').doc(inputId).get()
      if (schRes && schRes.data && schRes.data.parentId) {
        resolvedCourseId = schRes.data.parentId
        const parentRes = await db.collection('courses').doc(resolvedCourseId).get()
        if (parentRes && parentRes.data) {
          course = parentRes.data
        }
      }
    } catch (innerErr) {
      course = null
    }
  }

  if (!course || course.teacherId !== teacherId) {
    return {
      code: 1,
      message: '课程不存在或无权限'
    }
  }

  // 校验教师剩余提醒额度（BUG-22）
  const userRes = await db.collection('users')
    .where({ openid: teacherId })
    .field({ reminderQuota: true })
    .limit(1)
    .get()
  const currentQuota = (userRes.data && userRes.data[0])
    ? Math.max(0, Number(userRes.data[0].reminderQuota) || 0)
    : 0

  if (currentQuota <= 0) {
    return {
      code: 0,
      data: {
        success: false,
        reminderCount: 0,
        courseName: course.name,
        teacherSuccess: false,
        teacherFailReason: 'QUOTA_EXHAUSTED',
        hasStudentSubscribers: false,
        message: '提醒额度不足，请先点击「重新开启上课提醒」获取额度'
      }
    }
  }

  const nowUTC = Date.now()
  const todayStr = formatBeijingDate(nowUTC)
  const endDateStr = formatBeijingDate(nowUTC + LOOK_AHEAD_DAYS * DAY_MS)

  const [scheduleRes, unfinishedRes] = await Promise.all([
    db.collection('course_schedule')
      .where({
        parentId: resolvedCourseId,
        'schedule.date': _.gte(todayStr).and(_.lte(endDateStr))
      })
      .limit(100)
      .get(),
    db.collection('course_unfinished')
      .where({
        parentId: resolvedCourseId,
        status: _.neq('finished'),
        'schedule.date': _.gte(todayStr).and(_.lte(endDateStr))
      })
      .limit(100)
      .get()
  ])

  const upcomingSchedules = (scheduleRes.data || []).filter(s => {
    const endUTC = parseBeijingDateTimeToUTC(s.schedule && s.schedule.date, s.schedule && s.schedule.endTime)
    return endUTC === null || endUTC > nowUTC
  })

  if (upcomingSchedules.length === 0) {
    return {
      code: 0,
      data: {
        success: false,
        reminderCount: 0,
        courseName: course.name,
        teacherSuccess: false,
        teacherFailReason: 'NO_UPCOMING_SCHEDULE',
        hasStudentSubscribers: false,
        message: '未来 1 天内暂无待上课节次'
      }
    }
  }

  const unfinishedMap = new Map()
  ;(unfinishedRes.data || []).forEach(u => {
    if (u.scheduleId) unfinishedMap.set(u.scheduleId, u)
  })

  let successCount = 0
  let teacherSuccessCount = 0
  let teacherFailReason = ''
  let quotaRemaining = currentQuota
  const sendTasks = []
  const successStudents = new Map()

  for (const schedule of upcomingSchedules) {
    if (quotaRemaining > 0) {
      quotaRemaining--
      sendTasks.push({
        type: 'teacher',
        scheduleId: schedule._id,
        promise: sendSubscribeMessage({
          touser: course.teacherId,
          courseName: course.name,
          schedule: schedule.schedule,
          isTeacher: true
        })
      })
    }

    const unfinished = unfinishedMap.get(schedule._id)
    const subscribers = unfinished && Array.isArray(unfinished.subscribers) ? unfinished.subscribers : []
    for (const studentId of subscribers) {
      sendTasks.push({
        type: 'student',
        studentId,
        scheduleId: schedule._id,
        promise: sendSubscribeMessage({
          touser: studentId,
          courseName: course.name,
          schedule: schedule.schedule,
          isTeacher: false
        })
      })
    }
  }

  if (sendTasks.length > 0) {
    const results = await Promise.allSettled(sendTasks.map(t => t.promise))
    results.forEach((result, index) => {
      const item = sendTasks[index]
      if (result.status === 'fulfilled') {
        successCount++
        if (item.type === 'teacher') {
          teacherSuccessCount++
        } else if (item.type === 'student' && item.studentId && item.scheduleId) {
          if (!successStudents.has(item.scheduleId)) {
            successStudents.set(item.scheduleId, [])
          }
          successStudents.get(item.scheduleId).push(item.studentId)
        }
      } else {
        const reason = String((result.reason && result.reason.message) || result.reason || 'unknown')
        console.warn(`[sendReminder:manual] send failed type=${item.type} courseId=${resolvedCourseId} reason=${reason}`)
        if (item.type === 'teacher') {
          teacherFailReason = reason
        }
      }
    })
  }

  const teacherSuccess = teacherSuccessCount > 0
  if (teacherSuccess) {
    // 按成功条数扣减额度，但不扣为负数
    const deduct = Math.min(teacherSuccessCount, currentQuota)
    await db.collection('users')
      .where({ openid: teacherId, reminderQuota: _.gte(deduct) })
      .update({
        data: {
          reminderQuota: _.inc(-deduct),
          updateTime: db.serverDate()
        }
      })
  }

  if (successStudents.size > 0) {
    const pullOps = []
    for (const [scheduleId, students] of successStudents) {
      const unfinished = unfinishedMap.get(scheduleId)
      if (unfinished) {
        pullOps.push(
          db.collection('course_unfinished').doc(unfinished._id).update({
            data: {
              subscribers: _.pullAll(students),
              updateTime: db.serverDate()
            }
          })
        )
      }
    }
    await Promise.allSettled(pullOps)
  }

  const hasStudentSubscribers = upcomingSchedules.some(schedule => {
    const unfinished = unfinishedMap.get(schedule._id)
    return unfinished && Array.isArray(unfinished.subscribers) && unfinished.subscribers.length > 0
  })

  let message = teacherSuccess ? '提醒已发送' : '提醒发送失败，请稍后重试'
  if (!teacherSuccess && teacherFailReason.includes('43101')) {
    message = '教师端订阅消息授权已过期，请重新开启上课提醒'
  }

  console.log(`[sendReminder:manual] courseId=${resolvedCourseId} teacher=${maskId(teacherId)} sent=${successCount} teacherOk=${teacherSuccess}`)

  return {
    code: 0,
    data: {
      success: teacherSuccess,
      reminderCount: successCount,
      courseName: course.name,
      teacherSuccess,
      teacherFailReason,
      hasStudentSubscribers,
      message
    }
  }
}

async function sendSubscribeMessage({ touser, courseName, schedule, isTeacher }) {
  const page = isTeacher ? '/pages/teacher/schedule/index' : '/pages/student/my-courses/index'
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
