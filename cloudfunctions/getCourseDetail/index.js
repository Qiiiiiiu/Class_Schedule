const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { courseId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!courseId) {
    return { code: 1, message: '课程ID不能为空' }
  }

  try {
    const res = await db.collection('courses').doc(courseId).get()
    const course = res && res.data
    if (!course) {
      return { code: 1, message: '课程不存在' }
    }

    const isOwnerTeacher = course.teacherId && course.teacherId === callerOpenid
    const isCreator = course.createdBy && course.createdBy === callerOpenid
    const isEnrolledStudent = Array.isArray(course.students) && course.students.includes(callerOpenid)

    if (!isOwnerTeacher && !isCreator && !isEnrolledStudent) {
      return { code: 1, message: '无权限查看该课程详情' }
    }

    return {
      code: 0,
      data: course
    }
  } catch (err) {
    console.error('[getCourseDetail] error:', err.message)
    return {
      code: 1,
      message: '获取课程详情失败',
      error: err.message
    }
  }
}
