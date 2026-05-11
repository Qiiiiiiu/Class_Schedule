const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { courseId, studentId, studentName, courseName, teacherId, teacherName } = event

  if (!courseId || !studentId || !teacherId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const checkRes = await db.collection('course_applications').where({
      courseId,
      studentId,
      status: 'pending'
    }).get()

    if (checkRes.data.length > 0) {
      return {
        code: 1,
        message: '您已申请过该课程'
      }
    }

    const now = new Date()
    await db.collection('course_applications').add({
      data: {
        courseId,
        studentId,
        studentName,
        courseName,
        teacherId,
        teacherName,
        status: 'pending',
        applyTime: now,
        createTime: now,
        updateTime: now
      }
    })

    return {
      code: 0,
      message: '申请已提交'
    }
  } catch (err) {
    console.error('申请课程失败:', err)
    return {
      code: 1,
      message: '申请失败',
      error: err.message
    }
  }
}
