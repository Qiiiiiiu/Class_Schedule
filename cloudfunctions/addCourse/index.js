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
    schedule,
    reminderTime,
    status,
    students,
    isRepeat,
    weekdays,
    repeatCount,
    repeatStartDate,
    creatorRole,
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

  const isStudentCreated = creatorRole === 'student' || teacherId === 'custom_teacher' || !teacherId
  const effectiveCreatorRole = isStudentCreated ? 'student' : 'teacher'
  const effectiveTeacherId = isStudentCreated ? '' : callerOpenid
  const effectiveCreatedBy = callerOpenid
  const effectiveStudents = isStudentCreated
    ? [callerOpenid]
    : [...new Set((Array.isArray(students) ? students : []).filter(Boolean).map(String))]
  const effectiveReminderTime = (typeof reminderTime === 'number' && Number.isFinite(reminderTime)) ? reminderTime : 0
  const effectiveStatus = status || 'available'

  // 班级模型字段（一对一 vs 大班课）
  const effectiveClassType = isStudentCreated
    ? 'one_on_one'
    : (classType === 'one_on_one' || classType === 'group')
      ? classType
      : (effectiveStudents.length > 1 ? 'group' : 'one_on_one')

  if (!isStudentCreated && effectiveClassType === 'one_on_one' && effectiveStudents.length > 1) {
    return { code: 1, message: '一对一班级最多只能绑定 1 名学生' }
  }

  const parsedCap = Number(capacity)
  const effectiveCapacity = effectiveClassType === 'one_on_one'
    ? 1
    : (Number.isFinite(parsedCap) && parsedCap > 0 ? Math.floor(parsedCap) : 0)

  if (!isStudentCreated && effectiveClassType === 'group' && effectiveCapacity > 0 && effectiveStudents.length > effectiveCapacity) {
    return { code: 1, message: `初始学员人数超出班级上限（${effectiveCapacity}人）` }
  }

  const effectiveBillingMode = effectiveClassType === 'group' && billingMode === 'per_student'
    ? 'per_student'
    : 'per_session'
  const effectiveAllowApply = isStudentCreated
    ? false
    : (typeof allowApply === 'boolean' ? allowApply : effectiveClassType === 'group')

  if (!name || (!isStudentCreated && !effectiveTeacherId)) {
    return { code: 1, message: '参数不完整' }
  }

  try {
    const now = new Date()

    if (isRepeat && Array.isArray(weekdays) && weekdays.length > 0) {
      const scheduleItems = []
      const today = new Date()

      let startDate
      if (repeatStartDate) {
        const dateParts = repeatStartDate.split('-')
        startDate = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10))
      } else if (schedule && schedule.date) {
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
            teacherName: teacherName || '',
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

      const parentCourse = {
        name,
        price: parseFloat(price) || 0,
        classType: effectiveClassType,
        capacity: effectiveCapacity,
        billingMode: effectiveBillingMode,
        allowApply: effectiveAllowApply,
        teacherId: effectiveTeacherId,
        teacherName: teacherName || '',
        schedule: {
          date: null,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          classroom: schedule.classroom || ''
        },
        reminderTime: effectiveReminderTime,
        status: effectiveStatus,
        students: effectiveStudents,
        isRepeat: true,
        weekdays,
        repeatCount,
        createdBy: effectiveCreatedBy,
        creatorRole: effectiveCreatorRole,
        createTime: now,
        updateTime: now
      }

      const parentResult = await db.collection('courses').add({ data: parentCourse })
      const parentId = parentResult._id

      const scheduleItemsWithParentId = scheduleItems.map(item => ({ ...item, parentId }))
      const scheduleResults = []
      for (const item of scheduleItemsWithParentId) {
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
        message: `成功添加 ${scheduleItemsWithParentId.length} 节课程`,
        data: {
          parentId,
          count: scheduleItemsWithParentId.length,
          courses: scheduleItemsWithParentId
        }
      }
    }

    const parentCourse = {
      name,
      price: parseFloat(price) || 0,
      classType: effectiveClassType,
      capacity: effectiveCapacity,
      billingMode: effectiveBillingMode,
      allowApply: effectiveAllowApply,
      teacherId: effectiveTeacherId,
      teacherName: teacherName || '',
      schedule: {
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        classroom: schedule.classroom || ''
      },
      reminderTime: effectiveReminderTime,
      status: effectiveStatus,
      students: effectiveStudents,
      isRepeat: false,
      weekdays: null,
      repeatCount: 1,
      createdBy: effectiveCreatedBy,
      creatorRole: effectiveCreatorRole,
      createTime: now,
      updateTime: now
    }

    const parentResult = await db.collection('courses').add({ data: parentCourse })
    const parentId = parentResult._id

    const scheduleItem = {
      name,
      price: parseFloat(price) || 0,
      classType: effectiveClassType,
      billingMode: effectiveBillingMode,
      teacherId: effectiveTeacherId,
      teacherName: teacherName || '',
      schedule: {
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        classroom: schedule.classroom || ''
      },
      reminderTime: effectiveReminderTime,
      status: effectiveStatus,
      students: effectiveStudents,
      studentCount: effectiveStudents.length,
      parentId,
      createdBy: effectiveCreatedBy,
      creatorRole: effectiveCreatorRole,
      createTime: now,
      updateTime: now
    }

    const scheduleRes = await db.collection('course_schedule').add({ data: scheduleItem })

    await db.collection('course_unfinished').add({
      data: {
        scheduleId: scheduleRes._id,
        schedule: scheduleItem.schedule,
        parentId: scheduleItem.parentId,
        teacherId: scheduleItem.teacherId,
        name: scheduleItem.name,
        subscribers: [],
        teacherReminderSent: false,
        status: 'pending',
        createTime: now,
        updateTime: now
      }
    })

    return {
      code: 0,
      message: '添加成功',
      data: {
        parentId,
        count: 1,
        courses: [scheduleItem]
      }
    }
  } catch (err) {
    console.error('[addCourse] error:', err.message)
    return {
      code: 1,
      message: '添加失败',
      error: err.message
    }
  }
}
