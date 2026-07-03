const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { courseId, name, price, teacherId, teacherName, schedule, reminderTime, status, students, selectedDates, createdBy, creatorRole } = event

  if (!courseId) {
    return {
      code: 1,
      message: '课程ID不能为空'
    }
  }

  try {
    const now = new Date()
    
    // 1. 更新 courses 父课程信息
    await db.collection('courses').doc(courseId).update({
      data: {
        name,
        price: parseFloat(price) || 0,
        teacherId,
        teacherName,
        schedule,
        students,
        updateTime: now
      }
    })

    // 如果提供了 selectedDates，说明日程发生变化，需同步刷新子课表
    if (selectedDates && Array.isArray(selectedDates)) {
      // 2. 移除旧的子日程数据
      await db.collection('course_schedule').where({
        parentId: courseId
      }).remove()

      // 3. 移除旧的未完成日程数据
      const unfinishedRes = await db.collection('course_unfinished').where({
        parentId: courseId
      }).get()
      
      for (const item of unfinishedRes.data) {
        await db.collection('course_unfinished').doc(item._id).remove()
      }

      // 4. 重构新的子日程及未完成表
      for (const date of selectedDates) {
        const scheduleItem = {
          name,
          price: parseFloat(price) || 0,
          teacherId,
          teacherName,
          schedule: {
            date,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            classroom: schedule.classroom || ''
          },
          reminderTime: reminderTime || 0,
          status: status || 'available',
          students: students || [],
          parentId: courseId,
          isRepeat: false,
          createdBy: createdBy || '',
          creatorRole: creatorRole || '',
          createTime: now,
          updateTime: now
        }

        const scheduleRes = await db.collection('course_schedule').add({
          data: scheduleItem
        })

        await db.collection('course_unfinished').add({
          data: {
            scheduleId: scheduleRes._id,
            schedule: scheduleItem.schedule,
            parentId: courseId,
            teacherId: teacherId,
            name: name,
            createTime: now
          }
        })
      }
    }

    return {
      code: 0,
      message: '更新成功'
    }
  } catch (err) {
    console.error('更新课程失败:', err)
    return {
      code: 1,
      message: '更新失败',
      error: err.message
    }
  }
}
