#!/usr/bin/env bash
#
# hermes-bubbles-skin 一键安装 / 卸载脚本
#
# 安装（main 最新版）：
#   curl -fsSL https://raw.githubusercontent.com/AproXin/hermes-bubbles-skin/main/install.sh | bash
# 安装指定版本：
#   curl -fsSL https://raw.githubusercontent.com/AproXin/hermes-bubbles-skin/main/install.sh | VERSION=v0.5.1 bash
# 卸载：
#   curl -fsSL https://raw.githubusercontent.com/AproXin/hermes-bubbles-skin/main/install.sh | bash -s -- --uninstall
#
# 说明：脚本只负责把文件放到位。装完后必须 Cmd+Q 完全退出 Hermes 再重开——
# 插件 JS 与皮肤 customCSS 只在 renderer 文档启动时读取一次，Cmd+R 拿不到新版本。

set -euo pipefail

REPO="AproXin/hermes-bubbles-skin"
REF="${VERSION:-main}"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${REF}"

SKIN_DIR="${HOME}/.hermes/skins"
PLUGIN_DIR="${HOME}/.hermes/desktop-plugins/hermes-bubbles-skin"

# 远端文件名|本地目标路径
FILES=(
  "bubbles.yaml|${SKIN_DIR}/bubbles.yaml"
  "plugin.js|${PLUGIN_DIR}/plugin.js"
  "plugin.yaml|${PLUGIN_DIR}/plugin.yaml"
)

die() {
  echo "错误：$*" >&2
  exit 1
}

print_usage() {
  echo "用法："
  echo "  bash install.sh                安装（ref 取 \$VERSION，默认 main）"
  echo "  bash install.sh --uninstall    卸载已安装的文件"
  echo "  VERSION=v0.5.1 bash install.sh 安装指定版本"
}

download_one() {
  local src="$1" dest="$2" tmp size
  tmp="$(mktemp)" || die "无法创建临时文件"
  echo "下载 ${src} ..."
  if ! curl -fsSL "${BASE_URL}/${src}" -o "${tmp}"; then
    rm -f "${tmp}"
    die "下载失败：${src}（ref=${REF} 是否存在？网络是否正常？）"
  fi
  size="$(wc -c < "${tmp}" | tr -d '[:space:]')"
  # 体积下限只防"拉错内容/被截断"：curl -f 已能拦掉 404 等 HTTP 错误。
  # 注意 plugin.yaml 本身只有约 300 字节，下限不能设太高。
  if [ "${size}" -lt 100 ]; then
    rm -f "${tmp}"
    die "下载的文件过小（${size} 字节），可能拉错了内容：${src}"
  fi
  mkdir -p "$(dirname "${dest}")"
  mv "${tmp}" "${dest}"
  echo "  -> ${dest}（${size} 字节）"
}

do_install() {
  echo "正在安装 hermes-bubbles-skin（ref=${REF}）..."
  local entry src dest
  for entry in "${FILES[@]}"; do
    src="${entry%%|*}"
    dest="${entry#*|}"
    download_one "${src}" "${dest}"
  done
  cat <<'EOF'

安装完成！还差最后一步：
  请按 Cmd+Q 完全退出 Hermes，然后重新打开（只按 Cmd+R 不会加载新版本）。

验证是否生效：
  重开后打开 DevTools 控制台，执行
    document.documentElement.dataset.bubblesBuild
  有返回值即表示已加载；控制台还应有一行 "[bubbles] styles installed …" 的日志。
EOF
}

do_uninstall() {
  echo "正在卸载 hermes-bubbles-skin ..."
  local entry dest
  for entry in "${FILES[@]}"; do
    dest="${entry#*|}"
    if [ -f "${dest}" ]; then
      rm -f "${dest}"
      echo "  已删除 ${dest}"
    else
      echo "  跳过（不存在）${dest}"
    fi
  done
  rmdir "${PLUGIN_DIR}" 2>/dev/null || true
  cat <<'EOF'

卸载完成。请按 Cmd+Q 完全退出 Hermes 再重开，恢复默认外观。
EOF
}

case "${1:-}" in
  --uninstall) do_uninstall ;;
  -h|--help) print_usage ;;
  "") do_install ;;
  *) die "未知参数：$1（用 --help 查看用法）" ;;
esac
