const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { courseId, ...courseData } = event

  if (!courseId) {
    return {
      code: 1,
      message: '课程ID不能为空'
    }
  }

  try {
    const now = new Date()
    await db.collection('courses').doc(courseId).update({
      data: {
        ...courseData,
        updateTime: now
      }
    })

    return {
      code: 0,
      message: '更新成功'
    }
  } catch (err) {
    console.error('更新课程失败:', err)
    return {
      code: 1,
      message: '更新失败',
      error: err.message
    }
  }
}
