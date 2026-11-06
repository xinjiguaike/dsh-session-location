# dsh-session-location · 会话行位置标签

单列表（In one list）模式下，每个会话行标题下方多出一行：**所属工作区 · 当前 Git 分支**。这样不在分组视图里也能一眼看出这条会话属于哪个项目、哪条分支。

```
▢ 修复未登录页面鉴权漏洞                    1小时
  📁 hermes · ⎇ fix/auth-redirect
```

## 行为

- **只在「单列表」分组模式生效**。按工作区 / 按工作区树本来就有工作区分组标题，不改动。
- 行高只对带标签的行从 32px 变为 44px；没有标签的行保持原样。
- 工作区名：优先取该会话所属工作区的标题（重命名过的标题也正确），取不到时用工作目录的 basename；连 cwd 都没有时显示「未分组」。
- 分支：读会话工作目录下的 `.git/HEAD`（普通检出），或先读 `.git` 里的 `gitdir:` 指针再读 `<gitdir>/HEAD`（linked worktree / 子模块）。读取走宿主已有的 `remote.workspaceFiles.read`，**不新增任何宿主服务或路由**。结果按目录缓存 60 秒。
- 不是 git 目录、读取失败、或文件过大时，只显示工作区、不显示分支，不报错。
- 分支读不到时的降级、以及未知的宿主结构，都只影响这一行标签的显示，不会破坏行本身。
- **开关**：设置 → 通用 → 「在会话列表中显示工作区与分支」。偏好存在浏览器本地（`localStorage`），按浏览器生效，切换后列表立即更新，无需重启。
  - 为什么不在会话列表右上角那个「分组方式 / 排序方式 / 筛选会话」下拉里：那是宿主 `ui-workspace` 内部组件（本地 `items` 数组，没有插槽），插件无法往里插条目；`settings.general.item` 是宿主为这类「单个偏好」提供的官方位置。
- 图标：工作区用宿主产品图标集里的 `folder-close` 字形（和文件树行一致），分支沿用插件自己的 Git 分支字形。

## 实现要点（为什么这样做）

宿主没有「行内第二行」的官方插槽，`sidebar.workspaces` 只有一个 `single` 替换位（替换它等于重写整个浏览区）。因此本插件用官方两个会话行装饰 seat 承载标签：

| seat | 何时渲染 | 用途 |
| --- | --- | --- |
| `sidebar.session.row.leading` | 行主状态为 idle（显示状态点时不渲染） | 常规行：标签在 hover 时也保持可见（该 seat 不会被 hover 隐藏） |
| `sidebar.session.row.trailing` | 行主状态为运行 / 待审批 / 未读完成 | 由状态点顶掉 leading 的行，用 trailing 补上标签；这类行 hover 时标签随该 seat 一起隐藏 |

标签元素本身由插件样式表绝对定位到标题下一行。宿主 DOM 依赖故意收窄到三个稳定标记：

- 行的 `data-row-key="session:<id>"`（宿主用于拖拽与动画的稳定属性）
- 单列表容器的 CSS Module 类名后缀 `_flatList`（哈希前缀随构建变化，后缀不变）
- `:has(.dsh-sl-context)` 只在真挂了标签的行上抬行高

也就是说：宿主结构若变化，最坏结果是标签不显示、行高不变，而不是侧边栏错乱。反过来，若想在分组模式下也显示标签，把 `client.js` 的 `CSS` 里两处 `[class*="_flatList"] ` 前缀删掉即可（行内第二行会在所有模式出现）。

## 安装（分享给别人用）

要求 DSH `>= 0.2.2-rc.1 < 0.3.0-0`（`package.json` 的 `engines.dsh`；不满足时宿主会拒绝安装）。

**桌面端（DSH Desktop）**：插件页 → **添加插件** → 包里输入 `dsh-session-location`（或 GitHub Release 的 tarball 地址、仓库地址），安装后按提示重启/刷新。

**`dsh web` / 任意 profile**：

```sh
# 1) 从 npm 安装（推荐；国内镜像也会同步）
dsh plugin --profile <profile> add dsh-session-location

# 2) 或预构建 tarball（不执行任何构建脚本）
dsh plugin --profile <profile> add https://github.com/xinjiguaike/dsh-session-location/releases/latest/download/dsh-session-location.tgz

# 3) 或直接从 GitHub 源码安装
dsh plugin --profile <profile> add github:xinjiguaike/dsh-session-location
```

`<profile>` 换成实际 profile 名（`dsh web` 默认 `web`）。装完刷新页面；桌面端如未生效重启一次应用。

> 还没进 `awesome-dsh-plugin` 精选列表，所以 `dsh-market` 市场里暂时搜不到，上面三种方式都能直接用。

## 本地开发安装（本机 link）

已作为 profile bundle 安装到 `desktop` profile。组成：

- 包本身：`/Users/rudyx/Projects/other/dsh-session-ui-enhance`（`link:` 安装，改文件即时生效于磁盘）
- profile 记录：`~/.dsh/profiles/desktop/package.json` → `dependencies` 与 `dsh.profile.bundles`
- bundle patch：`cordis.patch.yml` 插入宿主行 `dsh-session-location`；`index.js` 是空实现的宿主半区（全部逻辑在浏览器）
- 浏览器半区：`client.js`，经 `dsh.client` 声明，由宿主按 `/plugins/<id>/client.js` 伺服
- 展示元数据：`locale/en.json`、`locale/zh.json` 的 `meta.title` / `meta.description`，图标 `icon.svg`

改完 `client.js` 后刷新页面（Cmd+R）即可看到新版本。卸载：在插件管理器里禁用/移除该 bundle，或 `dsh plugin --profile desktop remove @local/dsh-session-location`。

## 验证

```sh
node --check client.js          # 语法
node tests/render-harness.mjs   # 逻辑（等价 npm test）
```

`tests/render-harness.mjs` 用最小的 React / hook / ctx 桩驱动**真实的 `client.js`**，覆盖：两个 seat 的注册与 locale 选项、工作区标题解析、工作目录 basename 回退、无 cwd→未分组、linked worktree 的 `gitdir:` + HEAD 解析、`.git/HEAD` 缺失、读取抛错容错、trailing seat 仅在有状态点时渲染。

已确认项：

- 安装返回 `application: applied`，`Slots.listSubTree` 显示 `sidebar.session.row.leading` / `sidebar.session.row.trailing` 两个 occupant 均 `active`（说明浏览器半区已加载且 `apply` 成功、`slots` / `locale` / `remote.workspaceFiles` 注入均就绪）
- `remote.workspaceFiles.read(sessionId, path, { offset, limit }, signal)` 的参数与返回形状按宿主生成代码 `typert.remote-client.js` 核对过（返回含 `text`）
- 同 profile 已装的其它侧边栏相关插件（`dsh-better-sidebar`、`dsh-session-manager`、`dsh-multi-folder`、`@linxin666/dsh-client-ui-git-graph`）都没有占用这两个 seat，也没有替换 `sidebar.workspaces`，因此不冲突

未确认项：**视觉呈现**（44px 行高、11px 标签、主题 token 的明暗对比）没有做截图核对 —— 本会话没有浏览器控制通道，需要刷新页面后人工确认。

## 发布

见 [PUBLISHING.md](./PUBLISHING.md)：GitHub 仓库 → npm 包 → 给 `awesome-dsh-plugin` 提一个 YAML 的收录 PR（`dsh-market` 市场、站点与 jsDelivr 索引都由它派生），以及自建 format-1 索引这条不依赖他人审核的通道。

## 文件

| 文件 | 作用 |
| --- | --- |
| `package.json` | bundle 清单 + `dsh.client` 浏览器半区声明 |
| `cordis.patch.yml` | 插入宿主插件行 |
| `index.js` | 宿主半区（空实现） |
| `client.js` | 全部逻辑：seat 注册、标签组件、分支解析与缓存、样式表 |
| `locale/en.json`、`locale/zh.json` | 插件管理器展示用标题与描述 |
| `icon.svg` | 插件图标 |
| `tests/render-harness.mjs` | 离线逻辑校验 |
| `assets/icon-180.png` | 市场卡片图标（180×180 位图） |
| `contrib/xinjiguaike__dsh-session-location.yml` | 提交给 awesome-dsh-plugin 的收录条目 |
| `PUBLISHING.md` | 发布与市场收录指南 |
| `LICENSE` | MIT |
