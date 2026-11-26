const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

function isSessionInFuture(dateStr, endTime) {
  if (!dateStr || !endTime) return true
  const d = String(dateStr).split('-').map(Number)
  const t = String(endTime).split(':').map(Number)
  if (d.length !== 3 || t.length < 2 || [...d, ...t].some(n => !Number.isFinite(n))) return true
  const endUTC = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) - BEIJING_OFFSET_MS
  return endUTC > Date.now()
}

exports.main = async (event, context) => {
  const { id, data } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!id || !data) {
    return { code: 1, message: '参数不完整' }
  }

  try {
    // 事务外查找对应 course_unfinished 记录 ID
    const unfinishedRes = await db.collection('course_unfinished')
      .where({ scheduleId: id })
      .limit(10)
      .get()
    const unfinishedIds = (unfinishedRes.data || []).map(u => u._id)

    let txResult = null
    await db.runTransaction(async transaction => {
      const oldRes = await transaction.collection('course_schedule').doc(id).get()
      const oldSchedule = oldRes && oldRes.data
      if (!oldSchedule) {
        throw new Error('课程日程不存在')
      }

      const isOwnerTeacher = oldSchedule.teacherId && oldSchedule.teacherId === callerOpenid
      const isOwnerStudent = (oldSchedule.creatorRole === 'student' || oldSchedule.teacherId === 'custom_teacher') &&
        oldSchedule.createdBy === callerOpenid
      if (!isOwnerTeacher && !isOwnerStudent) {
        throw new Error('无权限修改此课程日程')
      }

      const oldSch = oldSchedule.schedule || {}
      const newDate = data.date !== undefined ? data.date : oldSch.date
      const newStart = data.startTime !== undefined ? data.startTime : oldSch.startTime
      const newEnd = data.endTime !== undefined ? data.endTime : oldSch.endTime
      const newClassroom = data.classroom !== undefined ? data.classroom : (oldSch.classroom || '')

      const timeChanged = (newDate !== oldSch.date) || (newStart !== oldSch.startTime)
      const futureSession = isSessionInFuture(newDate, newEnd)
      const now = new Date()

      const updateData = { updateTime: now }
      if (data.date !== undefined) updateData['schedule.date'] = data.date
      if (data.startTime !== undefined) updateData['schedule.startTime'] = data.startTime
      if (data.endTime !== undefined) updateData['schedule.endTime'] = data.endTime
      if (data.classroom !== undefined) updateData['schedule.classroom'] = data.classroom
      if (data.name !== undefined) updateData.name = data.name
      if (data.price !== undefined) updateData.price = data.price
      if (data.reminderTime !== undefined) updateData.reminderTime = data.reminderTime
      if (data.status !== undefined) updateData.status = data.status

      txResult = await transaction.collection('course_schedule').doc(id).update({
        data: updateData
      })

      if (unfinishedIds.length > 0) {
        const unfinishedUpdate = { updateTime: now }
        if (data.date !== undefined) unfinishedUpdate['schedule.date'] = data.date
        if (data.startTime !== undefined) unfinishedUpdate['schedule.startTime'] = data.startTime
        if (data.endTime !== undefined) unfinishedUpdate['schedule.endTime'] = data.endTime
        if (data.classroom !== undefined) unfinishedUpdate['schedule.classroom'] = data.classroom
        if (data.name !== undefined) unfinishedUpdate.name = data.name
        // BUG-21：改期（日期或开始时间变化）时重置教师提醒标记，保留学生订阅
        if (timeChanged) {
          unfinishedUpdate.teacherReminderSent = false
        }
        // 配合 BUG-07：若改为未来时间，恢复为待上状态
        if (futureSession) {
          unfinishedUpdate.status = 'pending'
        }

        for (const uId of unfinishedIds) {
          await transaction.collection('course_unfinished').doc(uId).update({
            data: unfinishedUpdate
          })
        }
      } else if (futureSession) {
        // 兼容历史已被物理删除的记录：改到未来时间时自动补建
        await transaction.collection('course_unfinished').add({
          data: {
            scheduleId: id,
            parentId: oldSchedule.parentId || '',
            teacherId: oldSchedule.teacherId || '',
            name: data.name !== undefined ? data.name : oldSchedule.name,
            schedule: {
              date: newDate,
              startTime: newStart,
              endTime: newEnd,
              classroom: newClassroom
            },
            subscribers: [],
            teacherReminderSent: false,
            status: 'pending',
            createTime: now,
            updateTime: now
          }
        })
      }
    })

    return {
      code: 0,
      data: txResult || { success: true }
    }
  } catch (err) {
    console.error('[editCourseSchedule] error:', err.message)
    return {
      code: 1,
      message: err.message || '修改失败',
      error: err.message
    }
  }
}
