{
  "name": "课程管理小程序",
  "version": "1.0.0",
  "description": "教师端和学生端课程管理小程序",
  "cloudfunctions": [
    "login",
    "getUserInfo",
    "bindTeacher",
    "approveBinding",
    "rejectBinding",
    "applyCourse",
    "approveCourse",
    "rejectCourse",
    "getStudents",
    "getCourses",
    "getSchedule",
    "addCourse",
    "editCourse",
    "deleteCourse",
    "sendReminder"
  ],
  "pages": {
    "common": [
      "pages/common/login/index",
      "pages/common/my-info/index"
    ],
    "teacher": [
      "pages/teacher/home/index",
      "pages/teacher/students/index",
      "pages/teacher/courses/index",
      "pages/teacher/schedule/index",
      "pages/teacher/bindings/index"
    ],
    "student": [
      "pages/student/home/index",
      "pages/student/teachers/index",
      "pages/student/applications/index",
      "pages/student/my-courses/index"
    ]
  },
  "database": {
    "collections": {
      "users": {
        "description": "用户信息表",
        "fields": {
          "openid": "string",
          "role": "string(teacher|student)",
          "name": "string",
          "avatar": "string",
          "phone": "string",
          "createTime": "number",
          "updateTime": "number"
        }
      },
      "courses": {
        "description": "课程信息表",
        "fields": {
          "name": "string",
          "teacherId": "string",
          "teacherName": "string",
          "students": "array",
          "schedule": {
            "dayOfWeek": "number(0-6)",
            "startTime": "string(HH:mm)",
            "endTime": "string(HH:mm)",
            "classroom": "string"
          },
          "reminderTime": "number(分钟)",
          "status": "string(available|unavailable)",
          "createTime": "number",
          "updateTime": "number"
        }
      },
      "teacher_student_bindings": {
        "description": "师生绑定关系表",
        "fields": {
          "teacherId": "string",
          "teacherName": "string",
          "studentId": "string",
          "studentName": "string",
          "status": "string(pending|approved|rejected)",
          "applyTime": "number",
          "approveTime": "number",
          "remark": "string"
        }
      },
      "course_applications": {
        "description": "课程预约申请表",
        "fields": {
          "courseId": "string",
          "courseName": "string",
          "studentId": "string",
          "studentName": "string",
          "teacherId": "string",
          "teacherName": "string",
          "status": "string(pending|approved|rejected)",
          "applyTime": "number",
          "approveTime": "number",
          "remark": "string"
        }
      }
    }
  },
  "roles": {
    "teacher": {
      "permissions": [
        "view_students",
        "manage_courses",
        "view_schedule",
        "bind_students",
        "approve_applications",
        "send_reminders"
      ]
    },
    "student": {
      "permissions": [
        "view_teachers",
        "bind_teachers",
        "apply_courses",
        "view_my_courses",
        "view_schedule"
      ]
    }
  }
}