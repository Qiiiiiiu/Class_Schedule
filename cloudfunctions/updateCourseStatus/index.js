const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const ALLOWED_STATUS = ['available', 'unavailable']

exports.main = async (event, context) => {
  const { courseId, status } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!courseId) {
    return { code: 1, message: '课程ID不能为空' }
  }
  if (!ALLOWED_STATUS.includes(status)) {
    return { code: 1, message: '无效的课程状态' }
  }

  try {
    const courseRes = await db.collection('courses').doc(courseId).get()
    const course = courseRes && courseRes.data
    if (!course) {
      return { code: 1, message: '课程不存在' }
    }
    if (course.teacherId !== callerOpenid) {
      return { code: 1, message: '无权限修改他人课程状态' }
    }

    const now = new Date()
    await db.collection('courses').doc(courseId).update({
      data: {
        status,
        updateTime: now
      }
    })

    // 同步更新子课表状态
    await db.collection('course_schedule').where({ parentId: courseId }).update({
      data: {
        status,
        updateTime: now
      }
    })

    return {
      code: 0,
      data: true,
      message: '更新成功'
    }
  } catch (err) {
    console.error('[updateCourseStatus] error:', err.message)
    return {
      code: 1,
      message: '更新失败',
      error: err.message
    }
  }
}
