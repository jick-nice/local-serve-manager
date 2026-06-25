# Changelog

All notable changes to Local Server Manager / 本地服务管理器 are documented in this file.

## 1.0.9 - 2026-06-25

### English

#### Fixed

- Fixed a linked frontend/backend port sync issue where computed local API base URLs could keep using the old backend port after the backend service port changed.
- Frontend config sync now rewrites localhost, `127.0.0.1`, `[::1]`, and `` `${protocol}//${hostname}:<port>/api/v1` `` style local API URLs to the bound backend port.

#### Tests

- Added regression coverage for syncing bound frontend API URLs when a backend service port changes.

### 简体中文

#### 修复

- 修复前端已绑定后端时，后端端口修改后，前端计算型本地 API 地址仍请求旧后端端口的问题。
- 前端配置同步现在会把 localhost、`127.0.0.1`、`[::1]` 以及 `` `${protocol}//${hostname}:<port>/api/v1` `` 这类本地 API 地址同步到绑定后端端口。

#### 测试

- 新增后端端口变化后，同步绑定前端 API 地址的回归测试。

## 1.0.8 - 2026-06-24

### English

#### Added

- Added per-service environment variables in the service editor. Values use one `KEY=value` entry per line and are applied to service starts, dependency install commands, and service command runs.
- Environment values support `%NAME%` and `${NAME}` expansion, so Windows users can set entries such as `PATH=D:\apache-maven-3.9.8\bin;%PATH%` without changing the global Spring Boot launch logic.

#### Fixed

- Spring Boot services that require local secrets such as `TOKEN_SECRET` can now be launched from Local Server Manager without putting secrets in the command text or logs.
- Service-specific environment variables no longer override the configured service port; the app-managed `PORT` / `SERVER_PORT` values remain authoritative.

#### Tests

- Added regression coverage for service environment merging, PATH expansion, port precedence, and environment-text filtering.

### 简体中文

#### 新增

- 服务编辑器新增服务级环境变量配置，每行一个 `KEY=value`，会应用到服务启动、依赖安装和该服务的命令运行。
- 环境变量支持 `%NAME%` 和 `${NAME}` 引用，Windows 用户可以配置 `PATH=D:\apache-maven-3.9.8\bin;%PATH%`，不需要改动所有 Spring Boot 启动逻辑。

#### 修复

- 需要 `TOKEN_SECRET` 等本地密钥的 Spring Boot 服务，现在可以通过服务级环境变量启动，不必把密钥写进启动命令或日志。
- 服务级环境变量不会覆盖软件配置的服务端口，`PORT` / `SERVER_PORT` 仍以界面配置为准。

#### 测试

- 新增服务环境变量合并、PATH 展开、端口优先级和环境变量搜索过滤的回归测试。

## 1.0.7 - 2026-06-24

### English

#### Fixed

- Fixed a serious config synchronization bug where running a service repeatedly could keep appending duplicate frontend and backend port settings.
- Vite `server.port` and `server.strictPort` entries are now normalized before writing, leaving only one managed pair.
- Spring Boot `application*.yml`, `application*.yaml`, and `application*.properties` files now deduplicate managed `server.port` entries before writing the configured port.

#### Tests

- Added regression coverage for repeated Vite config sync, repeated Spring Boot YAML sync, and repeated Spring Boot properties sync.

### 简体中文

#### 修复

- 修复严重配置同步问题：重复通过软件运行服务时，前端和后端配置文件会持续追加重复端口配置。
- Vite 的 `server.port` 和 `server.strictPort` 现在写入前会先归一化，只保留一组由软件管理的配置。
- Spring Boot 的 `application*.yml`、`application*.yaml`、`application*.properties` 现在会先去重托管的 `server.port`，再写入软件里配置的端口。

#### 测试

- 新增 Vite 重复同步、Spring Boot YAML 重复同步、Spring Boot properties 重复同步回归测试。

## 1.0.6 - 2026-06-23

### English

#### Changed

- Replaced the previous frontend API environment-variable approach with explicit project configuration synchronization.
- When a frontend service port changes, supported Vite config files now receive the configured dev server port.
- When a frontend service is linked to a backend service, supported Vite proxy targets and local API base URLs are rewritten to the linked backend port.
- When a Spring Boot service port changes, `application.yml`, `application.yaml`, or `application.properties` under `src/main/resources` are updated to the configured port.

#### Supported Patterns

- Vite config files: `vite.config.ts`, `vite.config.js`, `vite.config.mjs`, `vite.config.cjs`.
- Frontend API files: root `app.js`, `src/services/http.*`, `src/utils/request.*`, `src/api/request.*`.
- Spring Boot config files: `application*.yml`, `application*.yaml`, `application*.properties`.

#### Tests

- Added regression coverage for Vite dev server ports, Vite proxy backend targets, static frontend API URLs, and Spring Boot config file port synchronization.

### 简体中文

#### 变更

- 废弃前端 API 环境变量注入方案，改为显式同步项目配置文件。
- 前端服务端口变化时，会同步更新支持的 Vite 配置文件中的开发服务器端口。
- 前端服务关联后端后，会同步更新支持的 Vite proxy target 和本地 API base URL 到关联后端端口。
- Spring Boot 服务端口变化时，会同步更新 `src/main/resources` 下的 `application.yml`、`application.yaml` 或 `application.properties`。

#### 支持模式

- Vite 配置文件：`vite.config.ts`、`vite.config.js`、`vite.config.mjs`、`vite.config.cjs`。
- 前端 API 文件：根目录 `app.js`、`src/services/http.*`、`src/utils/request.*`、`src/api/request.*`。
- Spring Boot 配置文件：`application*.yml`、`application*.yaml`、`application*.properties`。

#### 测试

- 新增 Vite 前端端口、Vite proxy 后端端口、静态前端 API 地址、Spring Boot 配置文件端口同步回归测试。

## 1.0.5 - 2026-06-23

### English

#### Fixed

- Spring Boot services now receive the configured app port through startup arguments, so `application.yml` no longer silently wins over the port set in Local Server Manager.
- FastAPI and Flask commands now also rewrite `--port` to the configured service port when possible.
- Service and command logs now auto-scroll to the latest output when opened or updated.
- Windows process output now falls back to GBK decoding when UTF-8 decoding would produce garbled Chinese text.

#### Added

- Frontend services can be linked to a backend service from the service editor.
- When a frontend service has a linked backend, the app injects common API URL environment variables such as `VITE_API_BASE_URL`, `REACT_APP_API_BASE_URL`, and `NEXT_PUBLIC_API_BASE_URL`.

#### Tests

- Added regression coverage for Spring Boot port injection, backend command port rewriting, frontend API URL environment variables, and Windows GBK log decoding.

### 简体中文

#### 修复

- Spring Boot 服务启动时会通过启动参数使用软件里配置的端口，避免 `application.yml` 中的端口继续覆盖软件设置。
- FastAPI 和 Flask 命令会尽量把 `--port` 改成服务配置端口。
- 打开或追加服务/命令日志时，会自动滚动到最新输出。
- Windows 进程输出在 UTF-8 解码乱码时会回退 GBK，修复日志中文乱码问题。

#### 新增

- 前端服务编辑页新增 **关联后端服务**。
- 前端服务关联后端后，启动时会注入常见 API 地址环境变量，例如 `VITE_API_BASE_URL`、`REACT_APP_API_BASE_URL`、`NEXT_PUBLIC_API_BASE_URL`。

#### 测试

- 新增 Spring Boot 端口注入、后端命令端口改写、前端 API 环境变量、Windows GBK 日志解码回归测试。

## 1.0.4 - 2026-06-23

### English

#### Fixed

- Fixed an issue where deleting the last service in a project left an empty project card in the service list.
- Empty projects are now hidden from the main list after their services are removed.

#### Tests

- Added a renderer filtering regression test for the empty-project deletion case.

### 简体中文

#### 修复

- 修复删除项目下最后一个服务后，列表仍残留空项目卡片的问题。
- 服务被全部删除后，空项目不会再出现在主列表中。

#### 测试

- 新增渲染层筛选回归测试，覆盖删除后空项目不应展示的场景。

## 1.0.3 - 2026-06-22

### English

#### Added

- Added a global **Stop by Port** control in the main interface.
- Users can now enter a TCP port and stop the listening process even if the service was not started by Local Server Manager.
- The app reports whether the port was stopped successfully, no listening process was found, or the stop operation failed.

#### Changed

- Updated the README feature list and installation artifact name for the 1.0.3 release.
- Updated package metadata and lockfile version to 1.0.3.

### 简体中文

#### 新增

- 主界面新增全局 **按端口停止** 操作区。
- 现在可以输入 TCP 端口号，直接停止监听该端口的进程，即使该服务不是通过本地服务管理器启动的。
- 停止端口后会显示执行结果，包括停止成功、未找到监听服务、停止失败等状态。

#### 变更

- README 的功能说明和安装包文件名已同步到 1.0.3。
- package 元数据和 lockfile 版本已更新到 1.0.3。

## 1.0.2 - 2026-06-22

### English

- Localized the default app name to **本地服务管理器**.
- Fixed application and installer icon configuration for Windows builds.
- Improved NSIS installer options, including custom installation directory support.

### 简体中文

- 默认应用名称本地化为 **本地服务管理器**。
- 修复 Windows 应用和安装包图标配置。
- 优化 NSIS 安装包选项，支持自定义安装位置。
