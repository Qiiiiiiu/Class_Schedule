const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { courseId, teacherId } = event || {}
  const wxContext = cloud.getWXContext()
  const callerOpenid = wxContext && wxContext.OPENID

  if (!callerOpenid) {
    return { code: 1, message: '未授权访问' }
  }
  if (!courseId) {
    return { code: 1, message: '参数不完整' }
  }

  try {
    const courseRes = await db.collection('courses').doc(courseId).get()
    const course = courseRes && courseRes.data
    if (!course) {
      return { code: 1, message: '课程不存在' }
    }

    const isOwnerTeacher = course.teacherId && course.teacherId === callerOpenid
    const isOwnerStudent = (course.creatorRole === 'student' || course.teacherId === 'custom_teacher') &&
      (course.createdBy === callerOpenid || (Array.isArray(course.students) && course.students.includes(callerOpenid)))

    if (!isOwnerTeacher && !isOwnerStudent) {
      return { code: 1, message: '无权限删除他人课程' }
    }

    await db.collection('courses').doc(courseId).remove()
    await db.collection('course_schedule').where({ parentId: courseId }).remove()
    await db.collection('course_unfinished').where({ parentId: courseId }).remove()

    return {
      code: 0,
      data: true,
      message: '删除成功'
    }
  } catch (err) {
    console.error('[deleteCourse] error:', err.message)
    return {
      code: 1,
      message: '删除失败',
      error: err.message
    }
  }
}
