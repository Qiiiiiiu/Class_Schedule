const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const {
    name,
    price,
    teacherId,
    teacherName,
    parentId,
    schedule,
    reminderTime,
    status,
    students,
    isRepeat,
    weekdays,
    repeatCount,
    repeatStartDate,
    creatorRole
  } = event || {}

  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!name || !parentId || !schedule || !schedule.startTime || !schedule.endTime) {
    return { code: 1, message: '参数不完整' }
  }
  if (!isRepeat && !schedule.date) {
    return { code: 1, message: '参数不完整' }
  }

  try {
    // 校验父课程归属，防止向他人课程注入子日程
    const parentRes = await db.collection('courses').doc(parentId).get()
    const parentCourse = parentRes && parentRes.data
    if (!parentCourse) {
      return { code: 1, message: '父课程不存在' }
    }

    const isOwnerTeacher = parentCourse.teacherId && parentCourse.teacherId === callerOpenid
    const isOwnerStudent = (parentCourse.creatorRole === 'student' || parentCourse.teacherId === 'custom_teacher') &&
      parentCourse.createdBy === callerOpenid
    if (!isOwnerTeacher && !isOwnerStudent) {
      return { code: 1, message: '无权限向他人课程添加日程' }
    }

    const effectiveCreatorRole = isOwnerStudent ? 'student' : (creatorRole || 'teacher')
    const effectiveTeacherId = isOwnerStudent ? '' : callerOpenid
    const effectiveCreatedBy = callerOpenid
    const effectiveStudents = isOwnerStudent
      ? [callerOpenid]
      : (Array.isArray(students) ? students : (parentCourse.students || []))
    const effectiveClassType = parentCourse.classType || (effectiveStudents.length > 1 ? 'group' : 'one_on_one')
    const effectiveBillingMode = parentCourse.billingMode || 'per_session'
    const effectiveReminderTime = (typeof reminderTime === 'number' && Number.isFinite(reminderTime))
      ? reminderTime
      : (typeof parentCourse.reminderTime === 'number' ? parentCourse.reminderTime : 0)
    const effectiveStatus = status || parentCourse.status || 'available'
    const now = new Date()

    if (isRepeat && Array.isArray(weekdays) && weekdays.length > 0) {
      const scheduleItems = []
      const today = new Date()

      let startDate
      if (repeatStartDate) {
        const dateParts = repeatStartDate.split('-')
        startDate = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10))
      } else if (schedule.date) {
        const dateParts = schedule.date.split('-')
        startDate = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10))
      } else {
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      }

      let count = 0
      const maxCount = repeatCount === -1 ? 100 : Math.min(Number(repeatCount) || 1, 200)
      const currentDate = new Date(startDate)

      while (count < maxCount) {
        const dayOfWeek = currentDate.getDay()
        if (weekdays.includes(dayOfWeek)) {
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
          scheduleItems.push({
            name,
            price: parseFloat(price) || 0,
            classType: effectiveClassType,
            billingMode: effectiveBillingMode,
            teacherId: effectiveTeacherId,
            teacherName: teacherName || parentCourse.teacherName || '',
            parentId,
            schedule: {
              date: dateStr,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              classroom: schedule.classroom || ''
            },
            reminderTime: effectiveReminderTime,
            status: effectiveStatus,
            students: effectiveStudents,
            studentCount: effectiveStudents.length,
            isRepeat: true,
            weekdays,
            repeatCount,
            createdBy: effectiveCreatedBy,
            creatorRole: effectiveCreatorRole,
            createTime: now,
            updateTime: now
          })
          count++
        }
        currentDate.setDate(currentDate.getDate() + 1)
      }

      if (scheduleItems.length === 0) {
        return { code: 1, message: '没有可添加的课程日期' }
      }

      const scheduleResults = []
      for (const item of scheduleItems) {
        const res = await db.collection('course_schedule').add({ data: item })
        scheduleResults.push({ scheduleId: res._id, item })
      }

      await Promise.all(
        scheduleResults.map(res =>
          db.collection('course_unfinished').add({
            data: {
              scheduleId: res.scheduleId,
              schedule: res.item.schedule,
              parentId: res.item.parentId,
              teacherId: res.item.teacherId,
              name: res.item.name,
              subscribers: [],
              teacherReminderSent: false,
              status: 'pending',
              createTime: now,
              updateTime: now
            }
          })
        )
      )

      return {
        code: 0,
        message: `成功添加 ${scheduleItems.length} 节课程`,
        data: {
          parentId,
          count: scheduleItems.length,
          courses: scheduleItems
        }
      }
    }

    const res = await db.collection('course_schedule').add({
      data: {
        name,
        price: parseFloat(price) || 0,
        classType: effectiveClassType,
        billingMode: effectiveBillingMode,
        teacherId: effectiveTeacherId,
        teacherName: teacherName || parentCourse.teacherName || '',
        parentId,
        schedule: {
          date: schedule.date || null,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          classroom: schedule.classroom || ''
        },
        reminderTime: effectiveReminderTime,
        status: effectiveStatus,
        students: effectiveStudents,
        studentCount: effectiveStudents.length,
        isRepeat: isRepeat || false,
        weekdays: weekdays || [],
        repeatCount: repeatCount || 0,
        createdBy: effectiveCreatedBy,
        creatorRole: effectiveCreatorRole,
        createTime: now,
        updateTime: now
      }
    })

    await db.collection('course_unfinished').add({
      data: {
        scheduleId: res._id,
        schedule: {
          date: schedule.date || null,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          classroom: schedule.classroom || ''
        },
        parentId,
        teacherId: effectiveTeacherId,
        name,
        subscribers: [],
        teacherReminderSent: false,
        status: 'pending',
        createTime: now,
        updateTime: now
      }
    })

    const newCourse = await db.collection('course_schedule').doc(res._id).get()

    return {
      code: 0,
      data: {
        parentId,
        count: 1,
        courses: [newCourse.data]
      }
    }
  } catch (err) {
    console.error('[addCourseSchedule] error:', err.message)
    return {
      code: 1,
      message: '添加失败',
      error: err.message
    }
  }
}
