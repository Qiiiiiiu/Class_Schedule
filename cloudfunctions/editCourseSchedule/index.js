const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { id, data } = event

  console.log('editCourseSchedule called with:', { id, data })

  if (!id) {
    return {
      code: 1,
      message: 'id不能为空'
    }
  }

  try {
    const updateData = {}
    
    if (data.date !== undefined) updateData['schedule.date'] = data.date
    if (data.startTime !== undefined) updateData['schedule.startTime'] = data.startTime
    if (data.endTime !== undefined) updateData['schedule.endTime'] = data.endTime
    if (data.classroom !== undefined) updateData['schedule.classroom'] = data.classroom
    if (data.name !== undefined) updateData.name = data.name
    if (data.price !== undefined) updateData.price = data.price
    if (data.reminderTime !== undefined) updateData.reminderTime = data.reminderTime
    if (data.status !== undefined) updateData.status = data.status
    updateData.updateTime = db.serverDate()

    console.log('updateData:', updateData)

    const res = await db.collection('course_schedule').doc(id).update({
      data: updateData
    })

    console.log('update result:', res)

    const unfinishedRes = await db.collection('course_unfinished').where({
      scheduleId: id
    }).get()

    if (unfinishedRes.data && unfinishedRes.data.length > 0) {
      const unfinishedUpdate = {}
      if (data.date !== undefined) unfinishedUpdate['schedule.date'] = data.date
      if (data.startTime !== undefined) unfinishedUpdate['schedule.startTime'] = data.startTime
      if (data.endTime !== undefined) unfinishedUpdate['schedule.endTime'] = data.endTime
      if (data.classroom !== undefined) unfinishedUpdate['schedule.classroom'] = data.classroom
      if (data.name !== undefined) unfinishedUpdate.name = data.name
      unfinishedUpdate.updateTime = db.serverDate()

      for (const unfinished of unfinishedRes.data) {
        await db.collection('course_unfinished').doc(unfinished._id).update({
          data: unfinishedUpdate
        })
      }
    }

    return {
      code: 0,
      data: res
    }
  } catch (err) {
    console.error('editCourseSchedule error:', err)
    return {
      code: 1,
      message: '修改失败',
      error: err.message
    }
  }
}