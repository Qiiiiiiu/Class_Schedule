const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { teacherId, sourceStudentId, targetStudentId } = event

  if (!teacherId || !sourceStudentId || !targetStudentId) {
    return {
      code: 1,
      message: '参数不完整'
    }
  }

  if (sourceStudentId === targetStudentId) {
    return {
      code: 1,
      message: '不能与自己合并'
    }
  }

  const transaction = await db.startTransaction()

  try {
    const sourceRes = await transaction.collection('teacher_student_bindings')
      .where({
        teacherId,
        studentId: sourceStudentId,
        status: 'unbound'
      }).get()

    if (!sourceRes.data || sourceRes.data.length === 0) {
      await transaction.rollback()
      return {
        code: 1,
        message: '源学生不存在或不是未绑定状态'
      }
    }

    const targetRes = await transaction.collection('teacher_student_bindings')
      .where({
        teacherId,
        studentId: targetStudentId,
        status: 'approved'
      }).get()

    if (!targetRes.data || targetRes.data.length === 0) {
      await transaction.rollback()
      return {
        code: 1,
        message: '目标学生不存在或不是已绑定状态'
      }
    }

    const sourceCoursesRes = await transaction.collection('courses')
      .where({
        teacherId,
        students: _.elemMatch(_.eq(sourceStudentId)),
        status: 'available'
      }).get()

    const sourceCourses = sourceCoursesRes.data

    for (const course of sourceCourses) {
      const newStudents = course.students.filter(id => id !== sourceStudentId)
      if (!newStudents.includes(targetStudentId)) {
        newStudents.push(targetStudentId)
      }

      await transaction.collection('courses')
        .doc(course._id)
        .update({
          data: {
            students: newStudents
          }
        })
    }

    await transaction.collection('teacher_student_bindings')
      .where({
        teacherId,
        studentId: sourceStudentId
      })
      .remove()

    await transaction.commit()

    return {
      code: 0,
      data: {
        message: '合并成功',
        migratedCourses: sourceCourses.length
      }
    }

  } catch (err) {
    await transaction.rollback()
    console.error('合并学生失败:', err)
    return {
      code: 1,
      message: '合并失败',
      error: err.message
    }
  }
}
