# glic-kit

Chrome Gemini AI 一键解锁工具 — 跨平台、多版本、TUI 交互。

## 功能

- ✅ 支持 macOS / Windows / Linux 三大操作系统
- ✅ 支持 Chrome 正式版、Beta、Dev、Canary 全渠道
- ✅ 一键解锁 Gemini in Chrome (Glic) 功能
- ✅ 默认 TUI 交互模式，可视化选择修复
- ✅ 支持纯 CLI 参数，适合脚本/自动化
- ✅ 自动备份，支持还原
- ✅ 原子写入，修改前验证

## 快速开始

```bash
# 一键解锁（自动检测并修复所有已安装的 Chrome）
npx glic-kit

# 仅检查状态（不修改）
npx glic-kit check

# 修复所有渠道
npx glic-kit fix --all

# 只修复 stable 版
npx glic-kit fix --channel stable

# 保留 Chrome 语言设置
npx glic-kit fix --all --keep-language

# 还原备份
npx glic-kit restore
```

## 原理

Chrome 通过 `Local State` 文件中的以下字段控制 Gemini in Chrome 功能的可用性：

| 字段 | 作用 | 修改后 |
|------|------|--------|
| `variations_country` | 地区标识 | `"cn"` → `"us"` |
| `variations_permanent_consistency_country` | 永久地区锁定 | `["版本号", "cn"]` → `["版本号", "us"]` |
| `is_glic_eligible` | 功能资格开关 | `false` → `true` |

此外还会注入 Glic 相关的 Labs 实验 flags，并将 Chrome 语言设置为 `en-US`。

## 注意事项

- ⚠️ 修改前必须关闭 Chrome（工具会自动处理）
- ⚠️ 仅解决客户端配置问题，用户仍需通过代理/VPN 连接到支持地区的 IP
- ⚠️ Chrome 启动后可能重新服务端同步数据，如遇问题请重新运行工具
- ⚠️ 企业管理员锁定的 Chrome 不适用此方案

## CLI 参数

```
glic-kit [command] [options]

Commands:
  (default)          进入 TUI 交互模式
  check              仅检查状态，不修改
  fix                执行修复
  restore            还原备份

Options:
  --channel <name>   指定渠道 (stable|beta|dev|canary|all)
  --keep-language    保留 Chrome 语言设置
  --skip-experiments 跳过 labs experiments 注入
  --no-launch        修复后不自动启动 Chrome
  --dry-run          仅模拟，不实际修改
  --json             以 JSON 格式输出
  -v, --verbose      详细输出
  -h, --help         显示帮助
```

## License

MIT
