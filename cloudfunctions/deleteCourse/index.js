const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  console.log('deleteCourse event:', JSON.stringify(event))
  
  const { courseId, teacherId } = event

  if (!courseId || !teacherId) {
    console.log('参数缺失 - courseId:', courseId, ', teacherId:', teacherId)
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    await db.collection('courses').doc(courseId).remove()

    await db.collection('course_schedule').where({
      parentId: courseId
    }).remove()

    return {
      code: 0,
      data: true,
      message: '删除成功'
    }
  } catch (err) {
    console.error('删除课程失败:', err)
    return {
      code: 1,
      message: '删除失败',
      error: err.message
    }
  }
}