const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const { computeScheduleDiff } = require('./diffUtils')

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

function isSessionInFuture(dateStr, endTime) {
  if (!dateStr || !endTime) return true
  const d = String(dateStr).split('-').map(Number)
  const t = String(endTime).split(':').map(Number)
  if (d.length !== 3 || t.length < 2 || [...d, ...t].some(n => !Number.isFinite(n))) return true
  const endUTC = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) - BEIJING_OFFSET_MS
  return endUTC > Date.now()
}

async function fetchAllByParent(collectionName, parentId) {
  const MAX_LIMIT = 100
  let list = []
  let offset = 0
  while (true) {
    const res = await db.collection(collectionName)
      .where({ parentId })
      .skip(offset)
      .limit(MAX_LIMIT)
      .get()
    const batch = res.data || []
    list = list.concat(batch)
    if (batch.length < MAX_LIMIT) break
    offset += MAX_LIMIT
  }
  return list
}

exports.main = async (event, context) => {
  const {
    courseId,
    name,
    price,
    teacherId,
    teacherName,
    schedule,
    reminderTime,
    status,
    students,
    selectedDates,
    classType,
    capacity,
    billingMode,
    allowApply
  } = event || {}

  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!courseId) {
    return { code: 1, message: '课程ID不能为空' }
  }

  try {
    // 1. 事务外读取原课程做归属校验，并分页查出关联子课（CloudBase 事务内不支持 .where()）
    const courseRes = await db.collection('courses').doc(courseId).get()
    const existingCourse = courseRes && courseRes.data
    if (!existingCourse) {
      return { code: 1, message: '课程不存在' }
    }

    const isOwnerTeacher = existingCourse.teacherId && existingCourse.teacherId === callerOpenid
    const isOwnerStudent = (existingCourse.creatorRole === 'student' || existingCourse.teacherId === 'custom_teacher') &&
      (existingCourse.createdBy === callerOpenid || (Array.isArray(existingCourse.students) && existingCourse.students.includes(callerOpenid)))

    if (!isOwnerTeacher && !isOwnerStudent) {
      return { code: 1, message: '无权限编辑此课程' }
    }

    // 锁定归属字段，禁止编辑时篡改所有权或将学生自建课挂到真实教师名下（BUG-13 / BUG-27）
    const effectiveTeacherId = isOwnerStudent ? '' : existingCourse.teacherId
    const effectiveCreatorRole = existingCourse.creatorRole || (isOwnerStudent ? 'student' : 'teacher')
    const effectiveCreatedBy = existingCourse.createdBy || callerOpenid
    const effectivePrice = Number.isFinite(parseFloat(price)) ? parseFloat(price) : (existingCourse.price || 0)
    const effectiveName = name !== undefined ? name : existingCourse.name
    const effectiveTeacherName = teacherName !== undefined ? teacherName : existingCourse.teacherName
    const effectiveSchedule = schedule || existingCourse.schedule || {}
    const effectiveStudents = isOwnerStudent
      ? [callerOpenid]
      : (Array.isArray(students) ? students : (existingCourse.students || []))
    const hasReminderTime = typeof reminderTime === 'number' && Number.isFinite(reminderTime)
    const effectiveReminderTime = hasReminderTime
      ? reminderTime
      : (typeof existingCourse.reminderTime === 'number' ? existingCourse.reminderTime : 0)
    const effectiveStatus = status || existingCourse.status || 'available'

    let diff = null
    if (Array.isArray(selectedDates)) {
      const [existingSchedules, existingUnfinished] = await Promise.all([
        fetchAllByParent('course_schedule', courseId),
        fetchAllByParent('course_unfinished', courseId)
      ])
      const unfinishedByScheduleId = new Map()
      existingUnfinished.forEach(u => {
        if (u.scheduleId) unfinishedByScheduleId.set(u.scheduleId, u)
      })
      diff = computeScheduleDiff(existingSchedules, unfinishedByScheduleId, selectedDates, effectiveSchedule)
    }

    const now = new Date()

    // 2. 在事务内仅执行单文档 doc(_id) 与 add() 操作，保证原子性且保留订阅/提醒标记（BUG-08）
    await db.runTransaction(async transaction => {
      const lockedCourseRes = await transaction.collection('courses').doc(courseId).get()
      if (!lockedCourseRes || !lockedCourseRes.data) {
        throw new Error('课程不存在')
      }

      const parentUpdate = {
        name: effectiveName,
        price: effectivePrice,
        teacherId: effectiveTeacherId,
        teacherName: effectiveTeacherName,
        schedule: effectiveSchedule,
        students: effectiveStudents,
        updateTime: now
      }
      if (hasReminderTime) parentUpdate.reminderTime = effectiveReminderTime
      if (status) parentUpdate.status = effectiveStatus
      if (!isOwnerStudent && (classType === 'one_on_one' || classType === 'group')) {
        parentUpdate.classType = classType
      }
      if (!isOwnerStudent && typeof capacity === 'number' && Number.isFinite(capacity)) {
        parentUpdate.capacity = capacity
      }
      if (!isOwnerStudent && (billingMode === 'per_session' || billingMode === 'per_student')) {
        parentUpdate.billingMode = billingMode
      }
      if (!isOwnerStudent && typeof allowApply === 'boolean') {
        parentUpdate.allowApply = allowApply
      }

      await transaction.collection('courses').doc(courseId).update({
        data: parentUpdate
      })

      if (diff) {
        // 保留日期：保留 _id 与 subscribers，仅时间变化时重置 teacherReminderSent
        for (const item of diff.toUpdate) {
          const updatedSubSchedule = {
            date: item.date,
            startTime: effectiveSchedule.startTime,
            endTime: effectiveSchedule.endTime,
            classroom: effectiveSchedule.classroom || ''
          }
          const schUpdate = {
            name: effectiveName,
            price: effectivePrice,
            teacherId: effectiveTeacherId,
            teacherName: effectiveTeacherName,
            schedule: updatedSubSchedule,
            students: effectiveStudents,
            updateTime: now
          }
          if (hasReminderTime) schUpdate.reminderTime = effectiveReminderTime
          if (status) schUpdate.status = effectiveStatus

          await transaction.collection('course_schedule').doc(item.schedule._id).update({
            data: schUpdate
          })

          const futureSession = isSessionInFuture(item.date, updatedSubSchedule.endTime)
          if (item.unfinished) {
            const unfinUpdate = {
              name: effectiveName,
              teacherId: effectiveTeacherId,
              schedule: updatedSubSchedule,
              updateTime: now
            }
            if (item.resetReminderMark) {
              unfinUpdate.teacherReminderSent = false
            }
            if (futureSession && item.unfinished.status === 'finished') {
              unfinUpdate.status = 'pending'
            }
            await transaction.collection('course_unfinished').doc(item.unfinished._id).update({
              data: unfinUpdate
            })
          } else if (futureSession) {
            await transaction.collection('course_unfinished').add({
              data: {
                scheduleId: item.schedule._id,
                schedule: updatedSubSchedule,
                parentId: courseId,
                teacherId: effectiveTeacherId,
                name: effectiveName,
                subscribers: [],
                teacherReminderSent: false,
                status: 'pending',
                createTime: now,
                updateTime: now
              }
            })
          }
        }

        // 移除已取消日期
        for (const item of diff.toRemove) {
          await transaction.collection('course_schedule').doc(item.schedule._id).remove()
          if (item.unfinished) {
            await transaction.collection('course_unfinished').doc(item.unfinished._id).remove()
          }
        }

        // 新增日期
        for (const date of diff.toAdd) {
          const newSubSchedule = {
            date,
            startTime: effectiveSchedule.startTime,
            endTime: effectiveSchedule.endTime,
            classroom: effectiveSchedule.classroom || ''
          }
          const addSchRes = await transaction.collection('course_schedule').add({
            data: {
              name: effectiveName,
              price: effectivePrice,
              teacherId: effectiveTeacherId,
              teacherName: effectiveTeacherName,
              schedule: newSubSchedule,
              reminderTime: effectiveReminderTime,
              status: effectiveStatus,
              students: effectiveStudents,
              parentId: courseId,
              isRepeat: false,
              createdBy: effectiveCreatedBy,
              creatorRole: effectiveCreatorRole,
              createTime: now,
              updateTime: now
            }
          })

          await transaction.collection('course_unfinished').add({
            data: {
              scheduleId: addSchRes._id,
              schedule: newSubSchedule,
              parentId: courseId,
              teacherId: effectiveTeacherId,
              name: effectiveName,
              subscribers: [],
              teacherReminderSent: false,
              status: isSessionInFuture(date, newSubSchedule.endTime) ? 'pending' : 'finished',
              createTime: now,
              updateTime: now
            }
          })
        }
      }
    })

    return {
      code: 0,
      message: '更新成功',
      data: {
        success: true,
        updated: diff ? diff.toUpdate.length : 0,
        added: diff ? diff.toAdd.length : 0,
        removed: diff ? diff.toRemove.length : 0
      }
    }
  } catch (err) {
    console.error('[editCourse] error:', err.message)
    return {
      code: 1,
      message: '更新失败',
      error: err.message
    }
  }
}
