const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { name, price, teacherId, teacherName, parentId, schedule, reminderTime, status, students, isRepeat, weekdays, repeatCount, repeatStartDate } = event

  if (!name || !teacherId || !parentId || !schedule || !schedule.startTime || !schedule.endTime) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  if (!isRepeat && !schedule.date) {
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
      const currentDate = new Date(startDate)
      
      while (count < maxCount) {
        const dayOfWeek = currentDate.getDay()
        if (weekdays.includes(dayOfWeek)) {
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
          
          scheduleItems.push({
            name,
            price: parseFloat(price) || 0,
            teacherId,
            teacherName,
            parentId,
            schedule: {
              date: dateStr,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              classroom: schedule.classroom || ''
            },
            reminderTime: reminderTime || 0,
            status: status || 'available',
            students: students || [],
            isRepeat: true,
            weekdays: weekdays,
            repeatCount: repeatCount,
            createTime: now,
            updateTime: now
          })
          count++
        }
        currentDate.setDate(currentDate.getDate() + 1)
      }

      if (scheduleItems.length === 0) {
        return {
          code: 1,
          message: '没有可添加的课程日期'
        }
      }

      const scheduleResults = []
      for (const item of scheduleItems) {
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
        message: `成功添加 ${scheduleItems.length} 节课程`,
        data: {
          parentId: parentId,
          count: scheduleItems.length,
          courses: scheduleItems
        }
      }
    } else {
      const res = await db.collection('course_schedule').add({
        data: {
          name,
          price: parseFloat(price) || 0,
          teacherId,
          teacherName,
          parentId,
          schedule: {
            date: schedule.date || null,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            classroom: schedule.classroom || ''
          },
          reminderTime: reminderTime || 0,
          status: status || 'available',
          students: students || [],
          isRepeat: isRepeat || false,
          weekdays: weekdays || [],
          repeatCount: repeatCount || 0,
          createTime: now,
          updateTime: now
        }
      })

      // 添加到未完成课程数据集
      await db.collection('course_unfinished').add({
        data: {
          scheduleId: res._id,
          schedule: {
            date: schedule.date || null,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            classroom: schedule.classroom || ''
          },
          parentId: parentId,
          teacherId: teacherId,
          name: name,
          createTime: now
        }
      })

      const newCourse = await db.collection('course_schedule').doc(res._id).get()

      return {
        code: 0,
        data: {
          parentId: parentId,
          count: 1,
          courses: [newCourse.data]
        }
      }
    }
  } catch (err) {
    return {
      code: 1,
      message: '添加失败',
      error: err.message
    }
  }
}