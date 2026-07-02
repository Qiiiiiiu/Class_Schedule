const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    const { teacherId } = event

    // 找到该教师所有课程的未完成课程，并清除提醒标记
    const coursesRes = await db.collection('courses').where({
      teacherId: teacherId
    }).field({
      _id: true
    }).get()

    const courseIds = coursesRes.data.map(c => c._id)
    
    if (courseIds.length === 0) {
      return {
        code: 0,
        data: { success: true, count: 0 },
        message: '暂无课程'
      }
    }

    // 找到所有课程的课程安排
    const schedulesRes = await db.collection('course_schedule').where({
      parentId: _.in(courseIds)
    }).field({
      _id: true
    }).get()

    const scheduleIds = schedulesRes.data.map(s => s._id)
    
    if (scheduleIds.length === 0) {
      return {
        code: 0,
        data: { success: true, count: 0 },
        message: '暂无课程安排'
      }
    }

    // 清除所有未完成课程的 teacherReminderSent 标记
    const result = await db.collection('course_unfinished').where({
      scheduleId: _.in(scheduleIds)
    }).update({
      data: {
        teacherReminderSent: false,
        updateTime: db.serverDate()
      }
    })

    return {
      code: 0,
      data: {
        success: true,
        count: result.stats.updated
      },
      message: `已清除 ${result.stats.updated} 个课程的提醒标记`
    }
  } catch (err) {
    console.error('清除教师提醒标记失败:', err)
    return {
      code: 1,
      message: '操作失败',
      error: err.message
    }
  }
}