# 发布与上架指南

本文件说明这个插件如何从本地目录走到公开渠道、以及进入 DSH 插件市场的完整流程。**上架入口只有一个是「提 PR」**：`awesome-dsh-plugin` 列表；`dsh-market` 市场、awesome-dsh-plugin.com / dshmarket.com 站点、以及 jsDelivr 上的 format-1 索引都由它派生。

## 渠道地图

| 渠道 | 作用 | 入口 | 是否必须 |
| --- | --- | --- | --- |
| GitHub 仓库 | 收录条目的链接目标，也是 `dsh plugin add github:…` 的源码来源 | 新建公开仓库 | 必须（收录要求） |
| npm 包 | 预构建安装（免 `allowBuilds` 授权）、市场展示下载量 | `npm publish` | 推荐（不发布也能收录） |
| GitHub Release tarball | 仓库无法从源码安装时的兜底；市场优先展示它 | Release 附件 + 条目里的 `tarball:` | 可选 |
| awesome-dsh-plugin 收录 | **唯一的「上架」动作**，市场/站点/索引全部由它生成 | 提 PR 加 1 个 YAML | 必须（想进市场时） |
| 宿主「发现」索引源 | dsh 0.2.1+ 可添加自定义 format-1 索引，不上榜也能被搜索到 | 插件 → 发现 → 索引源 | 可选（自助通道） |
| 宿主官方内置目录 | 随 DSH 发行版附带的官方 bundle | 无公开投稿入口 | — |

## 零、账号与凭证准备（一次性）

### GitHub SSH key

本机默认公钥：`~/.ssh/id_ed25519.pub`（ED25519，注释 `xinjiguaike@163.com`，指纹 `SHA256:SwqV66PcAbqfCPk8q1WEGbK/dEzQsVMZ731xRvC7uVU`）。它**尚未加到 GitHub 账号**上，所以 `ssh -T git@github.com` 会返回 `Permission denied (publickey)`。

1. 复制公钥：`pbcopy < ~/.ssh/id_ed25519.pub`
2. GitHub → 头像 → **Settings → SSH and GPG keys → New SSH key**：Title 随意（如 `MacBook Pro`），Key type 选 **Authentication Key**，粘贴，Add SSH key。
3. 验证：`ssh -T git@github.com`，应看到 `Hi xinjiguaike! You've successfully authenticated...`。
4. 可选（有 passphrase 时免重复输入）：`ssh-add --apple-use-keychain ~/.ssh/id_ed25519`，并在 `~/.ssh/config` 写：

   ```
   Host github.com
     AddKeysToAgent yes
     UseKeychain yes
     IdentityFile ~/.ssh/id_ed25519
   ```

若 GitHub 提示 *Key is already in use*，说明这把钥匙已绑在另一个账号上：去那边删掉，或给 GitHub 单独生成一把：

```sh
ssh-keygen -t ed25519 -C "xinjiguaike@github" -f ~/.ssh/id_ed25519_github
ssh-add --apple-use-keychain ~/.ssh/id_ed25519_github
# ~/.ssh/config 的 IdentityFile 指到新钥匙，再把新 .pub 加到 GitHub
```

不想用 SSH 也可以走 HTTPS + Personal Access Token（fine-grained、只给目标仓库 Contents 读写），或 GitHub Desktop 登录。

### npm 账号（发布 npm 包才需要）

发布 npm 包**必须**有 npm 账号（免费，无付费计划要求）：

1. 注册：<https://www.npmjs.com/signup>（用户名会成为你的 scoped 前缀 `@<用户名>/…`，发布前想好）。
2. **验证邮箱**：未验证邮箱时 npm 拒绝发布。
3. 建议开启 2FA：npmjs.com → Settings → **Two-factor authentication** → `auth-and-writes`（保存恢复码）。开启后命令行发布会要求 OTP。
4. 命令行登录（本机默认 registry 是 npmmirror 只读镜像，必须显式指定官方）：

   ```sh
   export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
   npm login --registry=https://registry.npmjs.org/
   npm whoami --registry=https://registry.npmjs.org/
   ```

   登录令牌写入 `~/.npmrc` 的 `//registry.npmjs.org/:_authToken=…`，是密钥，别外传。

不打算发 npm 也能上架：awesome 列表支持只用 GitHub 条目（可加 Release tarball），只是没有下载量数字、安装时要走源码构建。

## 一、发布前的一次性准备

### 1. GitHub 仓库

```sh
cd /Users/rudyx/Projects/other/dsh-session-ui-enhance
git init -b main
git add -A
git commit -m "feat: workspace and Git branch labels under flat-list session rows"
# 在 GitHub 建一个公开仓库 dsh-session-location，然后：
git remote add origin https://github.com/xinjiguaike/dsh-session-location.git
git push -u origin main
```

然后在仓库 **Settings → Topics** 加 `dsh-plugin`（收录要求）。仓库必须**创建满 1 天**才能过收录 CI，所以这一步越早越好。

### 2. 改成可发布的包名与清单字段（已完成）

已把 `@local/dsh-session-location` 改为 `dsh-session-location`，删掉 `private`，补上 `repository` / `homepage`。当时的改动是：

```jsonc
{
  "name": "dsh-session-location",            // ← 改；npm 上目前未占用
  // "private": true,                        // ← 删掉这一行，否则 npm 拒绝发布
  "repository": {                             // ← 加；必须指回上架的那个仓库，否则 npm 包与条目不关联
    "type": "git",
    "url": "git+https://github.com/xinjiguaike/dsh-session-location.git"
  },
  "homepage": "https://github.com/xinjiguaike/dsh-session-location#readme"
}
```

清单里已经有：`dsh.bundle`（收录硬性要求）、`dsh.client`（浏览器半区）、`engines.dsh: ">=0.2.2-rc.1 <0.3.0-0"`（市场兼容性筛选读它）、`license: MIT`、`files` 白名单、`publishConfig.access: public`。

> 改名会同时影响本地开发预览：`@local/dsh-session-location` 已从 profile 移除，本目录已用新名字 `dsh-session-location` 重新 link 安装（`link:/Users/rudyx/Projects/other/dsh-session-ui-enhance`），bundle patch 也已指向新名字。浏览器半区的模块 id 随包名改了，**页面必须刷新一次**（HMR 在改名时会出现 `duplicate factory registration`，是旧模块表未失效导致的，刷新即恢复）。

### 3. 市场展示物料（可选但值得）

- **图标**：收录条目的 `icon:` 只接受 **GitHub 托管的位图**（png/jpg/jpeg/webp，约 96px 显示），SVG 会被拒。仓库里的 `icon.svg` 不能直接用，已按它生成 `assets/icon-180.png`，条目里也已指向 `raw.githubusercontent.com/.../assets/icon-180.png`。
- **截图**：在 `package.json` 同级放 `screenshots.json`，列 1–8 张仓库内图片路径，市场详情页会按这个顺序展示：

  ```json
  ["assets/screenshot-1.png", "assets/screenshot-2.png"]
  ```

  不声明的话市场会从 README 里自动抽图。截图注意别带上真实会话标题等敏感信息。
- 中文 `locale/zh.json` 的 `meta.title` / `meta.description` 已就位，插件管理器和市场卡片会用它。

## 二、发布 npm 包

这台机器上默认 registry 是 `https://registry.npmmirror.com/`（只读镜像），**直接 `npm publish` 会失败**，必须显式指定官方 registry。你当前的 npm 也还没登录：

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"

# 1) 登录官方 registry（只需一次；需要 npm 账号，开了 2FA 会要求 OTP）
npm login --registry=https://registry.npmjs.org/

# 2) 先看将要发布的内容（应只含 client.js / index.js / cordis.patch.yml / locale / icon / README / LICENSE / package.json）
npm pack --dry-run

# 3) 发布
npm publish --registry=https://registry.npmjs.org/

# 4) 核对
npm view dsh-session-location version --registry=https://registry.npmjs.org/
```

`package.json` 里的 `scripts.test` 会在发布前手动跑一次：`npm test`（即 `node tests/render-harness.mjs`）。

装包验证（建议用另一个 profile，别污染日用 profile）：

```sh
dsh plugin --profile <test-profile> add dsh-session-location
```

## 三、可选：GitHub Release tarball

不发 npm、或想让市场优先给「免构建安装」时：

```sh
npm pack                                     # 产出 dsh-session-location-0.1.0.tgz
# 把它作为 Release 附件上传，建议同时传一份不带版本号的文件名：
#   dsh-session-location.tgz   → 条目用 latest/download/dsh-session-location.tgz，永不 404
#   dsh-session-location-0.1.0.tgz → 条目必须钉住 tag：releases/download/v0.1.0/dsh-session-location-0.1.0.tgz
```

⚠️ `latest/download/` 只解析 `latest` 标签，文件名按字面取：附件名带版本号时，你下次发版链接就 404。

## 四、上架：给 awesome-dsh-plugin 提 PR

仓库：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>（`dsh-market` 市场只允许安装这个列表里的来源）

**只加一个文件**：`data/plugins/xinjiguaike__dsh-session-location.yml`（README 和其他条目的文件都别动，README 由脚本生成）：

```yaml
url: https://github.com/xinjiguaike/dsh-session-location
name: xinjiguaike/dsh-session-location
category: ui
description:
  en: Adds the owning workspace and current Git branch under each session row in the flat session list.
  zh: 在单列表的每个会话行标题下方显示所属工作区与当前 Git 分支。
# 已生成并声明：GitHub 托管的位图图标（约 96px 显示，SVG 会被拒）
icon: https://raw.githubusercontent.com/xinjiguaike/dsh-session-location/main/assets/icon-180.png
# 可选：GitHub Release 上的 .tgz，市场优先展示预构建安装
# tarball: https://github.com/xinjiguaike/dsh-session-location/releases/latest/download/dsh-session-location.tgz
```

分类：`ui`（UI 增强）最贴切；`session`（会话与消息）也说得通。分类选不准不会被打回，维护者会直接改。

**收录规则里容易踩的点**（CI + 人工评审都看）：

- `package.json` 必须有 `dsh.bundle`；只声明 `dsh.client` 会被 CI 拒（本插件已满足）。
- 仓库必须公开、有真实可用代码、创建满 1 天、带 `dsh-plugin` topic、处于维护状态。
- 描述必须名副其实，维护者会对着代码核对；不要写营销词。
- 描述里含 `: `（冒号+空格）时 YAML 必须加引号；中文全角冒号没问题。
- 一个 PR 最多 3 条；更新自己的条目只改自己的 YAML。
- npm 包的 `repository` 字段必须指回被收录的仓库，否则两边不关联（没有下载量数字）。
- 有官方 `@deepseek-ai/*` 依赖时用 `peerDependencies` 且预发布范围要写显式 `||` 分支；本插件没有这类依赖。

合并后链路自动走完（无需你再操作）：`data/plugins/*.yml` → 生成两份 README 与站点（awesome-dsh-plugin.com）→ 构建 format-1 索引并发布到 npm 包 `dsh-plugin-catalog` → jsDelivr 上的 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` → `dsh-market` 市场与宿主「发现」页搜索到。通常一天内生效。评审可能需要 `held: author` 来回一轮，按 PR 评论改同一个分支即可。

## 五、不上榜的自助通道

1. **自建 format-1 索引**（不需要任何人批准，dsh 0.2.1+ 生效）：把下面内容放到 GitHub Pages / jsDelivr 可达的地址，然后在 **插件 → 发现 → 索引源** 里添加它。这份最小示例已用宿主自带的 `dsh-plugin-market-index` 校验器验证通过：

   ```json
   {
     "format": 1,
     "title": { "en": "Session location", "zh": "会话位置" },
     "description": { "en": "My own plugin index.", "zh": "自建插件索引。" },
     "metadata": {
       "categories": { "ui": { "title": { "en": "UI Enhancements", "zh": "UI 增强" } } },
       "labels": {},
       "sortKeys": {}
     },
     "plugins": [
       {
         "name": "dsh-session-location",
         "title": "xinjiguaike/dsh-session-location",
         "description": {
           "en": "Adds the owning workspace and current Git branch under each session row in the flat session list.",
           "zh": "在单列表的每个会话行下方显示所属工作区与当前 Git 分支。"
         },
         "homepage": "https://github.com/xinjiguaike/dsh-session-location",
         "repository": { "url": "https://github.com/xinjiguaike/dsh-session-location" },
         "metadata": { "category": "ui", "keywords": [], "labels": [], "sortKeys": {} },
         "versions": [
           {
             "version": "0.1.0",
             "publishTimestamp": 1793890000,
             "source": { "type": "npm" },
             "engines": { "dsh": ">=0.2.2-rc.1 <0.3.0-0" }
           }
         ]
       }
     ]
   }
   ```

   注意：`dsh-market` 市场只认 awesome 列表里的来源，自建索引只出现在宿主自带的「发现」页和 `plugin_market` 智能体工具里。

2. **直接分享安装指令 / 压缩包**：`dsh plugin add dsh-session-location`、`dsh plugin add https://github.com/xinjiguaike/dsh-session-location/releases/download/v0.1.0/dsh-session-location-0.1.0.tgz`、或 `dsh plugin add github:xinjiguaike/dsh-session-location`。

## 六、日常发版

1. 改代码 → `npm test`（离线逻辑校验）→ 刷新页面肉眼确认 UI。
2. 更新 `package.json` 的 `version`，在 CHANGELOG / Release notes 写清变化（市场的「更新内容」链接会读它）。
3. `npm publish --registry=https://registry.npmjs.org/`；`git tag v0.x.y && git push --tags`，把 `npm pack` 产物挂到 Release。
4. 已装用户会通过市场或插件管理器看到可更新版本；预览字段（README、截图）即时生效。

## 七、本仓库当前状态

已完成：

- `dsh.bundle` / `dsh.client` 清单、bundle patch、宿主空实现、浏览器半区
- `meta.title` / `meta.description`（中英）、`icon.svg`
- MIT `LICENSE`、`.gitignore`、`engines.dsh`、`keywords`、`publishConfig`
- `tests/render-harness.mjs` 离线逻辑校验；`npm pack` 产物已验证只含预期文件（在临时副本上执行，未污染本目录）

已完成（本轮）：

- [x] `package.json` 改名 `dsh-session-location`、删 `private`、加 `repository` / `homepage`（`xinjiguaike/dsh-session-location`）
- [x] 180×180 位图图标 `assets/icon-180.png`（由 `icon.svg` 生成）
- [x] 收录条目已写好在 `contrib/xinjiguaike__dsh-session-location.yml`
- [x] 本地 git 仓库已初始化并提交
- [x] GitHub 公开仓库已创建并推送：<https://github.com/xinjiguaike/dsh-session-location>（4 个提交，topic 已设为 `dsh-plugin` / `deepseek-harness` / `dsh` / `dsh-client-plugin` 等）

还需要你做（都要你的账号）：

- [ ] 等仓库满 1 天（创建时间 2026-11-06 15:36 +08:00，即 2026-11-07 15:36 之后）再提收录 PR
- [ ] npm 注册账号、登录并发布到 `registry.npmjs.org`
- [ ] 拍 1–2 张截图并写 `screenshots.json`（可选）
- [ ] 提收录 PR：把 `contrib/xinjiguaike__dsh-session-location.yml` 放到 awesome 仓库的 `data/plugins/` 下

## 八、下一步命令

仓库与推送已完成（SSH key 已加授权，remote 为 `git@github.com:xinjiguaike/dsh-session-location.git`）。剩下：

```sh
# 1) 发 npm（默认 registry 是 npmmirror 镜像，必须显式指定官方 registry）
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
npm login --registry=https://registry.npmjs.org/
npm publish --registry=https://registry.npmjs.org/

# 2) 提收录 PR（仓库满 1 天后）：先 fork github.com/awesome-dsh-plugin/awesome-dsh-plugin 再提交
cd /path/to/awesome-dsh-plugin
git checkout -b add-xinjiguaike-dsh-session-location
cp /Users/rudyx/Projects/other/dsh-session-ui-enhance/contrib/xinjiguaike__dsh-session-location.yml \
   data/plugins/xinjiguaike__dsh-session-location.yml
git add data/plugins/xinjiguaike__dsh-session-location.yml
git commit -m "add xinjiguaike/dsh-session-location"
git push -u origin add-xinjiguaike-dsh-session-location
```
