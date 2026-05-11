const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { id } = event

  if (!id) {
    return {
      code: 1,
      message: 'id不能为空'
    }
  }

  try {
    const res = await db.collection('course_schedule').doc(id).remove()

    return {
      code: 0,
      data: res
    }
  } catch (err) {
    return {
      code: 1,
      message: '删除失败',
      error: err.message
    }
  }
}