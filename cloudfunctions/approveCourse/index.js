const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { applicationId, teacherId } = event

  if (!applicationId || !teacherId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const appRes = await db.collection('course_applications').doc(applicationId).get()
    const application = appRes.data

    if (!application) {
      return {
        code: 1,
        message: '申请不存在'
      }
    }

    await db.collection('course_applications').doc(applicationId).update({
      data: {
        status: 'approved',
        updateTime: new Date()
      }
    })

    await db.collection('courses').doc(application.courseId).update({
      data: {
        students: _.push([application.studentId]),
        updateTime: new Date()
      }
    })

    return {
      code: 0,
      message: '已通过申请'
    }
  } catch (err) {
    console.error('通过申请失败:', err)
    return {
      code: 1,
      message: '操作失败',
      error: err.message
    }
  }
}
