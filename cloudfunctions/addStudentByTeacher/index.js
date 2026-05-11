const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { teacherId, studentName, studentPhone, nativePlace, grade, subject, remark } = event

  if (!teacherId || !studentName) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  try {
    let student = null
    
    if (studentPhone && studentPhone.trim()) {
      const checkStudentRes = await db.collection('users').where({
        phone: studentPhone,
        role: 'student'
      }).get()

      if (checkStudentRes.data && checkStudentRes.data.length > 0) {
        student = checkStudentRes.data[0]
        
        await db.collection('users').doc(student._id).update({
          data: {
            name: studentName,
            nativePlace: nativePlace || '',
            grade: grade || '',
            subject: subject || '',
            remark: remark || '',
            updateTime: db.serverDate()
          }
        })
      }
    }
    
    if (!student) {
      const createRes = await db.collection('users').add({
        data: {
          openid: `teacher_add_${Date.now()}`,
          name: studentName,
          phone: studentPhone || '',
          role: 'student',
          avatar: '',
          nativePlace: nativePlace || '',
          grade: grade || '',
          subject: subject || '',
          remark: remark || '',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })

      const getRes = await db.collection('users').doc(createRes._id).get()
      student = getRes.data
    }

    const checkBindingRes = await db.collection('teacher_student_bindings').where({
      teacherId,
      studentId: student.openid,
      status: db.command.in(['pending', 'approved'])
    }).get()

    if (checkBindingRes.data && checkBindingRes.data.length > 0) {
      return {
        code: 1,
        message: '该学生已绑定或待审核'
      }
    }

    await db.collection('teacher_student_bindings').add({
      data: {
        studentId: student.openid,
        teacherId,
        studentName: student.name,
        teacherName: '',
        status: 'unbound',
        applyTime: db.serverDate(),
        approveTime: null,
        remark: remark || '教师主动添加',
        tempId: `temp_${Date.now()}`
      }
    })

    return {
      code: 0,
      data: student
    }
  } catch (err) {
    return {
      code: 1,
      message: '添加失败',
      error: err.message
    }
  }
}