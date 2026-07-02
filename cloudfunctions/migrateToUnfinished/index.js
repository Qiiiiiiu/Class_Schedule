const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { batchSize = 100, offset = 0 } = event
  
  try {
    // 分页获取课程数据
    const scheduleRes = await db.collection('course_schedule')
      .skip(offset)
      .limit(batchSize)
      .get()
    
    const courses = scheduleRes.data

    if (!courses || courses.length === 0) {
      return {
        code: 0,
        message: '没有更多课程数据需要迁移',
        count: 0,
        finished: true
      }
    }

    // 获取已有的 course_unfinished 记录（只获取当前批次相关的）
    const courseIds = courses.map(c => c._id)
    const unfinishedRes = await db.collection('course_unfinished')
      .where({
        scheduleId: _.in(courseIds)
      })
      .get()
    
    const existingScheduleIds = new Set(unfinishedRes.data.map(item => item.scheduleId))

    const now = new Date()
    let addedCount = 0
    let skippedCount = 0

    // 使用批量添加
    const batchAddPromises = []
    
    for (const course of courses) {
      // 如果该课程已经在 course_unfinished 中，则跳过
      if (existingScheduleIds.has(course._id)) {
        skippedCount++
        continue
      }

      // 批量添加
      batchAddPromises.push(
        db.collection('course_unfinished').add({
          data: {
            scheduleId: course._id,
            schedule: course.schedule,
            parentId: course.parentId,
            teacherId: course.teacherId,
            name: course.name,
            createTime: now
          }
        })
      )
      addedCount++
    }

    // 等待批量添加完成
    if (batchAddPromises.length > 0) {
      await Promise.all(batchAddPromises)
    }

    return {
      code: 0,
      message: '批次迁移完成',
      data: {
        batchSize: courses.length,
        addedCount: addedCount,
        skippedCount: skippedCount,
        nextOffset: offset + courses.length,
        finished: courses.length < batchSize
      }
    }
  } catch (err) {
    return {
      code: 1,
      message: '迁移失败',
      error: err.message
    }
  }
}
