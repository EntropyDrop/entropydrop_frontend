# EntropyDrop Space 前端审计与整改记录

日期：2026-09-02  
范围：`entropydrop_frontend/apps/space` 的玩法入口、HTTP/WebSocket API 边界、浏览器安全、加载与运行性能、测试和可维护性。后端实现仅用于核对契约，本轮未修改后端。

## 结论

Space 已经具备完整而有辨识度的核心闭环：体素建造 → 选区实体化 → 组件编程 → 物理运行 → 背包/市场复用。体素与微体素、可编程组件树、固定步长物理、QuickJS 隔离和持久化 outbox 都有较强的工程基础；609 项原有测试也说明关键规则已经大量固化。

本轮发现的主要问题不是“功能不可用”，而是网络信任边界和复杂度增长速度快于产品边界：浏览器曾默认持久化第三方模型 API Key；市场资源、皮肤和实时消息缺少统一的响应体积/完整性约束；Bootstrap JSON 只做 TypeScript 强制转换；首屏入口单块超过 1 MiB；首次玩家需要一次理解六种工具和多组快捷键；几个核心类已经达到 1,500–6,000 行。

本轮已完成 P0/P1 中能在 Space 前端独立落地且不改变服务端协议的整改。完整检查命令为：

```bash
npm run check:space
npm run audit:deps --workspace @entropydrop/space
```

## 已完成整改

| 领域 | 原风险 | 整改 | 验收标准 |
| --- | --- | --- | --- |
| 玩法入口 | 首次玩家看见六种工具，但没有一条直达核心乐趣的任务线 | 增加可关闭、可重新打开的 “First Mission”，引导完成第一个可编程实体 | 新玩家无需阅读外部文档即可走完放置、选择、实体化、生成行为、运行五步 |
| Agent 凭据 | API Key 默认明文写入 `localStorage`，关闭标签页后仍长期存在 | 默认仅放入 `sessionStorage`；只有勾选 “Remember this key” 才持久化；旧版明文配置自动迁移到当前会话 | 默认保存结果的持久配置不包含 `apiKey`；显式 opt-in 才包含 |
| Agent 成本/兼容性 | 默认上下文 256K、输出 128K 与默认模型能力和脚本体积上限不匹配 | 默认恢复为 32K 上下文、8K 输出，仍允许用户显式提高 | 默认请求可被常见兼容端点接受，避免无意的大额输出预算 |
| Agent 响应 | 模型目录和生成响应可无限增长 | 模型目录最多处理 1,000 项，单 ID 最多 256 字符；JSON/SSE 结果限制为 2 MiB | 超限响应失败关闭，不再持续积累字符串/对象 |
| Bootstrap API | `body as SpaceBootstrapPayload` 不提供运行时保障 | 在构建游戏前校验协议版本、人数、世界、玩家、皮肤和恢复坐标的完整性 | 版本漂移、缺字段和不完整恢复点被拒绝 |
| 市场 CDN | 任意协议 URL、无下载上限、未核对后端摘要 | 仅允许 HTTPS（本机开发可 HTTP），省略凭据/Referer，限制 8 MiB，并核对 SHA-256 | URL、体积或摘要任一不符即拒绝导入与预览 |
| 玩家皮肤 | 当前玩家皮肤下载后才判断格式，可能先分配超大响应 | 流式读取上限 256 KiB，之后继续验证 PNG 签名、解码和 64×64 尺寸 | 超限、伪 PNG、错误尺寸均无法进入渲染器 |
| 实时通道 | Join Ticket 可被配置发送到其他主机；MessagePack 消息无客户端上限 | WebSocket 必须与认证 API 同主机，HTTPS 页面必须 WSS；单消息限制 1 MiB；玩家快照限制 32 条并过滤非有限坐标 | 跨主机、降级协议、超大消息和 NaN 坐标被拒绝 |
| 生产调试面 | `window.spaceSession` / `window.game` 让生产页面脚本更容易遍历认证对象 | 删除 session 全局暴露；`window.game` 仅在 Vite DEV 构建存在 | 生产入口不再导出认证会话/引擎对象 |
| 首屏性能 | 主入口块约 1,103 kB（gzip 317 kB），且背包、3D 模型导入、编辑器、AI Builder 首屏即解析 | 模态界面和 AI 执行路径动态导入；按 React、脚本运行时、仿真、世界渲染、协议拆分稳定缓存块 | 主入口块约 286 kB（gzip 78 kB）；无应用块超过 650 kB，AI/大型模态在首次打开前不执行 |
| 可维护性 | 网络限制和 Agent 配置散落在功能文件 | 新增统一 `NetworkSafety` 与 `AgentConfig` 边界模块；Agent 调用从 UI store 动态加载 | 协议、体积、摘要和存储策略有单一实现与单元测试 |

## 玩法设计审计

### 做得好的部分

- 核心创意清楚：同一种可着色材料通过标准/微体素、组件树和脚本产生足够大的表达空间。
- “先预览、再确认”的 AI Builder 流程，以及生成代码必须手动 Apply，能把 AI 不确定性放在可撤销边界内。
- Selector、Hammer、Wrench 已经覆盖“创造—复用—运行—调试”的工具链，且批量操作有进度、取消和回滚反馈。
- 离线模式、在线排队与本地背包解耦，降低首次进入和服务器容量对创作的阻断。

### 仍需产品决策的 P1/P2 项

1. 新手任务目前只解决“如何做出第一个实体”，尚未形成长期目标。建议下一阶段加入 3 个渐进挑战：悬浮平台、可驾驶载具、自动跟随机器人；奖励使用背包模板或外观，不引入数值付费优势。
2. 在线世界当前是位置中继与 REST 地形同步，客户端仍拥有较多模拟权。竞技、经济或稀缺资源玩法上线前，必须完成文档中的服务端权威模拟，否则只能定位为协作沙盒。
3. 工具快捷键的信息密度较高，移动端/无键盘设备没有等价输入契约。需要先明确“桌面专属”还是补充触屏操作层。
4. 市场中的脚本资源虽在 QuickJS 中运行，但用户缺少权限/行为摘要。建议下载卡片显示脚本数、世界写入能力、选择操作能力，并在首次运行外来脚本前二次确认。

## API 设计审计

现有 API 的优点是版本前缀明确、地形批次有幂等 ID、分页 cursor 防重复、位置与地形职责分开、Join Ticket 为短期凭据、市场内容走不可变 CDN。客户端 outbox 也正确区分了“本地已应用”和“服务端已确认”。

后续建议：

- 从手写 interface 升级为 OpenAPI/Protobuf 生成的 HTTP DTO，并在生成层提供运行时 decoder，避免前后端字段漂移。
- 所有 HTTP 端点统一错误信封 `{code, message, retryable, request_id}`；当前客户端仍需兼容字符串 detail、对象 detail 和纯 HTTP 状态。
- Heartbeat 同时承担降级玩家状态和地形通知，建议在权威实时服务完成后只保留健康/恢复用途，避免双通道时序长期复杂化。
- 给 terrain page、heartbeat 和 market list 明确声明最大编码字节数与最大数组项数，使客户端限制成为正式契约，而不只是防御值。

## 性能审计

- 固定 20 Hz 实体时钟内含 3 个 60 Hz 物理子步，渲染插值不污染求解状态，这一设计正确。
- 远景 LOD 有构建时缓存，地形 AOI 有 tile、hysteresis、debounce 和并发合并，世界编辑按帧切片并使用 durable outbox，均属于有效优化。
- 本轮拆包改善的是解析阻塞、并行加载和长期缓存命中；Three.js 仍约 600 kB minified，首次在线进入的总传输不会等比例缩小。
- 字体约 977 kB、远景缓存约 1.08 MB、QuickJS WASM 约 503 kB。它们已有缓存/延迟初始化基础，但下一阶段应采集真实设备的 LCP、首个可交互帧、P95 frame time、JS heap 与 world-edit backlog，而不是继续只按 bundle 大小优化。
- Minimap、远端角色和实体碰撞已有节流/LOD/宽相位；下一步性能风险更可能来自大量脚本实体、材质/几何生命周期和长时间会话内存，而不是单个普通场景帧。

## 安全审计

现有 QuickJS worker 已有全局隔离、时间/内存/组件/命令预算，外来库存也验证字节、体素、层级、脚本与边界，这部分安全基础较好。本轮补齐了网络输入边界，但仍有两项不能只在 Space 子应用内彻底解决：

1. 主站访问令牌仍继承 `localStorage` 登录模式。Space 已使用 HttpOnly refresh cookie 刷新短期 token，但要消除 XSS 读取 access token 的风险，需要主站与后端一起迁移为纯 HttpOnly session/BFF。
2. 为支持用户自定义 OpenAI-compatible endpoint，CSP 的 `connect-src` 仍允许广泛的 `http/https/ws/wss`。更严格的方案是服务端 Agent 代理或用户维护的 origin allowlist；这会改变隐私、成本和部署模型，需要产品选择。

## 可维护性审计

当前最大结构风险为：`PlayerController` 约 6,000 行、`Contraption` 约 4,800 行、`ContraptionManager` 约 2,100 行、`SpaceUiStore` 约 1,500 行、`InventoryModal` 约 1,400 行；非生成源码仍约有 500 处 `any`。测试很多，但测试数量不能替代边界清晰度。

建议按行为切片逐步拆分，不做一次性重写：

1. 从 `PlayerController` 提取 SelectionController、HammerPlacementController、WrenchController、InventoryService 和 InputRouter。
2. 从 `Contraption` 提取 ComponentTree、BodyConfig、ConstraintGraph、ScriptCommandAdmission 与 Serialization。
3. 将 `SpaceUiStore` 的市场、Agent、编辑器、库存 action 拆成组合 service，并用明确接口替换引擎对象上的 `any`。
4. 给每次拆分设定“不改变 wire format / storage key / public action surface”的契约测试，保持现有 600+ 回归用例的价值。

## 验证清单

- TypeScript `tsc --noEmit`
- API 文档生成一致性
- Node 单元/集成测试全集
- Vite production build 与 chunk 报警
- `npm audit --audit-level=high`
- `git diff --check`

最终验收结果：621/621 项测试通过，TypeScript、API 文档一致性与 production build 通过，依赖审计为 0 个已知漏洞，diff whitespace 检查通过。production 主入口为 286.45 kB（gzip 78.35 kB），AI 与大型模态块未出现在首屏 preload 中；1280×720 离线实机目检确认 First Mission 可收起、可重新打开，且不遮挡核心 HUD。
