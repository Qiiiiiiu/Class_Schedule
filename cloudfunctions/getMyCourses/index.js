const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { studentId } = event

  if (!studentId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    const res = await db.collection('courses').where({
      students: _.elemMatch(_.eq(studentId)),
      status: 'available'
    }).orderBy('createTime', 'desc').get()

    return {
      code: 0,
      data: res.data
    }
  } catch (err) {
    console.error('获取我的课程失败:', err)
    return {
      code: 1,
      message: '获取失败',
      error: err.message
    }
  }
}
