const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const MAX_QUOTA = 20
const SUBSCRIBE_COOLDOWN_MS = 10 * 1000

function formatBeijingDate(utcMs) {
  const bj = new Date(utcMs + BEIJING_OFFSET_MS)
  const y = bj.getUTCFullYear()
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0')
  const d = String(bj.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseBeijingStartUTC(dateStr, hhmm) {
  if (!dateStr || !hhmm) return null
  const d = String(dateStr).split('-').map(Number)
  const t = String(hhmm).split(':').map(Number)
  if (d.length !== 3 || t.length < 2 || [...d, ...t].some(n => !Number.isFinite(n))) return null
  return Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) - BEIJING_OFFSET_MS
}

exports.main = async (event, context) => {
  const { teacherId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (teacherId && teacherId !== callerOpenid) {
    return { code: 1, message: '无权限为他人增加提醒额度' }
  }

  const effectiveTeacherId = callerOpenid

  try {
    // 1. 校验调用者为有效教师，并对额度做防刷与上限控制（BUG-22）
    const userRes = await db.collection('users')
      .where({ openid: effectiveTeacherId })
      .limit(1)
      .get()
    const user = userRes.data && userRes.data[0]
    if (!user || user.role !== 'teacher') {
      return { code: 1, message: '仅教师账号可操作提醒额度' }
    }

    const nowUTC = Date.now()
    const rawQuota = Number(user.reminderQuota) || 0
    const normalizedQuota = Math.max(0, rawQuota)
    const lastSubAt = Number(user.lastReminderSubscribeAt) || 0
    const withinCooldown = lastSubAt > 0 && (nowUTC - lastSubAt) < SUBSCRIBE_COOLDOWN_MS

    let updatedQuota = normalizedQuota
    let quotaMessage = ''

    if (withinCooldown) {
      quotaMessage = `操作过于频繁，当前剩余额度 ${updatedQuota}`
    } else if (normalizedQuota >= MAX_QUOTA) {
      quotaMessage = `提醒额度已达上限（${MAX_QUOTA}）`
    } else {
      updatedQuota = Math.min(MAX_QUOTA, normalizedQuota + 1)
      await db.collection('users').doc(user._id).update({
        data: {
          reminderQuota: updatedQuota,
          lastReminderSubscribeAt: nowUTC,
          updateTime: db.serverDate()
        }
      })
      quotaMessage = `订阅成功，当前可用额度 ${updatedQuota}`
    }

    // 2. 仅确保“未来且尚未发送过”的课程记录标记为未发送（不重置历史课和已发过的提醒，避免重复推送）
    const todayStr = formatBeijingDate(nowUTC)
    const MAX_LIMIT = 100
    let offset = 0
    let futurePendingCount = 0

    while (true) {
      const res = await db.collection('course_unfinished')
        .where({
          teacherId: effectiveTeacherId,
          status: _.neq('finished'),
          'schedule.date': _.gte(todayStr)
        })
        .skip(offset)
        .limit(MAX_LIMIT)
        .get()
      const batch = res.data || []

      for (const item of batch) {
        const startUTC = parseBeijingStartUTC(item.schedule && item.schedule.date, item.schedule && item.schedule.startTime)
        const isFuture = startUTC === null || startUTC > nowUTC
        // 严禁把 teacherReminderSent === true 的课清回 false，防止连续点订阅导致同一节课反复提醒
        if (isFuture && item.teacherReminderSent !== true) {
          futurePendingCount++
          if (item.teacherReminderSent !== false || !item.status) {
            await db.collection('course_unfinished').doc(item._id).update({
              data: {
                teacherReminderSent: false,
                status: 'pending',
                updateTime: db.serverDate()
              }
            })
          }
        }
      }

      if (batch.length < MAX_LIMIT) break
      offset += MAX_LIMIT
    }

    return {
      code: 0,
      data: {
        success: true,
        count: futurePendingCount,
        reminderQuota: updatedQuota,
        message: quotaMessage
      },
      message: quotaMessage
    }
  } catch (err) {
    console.error('[clearTeacherReminderMarks] error:', err.message)
    return {
      code: 1,
      message: '操作失败',
      error: err.message
    }
  }
}
