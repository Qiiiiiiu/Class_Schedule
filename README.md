# 课程管理微信小程序（教师端 & 学生端）

基于微信云开发（CloudBase）的教务排课与上课提醒小程序，支持教师排课/课时管理/学生绑定审核/选课审批/月度收入统计，以及学生端日程月历、周课表、自建课程、选课申请与上课提醒订阅。

## 目录结构

- `miniprogram/`：小程序前端源码
  - `config.js`：云开发环境 ID 与订阅消息模板 ID 统一配置
  - `pages/common/`：登录页、我的信息（姓名修改、明暗主题切换、退出登录）
  - `pages/teacher/`：教师首页（仪表盘）、教务管理、学生管理/详情/课时、绑定审核、课程管理/选课审批、周课表
  - `pages/student/`：学生首页、教师信息与选课申请、我的申请、周课表与课程列表、课程详情/自建课程
- `cloudfunctions/`：云函数源码（均通过 `cloud.getWXContext().OPENID` 做身份与归属校验）

## 本地开发与部署

1. 使用微信开发者工具打开本项目根目录（`project.config.json` 已配置稳定基础库 `3.15.2`）。
2. 如切换云环境或订阅消息模板，只需修改：
   - 前端：`miniprogram/config.js` 中的 `ENV_ID` 和 `REMINDER_TEMPLATE_ID`
   - 提醒云函数：为 `sendReminder` 配置环境变量 `REMINDER_TEMPLATE_ID`（可选调试开关 `DEBUG_REMINDER=1`）
3. 部署云函数：
   - 方式 A（推荐）：在微信开发者工具中对 `cloudfunctions/` 下的云函数执行「上传并部署：云端安装依赖」（注意包含新增的 `getCourseDetail`）。
   - 方式 B（CLI 批量部署）：
     ```bash
     WX_CLI="/path/to/wechat-devtools-cli" ENV_ID="cloudbase-3g9lbidb4b420308" ./uploadCloudFunction.sh
     ```
4. 部署定时触发器：对 `cloudfunctions/sendReminder` 执行「上传触发器」（`config.json` 中配置为每 5 分钟执行一次 `0 */5 * * * *`）。

## 云数据库推荐索引

为保证课表、提醒与审批查询性能，建议在云开发控制台确认以下索引：
- `course_unfinished`：`{ "status": 1, "schedule.date": 1, "_id": 1 }`、`{ "scheduleId": 1 }`、`{ "parentId": 1 }`
- `course_schedule`：`{ "teacherId": 1, "status": 1, "schedule.date": 1 }`、`{ "parentId": 1 }`
- `course_applications`：`{ "teacherId": 1, "status": 1, "applyTime": -1 }`、`{ "studentId": 1, "applyTime": -1 }`
- `teacher_student_bindings`：`{ "teacherId": 1, "studentId": 1 }`、`{ "teacherId": 1, "status": 1 }`
