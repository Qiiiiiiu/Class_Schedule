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
      const res = await db.collection('student_details').where({
        teacherId,
        studentId
      }).get()

      return {
        code: 0,
        data: res.data.length > 0 ? res.data[0] : null
      }
    } else if (type === 'save') {
      const checkRes = await db.collection('student_details').where({
        teacherId,
        studentId
      }).get()

      if (checkRes.data.length > 0) {
        await db.collection('student_details').doc(checkRes.data[0]._id).update({
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
        await db.collection('student_details').add({
          data: {
            teacherId,
            studentId,
            ...studentDetail,
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })

        return {
          code: 0,
          message: '保存成功'
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