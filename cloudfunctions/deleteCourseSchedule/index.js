const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { id } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!id) {
    return { code: 1, message: 'id不能为空' }
  }

  try {
    const schRes = await db.collection('course_schedule').doc(id).get()
    const schedule = schRes && schRes.data
    if (!schedule) {
      return { code: 1, message: '课程日程不存在' }
    }

    const isOwnerTeacher = schedule.teacherId && schedule.teacherId === callerOpenid
    const isOwnerStudent = (schedule.creatorRole === 'student' || schedule.teacherId === 'custom_teacher') &&
      schedule.createdBy === callerOpenid
    if (!isOwnerTeacher && !isOwnerStudent) {
      return { code: 1, message: '无权限删除他人课程日程' }
    }

    const res = await db.collection('course_schedule').doc(id).remove()
    await db.collection('course_unfinished').where({ scheduleId: id }).remove()

    return {
      code: 0,
      data: res
    }
  } catch (err) {
    console.error('[deleteCourseSchedule] error:', err.message)
    return {
      code: 1,
      message: '删除失败',
      error: err.message
    }
  }
}
