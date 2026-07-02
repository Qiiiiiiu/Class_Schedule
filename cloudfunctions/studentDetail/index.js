const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { type, teacherId, studentId, studentDetail } = event
  console.log('studentDetail 云函数被调用:', { type, teacherId, studentId, studentDetail })

  if (!type || !teacherId || !studentId) {
    console.log('参数不完整')
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    if (type === 'get') {
      const userRes = await db.collection('users').where({
        openid: studentId
      }).get()

      if (userRes.data.length > 0) {
        const user = userRes.data[0]
        return {
          code: 0,
          data: {
            nativePlace: user.nativePlace || '',
            grade: user.grade || '',
            subject: user.subject || '',
            remark: user.remark || ''
          }
        }
      }

      return {
        code: 0,
        data: null
      }
    } else if (type === 'save') {
      const userRes = await db.collection('users').where({
        openid: studentId
      }).get()

      if (userRes.data.length > 0) {
        await db.collection('users').doc(userRes.data[0]._id).update({
          data: {
            ...studentDetail,
            updateTime: db.serverDate()
          }
        })

        return {
          code: 0,
          message: '更新成功'
        }
      } else {
        return {
          code: 1,
          message: '未找到该学生记录'
        }
      }
    }

    return {
      code: 1,
      message: '无效的操作类型'
    }
  } catch (err) {
    console.log('云函数错误:', err)
    return {
      code: 1,
      message: '操作失败',
      error: err.message
    }
  }
}
