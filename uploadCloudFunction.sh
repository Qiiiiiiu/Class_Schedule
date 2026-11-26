#!/usr/bin/env bash
set -euo pipefail

# 批量部署 cloudfunctions/ 下全部云函数
# 用法：
#   ENV_ID="cloudbase-3g9lbidb4b420308" WX_CLI="/path/to/cli" ./uploadCloudFunction.sh
# 或传入单个函数名只部署指定函数：
#   ENV_ID="cloudbase-3g9lbidb4b420308" WX_CLI="/path/to/cli" ./uploadCloudFunction.sh sendReminder

PROJECT_PATH="${PROJECT_PATH:-$(cd "$(dirname "$0")" && pwd)}"
ENV_ID="${ENV_ID:-cloudbase-3g9lbidb4b420308}"
WX_CLI="${WX_CLI:-${installPath:-cli}}"
TARGET_FN="${1:-}"

if ! command -v "${WX_CLI}" >/dev/null 2>&1 && [ ! -x "${WX_CLI}" ]; then
  echo "错误：未找到微信开发者工具 CLI（${WX_CLI}）。请通过 WX_CLI 环境变量指定路径，或直接使用微信开发者工具右键「上传并部署：云端安装依赖」。" >&2
  exit 1
fi

deploy_one() {
  local fn_name="$1"
  echo "==> 部署云函数: ${fn_name} (env=${ENV_ID})"
  "${WX_CLI}" cloud functions deploy \
    --e "${ENV_ID}" \
    --n "${fn_name}" \
    --r \
    --project "${PROJECT_PATH}"
}

if [ -n "${TARGET_FN}" ]; then
  if [ ! -d "${PROJECT_PATH}/cloudfunctions/${TARGET_FN}" ]; then
    echo "错误：云函数目录不存在: cloudfunctions/${TARGET_FN}" >&2
    exit 1
  fi
  deploy_one "${TARGET_FN}"
  exit 0
fi

count=0
for dir in "${PROJECT_PATH}"/cloudfunctions/*/; do
  [ -d "${dir}" ] || continue
  fn_name="$(basename "${dir}")"
  if [ ! -f "${dir}/index.js" ]; then
    continue
  fi
  deploy_one "${fn_name}"
  count=$((count + 1))
done

echo "全部完成，共部署 ${count} 个云函数。"
echo "提示：sendReminder 的定时触发器需在微信开发者工具右键 sendReminder -> 「上传触发器」或在云开发控制台确认生效。"
