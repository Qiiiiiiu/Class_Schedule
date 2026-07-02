const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { name, price, teacherId, teacherName, schedule, reminderTime, status, students, isRepeat, weekdays, repeatCount, repeatStartDate } = event

  if (!name || !teacherId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const now = new Date()

    if (isRepeat && weekdays && weekdays.length > 0) {
    const scheduleItems = []
    const today = new Date()
    
    let startDate
    if (repeatStartDate) {
      const dateParts = repeatStartDate.split('-')
      startDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]))
    } else if (schedule.date) {
      const dateParts = schedule.date.split('-')
      startDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]))
    } else {
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    }

    let count = 0
    const maxCount = repeatCount === -1 ? 100 : repeatCount
    const interval = 7

    for (let i = 0; count < maxCount; i++) {
      for (const weekday of weekdays) {
        if (count >= maxCount) break

        const targetDate = new Date(startDate)
        targetDate.setDate(targetDate.getDate() + i * interval)

        const currentWeekday = targetDate.getDay()
        const daysToAdd = (weekday - currentWeekday + 7) % 7
        targetDate.setDate(targetDate.getDate() + daysToAdd)

        const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`

        scheduleItems.push({
          name,
          price: price || 0,
          teacherId,
          teacherName,
          schedule: {
            date: dateStr,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            classroom: schedule.classroom
          },
          reminderTime: reminderTime || 0,
          status: status || 'available',
          students: students || [],
          createTime: now,
          updateTime: now
        })
        count++
      }
    }

      if (scheduleItems.length === 0) {
        return {
          code: 1,
          message: '没有可添加的课程日期'
        }
      }

      const parentCourse = {
        name,
        price: price || 0,
        teacherId,
        teacherName,
        schedule: {
          date: null,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          classroom: schedule.classroom
        },
        reminderTime: reminderTime || 0,
        status: status || 'available',
        students: students || [],
        isRepeat: true,
        weekdays: weekdays,
        repeatCount: repeatCount,
        createTime: now,
        updateTime: now
      }

      const parentResult = await db.collection('courses').add({
        data: parentCourse
      })

      const parentId = parentResult._id

      const scheduleItemsWithParentId = scheduleItems.map(item => ({
        ...item,
        parentId: parentId
      }))

      const scheduleResults = []
      for (const item of scheduleItemsWithParentId) {
        const res = await db.collection('course_schedule').add({
          data: item
        })
        scheduleResults.push({
          scheduleId: res._id,
          item
        })
      }

      // 添加到未完成课程数据集
      const unfinishedPromises = scheduleResults.map(res => {
        return db.collection('course_unfinished').add({
          data: {
            scheduleId: res.scheduleId,
            schedule: res.item.schedule,
            parentId: res.item.parentId,
            teacherId: res.item.teacherId,
            name: res.item.name,
            createTime: now
          }
        })
      })

      await Promise.all(unfinishedPromises)

      return {
        code: 0,
        message: `成功添加 ${scheduleItemsWithParentId.length} 节课程`,
        data: {
          parentId: parentId,
          count: scheduleItemsWithParentId.length,
          courses: scheduleItemsWithParentId
        }
      }
    } else {
      const parentCourse = {
        name,
        price: price || 0,
        teacherId,
        teacherName,
        schedule: {
          date: schedule.date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          classroom: schedule.classroom
        },
        reminderTime: reminderTime || 0,
        status: status || 'available',
        students: students || [],
        isRepeat: false,
        weekdays: null,
        repeatCount: 1,
        createTime: now,
        updateTime: now
      }

      const parentResult = await db.collection('courses').add({
        data: parentCourse
      })

      const parentId = parentResult._id

      const scheduleItem = {
        name,
        price: price || 0,
        teacherId,
        teacherName,
        schedule: schedule,
        reminderTime: reminderTime || 0,
        status: status || 'available',
        students: students || [],
        parentId: parentId,
        createTime: now,
        updateTime: now
      }

      const scheduleRes = await db.collection('course_schedule').add({
        data: scheduleItem
      })

      // 添加到未完成课程数据集
      await db.collection('course_unfinished').add({
        data: {
          scheduleId: scheduleRes._id,
          schedule: scheduleItem.schedule,
          parentId: scheduleItem.parentId,
          teacherId: scheduleItem.teacherId,
          name: scheduleItem.name,
          createTime: now
        }
      })

      return {
        code: 0,
        message: '添加成功',
        data: {
          parentId: parentId,
          count: 1,
          courses: [scheduleItem]
        }
      }
    }
  } catch (err) {
    console.error('添加课程失败:', err)
    return {
      code: 1,
      message: '添加失败',
      error: err.message
    }
  }
}