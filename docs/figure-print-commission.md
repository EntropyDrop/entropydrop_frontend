# CUTE-10cm 委托制作

3D Printing 页面通过型号下拉框选择款式，目前仅支持 CUTE-10cm。有皮肤时，右上角展示「委托制作 / Order a Figure Kit」。未选择皮肤时展示收藏夹、发现入口。MCModal 传入作品编号、名称、发布者和公共许可等来源信息；来源链接使用站内作品页，贴纸使用正式域名，不输出 CDN 签名地址。

当前套餐：打印白模部件＋预切贴纸，不含组装与代贴服务，用户自行组装粘贴。每套 US$40，包邮；预计审核通过后制作 3 天，运输约 2 周。预览中移动部件不会影响订单。下单抽屉列明产品名称、定制皮肤 ID、约 10 × 6.7 × 4.1 cm 的成品尺寸及物料：预切贴纸 1 份；头部、躯干、左右手臂、左右腿各 1 件；长关节 1 个、短关节 4 个（双肩和双腿各 2 个），无需 PTFE 管。

旧版 `PrintPage` 已删除，`/skin/print` 仅作为旧链接重定向到 `/figure/3dprint`。订单中的添加按钮直接进入新页面。库存、地址和下单 API 为新流程共用接口，继续保留。

## 开放下单

复用 `GET /api/orders/model-stock?order_type=print`、地址管理、`POST /api/orders` 和订单页付款。服务端 `model_sales_limits` 需配置：

- `model_type`: `Cute DIY Kit`
- `order_type`: `print`
- `price`: `40.0`（美元）
- `stock`: 初始 `300`，后续由现有支付库存预留流程扣减

后端迁移 `f3c72a6b910e_add_cute_figure_kit.py` 在型号不存在时新增配置；已存在的价格、库存不会被重置。迁移回滚也保留业务库存，以免影响已下单商品。后续迁移 `b8d62a4f901c_update_cute_kit_price.py` 将该 SKU 的新购价格更新为 US$40，不修改库存、其他商品或已创建订单的价格快照。库存接口返回实时 `stock`，页面展示后端价格，不展示库存数量；未配置、价格无效或库存不足时不允许下单。型号与订单 SKU 的对应关系维护在 `figureModels.ts`；新增款式还需实现相应模型生成逻辑。

下单时可选择数量，默认 1 套，最多 10 套，并受实时可用库存限制。`POST /api/orders` 通过 `quantity` 一次提交，服务端按每套价格计算总额；仍为每套保存独立的订单明细和皮肤快照，不使用独立数量列。只有地址 ID 相同且收件人、国家或地区、省州、城市、邮编、详细地址、电话与原订单快照一致时，才合并待付款订单；合并后也不得超过 10 套或该型号可用库存。地址修改后再次加购会创建新订单，不覆盖旧订单地址、不重置旧订单的支付凭证或库存预留。仅改变默认地址标记不影响合并，也不改写原快照；历史缺失快照的订单不参与合并。

金额统一显示 `$`，计价仍为美元。委托制作按钮从型号接口读取单套价格；抽屉打开后重新读取价格、库存和规格。

收货地址按「收件人姓名 → 国家或地区 → 省/州/地区、城市 → 详细地址 → 邮编 → 联系电话」填写。收件人使用完整姓名，不强制拆分姓与名，支持 Unicode，去掉首尾空白，上限 300 字符。PayPal 将 `shipping.name.full_name` 列为可选；本站为实体套件配送将收件人设为必填，不以用户名或付款人姓名代替。姓名随地址保存到 `shipping_addresses.recipient_name` 和下单时的 `address_snapshot`，订单页和管理页读取快照。编辑已选地址成功后同步侧边栏，旧地址缺少姓名时要求先补填。

其他必填项随地区变化，以 `*` 标记；不再统一显示 optional / 选填，不适用的省/州或邮编字段隐藏。切换国家清空原省/州和邮编，保留收件人、联系电话号码并更新区号。国家/地区与电话前缀采用固定版本的 [countries-list](https://github.com/annexare/Countries) 数据，中英文名称由 `Intl.DisplayNames` 提供；MIT 声明见 `public/licenses/countries-list.txt`。自定义下拉框支持中英文名称和国家代码过滤，保持英文名称 A–Z 排序。下拉框包含地区选项，不代表已经核实每个目的地的物流可达性，也不是 PayPal 商户账号可开通地区的白名单。

地址规则版本 `2026-10-10`：PayPal [Orders v2 shipping address](https://developer.paypal.com/sdk/orders/v2/definitions/order_request) 明确要求 AR、BR、CN、CA、IN、ID、JP、MX、TH、US 填写省/州；其他地区字段及邮编格式使用 PayPal 文档引用的 [AddressValidationMetadata](https://github.com/google/libaddressinput/wiki/AddressValidationMetadata)。本网站对元数据提供邮编格式的地区要求填写邮编，这是对 PayPal “通常需要邮编”的表述采用的表单规则。香港、澳门、阿联酋等无邮编地区不要求虚构邮编。美国、加拿大、澳大利亚使用省/州选择列表，兼容旧地址里的完整英文名称并转为邮政缩写。

前端 `src/constants/shipping-address-rules.json` 与后端 `data/shipping-address-rules.json` 保存同一份 252 个地区规则，不在运行时向第三方发送用户地址。元数据取自 libaddressinput commit `5ef3a927bdd6002bf25c5c09029347bebf57a57b`；使用 `python3 scripts/generate-shipping-address-rules.py /path/to/countryinfo.txt` 生成前端 JSON，再同步后端文件。Apache-2.0 许可证分别保存在 `public/licenses/libaddressinput.txt`、后端 `data/LICENSE.libaddressinput`。源数据中的邮编示例也经过格式校验后才用于提示。

创建和编辑地址均在服务端校验；部分更新先合并旧值，再校验完整地址，失败不会修改默认地址或写入部分字段。前端显示逐字段错误，服务端返回 `invalid_shipping_address` 与字段错误码。邮编保留字母、空格及连字符并统一大写。详细地址最多 600 字符，并须能完整分成 PayPal 接受的两行各 300 字符；其他字段继续受现有数据库字段长度限制。只校验必填项与格式，不证明地址真实或物流可达。

历史地址仍可查看；重新选择不完整地址会进入编辑界面提示补全，下单和创建支付也会复核。已付款订单的历史地址快照不变。旧待付款订单若快照不符合要求（包括缺少收件人），须修正地址后重新下单，不能用地址簿当前内容覆盖原订单快照。中国在站内保持 ISO `CN`，发送 PayPal 时按其跨境交易说明转换为 `C2`；中国和香港的规则已用虚构地址通过沙盒创建验证，未批准或扣款。部署收件人功能前运行迁移 `e4b7c9a21035_add_shipping_recipient_name.py`；旧地址姓名保留空值，不猜测，不改写历史订单快照。

选择国家或地区会自动设置对应电话前缀，用户仍可手动选用其他区号。编辑旧地址时保留显式保存的区号；无分隔符的国际电话按已知国际区号拆分，完整保留后续号码。粘贴完整国际号码时不重复拼接默认前缀，接口仍使用原有 `country`、`phone` 和 `zip_code` 字段，无数据库迁移。

电话数据校正：北美编号计划各地区统一使用 [+1](https://www.nanpa.com/about)，本地号码中保留三位地区码；BQ/CW 使用 [+599](https://www.itu.int/dms_pub/itu-t/oth/02/02/T02020000F80002PDFE.pdf)，SJ 使用挪威的 [+47](https://nkom.no/english/numbering-resources)，VA 使用实际联系号码中的 [+39](https://www.vatican.va/content/vatican/it/info.html)，XK 使用已分配的 [+383](https://www.itu.int/dms_pub/itu-t/oth/02/02/T02020000FD0002PDFE.pdf)，不使用上游数据中的历史或保留号码。

订单接口返回明细的 `refer_log_id`，订单页按来源皮肤、型号、单价汇总数量与小计，保留历史不同单价；待付款时可逐套减少。CUTE-10cm 订单点击皮肤图打开与 3D Printing 相同的模型预览，使用订单保存的皮肤和相同的贴纸覆盖算法，不可贴覆的表面保持白色；其他旧型号继续使用原预览。运费为 0，生产方按每项 `sticker_snapshot.model_name` 和规格快照区分型号；旧 CUTE-7cm 订单继续使用原模型、孔径和物料。

## 订单支付

订单页「立即支付」与 Credits 购买保持同样的 PayPal 弹窗体验，点击直接打开 600 × 700 窗口，不经过站内付款方式选择框。前端先同步打开窗口，再请求 `POST /api/orders/{id}/create-paypal-order`（新增可选请求体 `return_url`），接口返回 `id`、`status`、`approval_url`；无请求体的旧 SDK 调用仍只返回 `id`。已有凭证与库存预留会被复用；新凭证的成功/取消返回地址都使用现有 `/credits?payment_redirect=1` 自动关闭页面，缺少批准链接时按服务端 PayPal 配置选择正式或沙盒地址。

窗口关闭后调用原有 `/pay`，由服务端验证订单归属、凭证、金额与批准状态后确认支付，再刷新订单列表。取消/未批准不显示成功；失败可重试，初始化失败关闭空窗口。处理中禁止重复支付及修改当前订单；页面卸载或切换账号会关闭窗口、停止轮询并取消未完成请求。旧 SDK 创建的凭证可能没有返回地址，用户关闭其 PayPal 窗口后仍会确认状态。相关测试使用模拟 PayPal，不产生真实交易；无需数据库迁移。

付款确认超时后，带返回地址的初始化请求会返回原凭证及 `CAPTURE_PENDING`，前端直接恢复确认，不创建第二笔支付。订单支付请求独立处理错误，取消时不触发全局报错。订单页从保存的收货地址显示国家或地区、城市、详细地址、邮编和电话，便于再次核对。

实物订单将 `address_snapshot` 映射为 PayPal 的 `purchase_units[].shipping.address` 和 `shipping.name.full_name`，并设置 `payment_source.paypal.experience_context.shipping_preference=SET_PROVIDED_ADDRESS`。买家在网站填写地址，PayPal 仅显示该地址，不再允许选择或修改；支付请求不接受客户端替换地址或姓名。旧订单尚无快照时，先从其绑定地址生成快照，后续修改地址簿不会影响这笔订单。地区规则允许省/州、城市或邮编为空时不发送空字段；必填项缺失、格式无效或地址超长时阻止创建支付，避免截断或回退到 PayPal 地址。联系电话用于本站配送联系，当前不发送到 PayPal 的可选 `shipping.phone_number` 字段。

新实物支付使用 `website-shipping-v2` 作为 purchase unit 的 `reference_id`，标识已启用地址锁定并带收件人。旧凭证仍处于 `CREATED` 或 `PAYER_ACTION_REQUIRED` 且没有该标识时，重新打开支付会创建包含收件人的锁定地址新凭证，复用库存预留；已批准、已完成或正在确认的支付继续使用原凭证，不重新收款。Credits 和订阅继续使用原流程。

固定地址验证覆盖快照、旧凭证替换、已批准凭证恢复及数字商品兼容；另外使用虚构地址在 PayPal 沙盒创建了两笔未批准的测试支付，核验有/无返回地址的入口均能接受配置且完整返回收货地址，未执行扣款。接口规则见 [PayPal shipping preferences](https://developer.paypal.com/v5/checkout/add-shipping/)。

## 型号规格与订单快照

`model_sales_limits.kit_specifications` 保存该 `model_type` 当前的英文规格（JSON），包含 `product_name`、`dimensions`、`materials` 和 `assembly_note`。每条物料含 `name`、整数 `quantity`、可选 `description`；数量均为每套用量。`GET /api/orders/model-stock` 返回这份数据，下单弹窗直接读取，不再从前端语言文件拼出物料规格。CUTE 套件未配置规格时禁止创建订单。

`POST /api/orders` 从服务端型号配置取值，为每套 `order_items` 保存独立的 `kit_specifications_snapshot`，不接受客户端指定规格。此后修改或删除型号配置不会改动既有快照。普通订单列表、订单详情及管理员订单接口均返回快照；前端可展开「套件详情（每套）」查看。订单数量汇总把规格也计入分组键，防止相同皮肤/单价但不同配置被误合并。

历史订单的快照保持空值；接口通过单独的 `kit_specifications_current` 返回当前型号信息，UI 明确标注其仅供参考。不能把现有型号配置回填成过去的购买承诺。无当前配置时显示未记录规格。

迁移 `c7a31d902ef4_add_kit_specifications.py` 新增以上两列；`a9c64e280fb1_replace_cute_kit_with_cute10.py` 更新当前目录为 CUTE-10cm 规格，不修改价格、库存或旧订单。生产部署先运行 `alembic upgrade head`，再启用新代码。后续型号规格可在 `model_sales_limits` 对应记录中维护；内容须符合 `schemas.KitSpecifications` 的结构。

## 贴纸标识

PNG 上方标注 EntropyDrop、CUTE-10cm 和皮肤名称，下方参考图右侧标注发布者、发布者用户 ID、作品编号和作品链接，不印公共许可文字。全部文字使用 Fusion Pixel 像素字体，生成前等待所需中英文字体加载。仅在预留空白绘字，切割 SVG 不包含这些文字，也不修改原有路径和毫米尺寸。

每套订单的 `order_items.sticker_snapshot` 保存生成贴纸所需的完整文字：`skin_id`、`skin_name`、`publisher_id`、`publisher_name`、`source_url`、`brand`、`model_name` 和 `labels`，另有 `schema_version`、`origin`、`missing_fields`。服务端从皮肤和发布者记录生成快照；客户端仅通过 `sticker_language` 选择中英文标签，不能提交替代身份信息。后续改名、删除皮肤或发布者不会修改该快照。这里的用户 ID 是贴纸上的发布者 ID，购买者仍由订单的 `user_id` 记录。

下单时皮肤 PNG 独立复制到私有存储 `orders/{order_id}/{item_id}.png`，数据库保存对象键而非临时签名 URL；复制失败则不创建订单明细。下单与皮肤撤回使用同一皮肤行锁，确保复制发生在删除之前，或拒绝已撤回来源。皮肤撤回流程不删除订单副本。

订单隔离回归测试覆盖：逐项修改地址后再次加购，默认地址切换，待付款、已付款、运输中和完成订单的地址修改与删除，以及原皮肤、发布者、地址全部删除后，订单仍使用原收货信息创建支付、展示来源和规格、重新签发生产图片并读取贴纸文字。测试使用隔离数据库及模拟对象存储、PayPal，不删除开发环境的实际记录或发起真实付款。

管理页「准备制作」使用 `/figure/3dprint?order=…&item=…`。该页面调用管理员专用 `GET /api/figure/orders/{order_id}/items/{item_id}/production-source`，仅允许已付款且审核通过的订单，并读取私有订单副本与保存的贴纸信息。重新打开或重试会重新签发图片 URL，不查询原皮肤或用户资料；界面切换语言也不会改变已保存的贴纸标签。该模式禁止编辑和再次委托下单。

迁移 `d2f81a604bc9_add_order_sticker_snapshot.py` 为历史 CUTE 订单尽量补齐已有信息，以 `origin=legacy_backfill` 标明补录来源。已消失且无快照的信息不能恢复，记录在 `missing_fields`，管理页提示人工核查并禁止用不完整信息生成制作文件。补录时取得的用户名不保证等同于历史下单时用户名。部署先迁移数据库，再启用新接口。

## 爆炸图预览

模型预览标题右侧仅显示皮肤来源链接，页面不再单列发布者和作品编号；贴纸与订单快照仍保留完整来源信息。预览右侧显示 0–10 cm 标尺，按 STL 的毫米换算比例投影，随镜头旋转、缩放变化，爆炸图和部件拖动不会改变标尺所代表的 100 mm 长度。标尺仅用于预览，不加入 STL 或贴纸。

模型预览可切换爆炸图：长连接件 1 个连接头部和躯干，短连接件 2 个分别连接躯干和双腿，特氟龙管 2 根连接两臂和躯干。短连接件共用一份 STL，需打印两次；管件是非打印部件，不进入 STL 列表。

引导线按实际 Cute 插孔定位，兼容粗臂和细臂皮肤，部件仍可通过 XYZ 箭头移动。普通视图与爆炸图分别保留手动位置，重置位置只重置当前视图。导出的 STL 和贴纸不随预览变动。

管件共 2 根，预览按指定规格显示：每根长 12 mm、外径 4 mm（肩孔为 4.1 mm），示意内径为 2 mm。爆炸图不会拉长管件，管件仍为非打印部件。尚未经过实物试装。


## 人工审核与生产

管理员账号菜单进入「手办管理」(`/figure/manage`)。接口 `/api/figure/orders` 全部要求 `get_current_admin`，仍使用服务端 `ADMIN_EMAILS` 配置；前端隐藏入口不是权限边界。

付款后新打印订单进入 `awaiting_review`。审核以整笔订单为单位，包含合并在同一订单内的全部皮肤；管理员勾选核查确认后才可通过。页面显示订单保存的皮肤、下单时的来源和许可快照、收货地址；历史订单没有来源快照时明确展示当前信息，不把当前许可冒充下单时许可。许可字段用于人工核查，不作自动合法性判断。

通过后按「待生产 → 生产中 → 已发货 → 已完成」操作。发货须填写物流公司和单号；通过、发货、完成均有站内信。库存只影响新购买，不作为已付款订单的生产门槛。已经进入生产、发货或完成的旧订单保留原流程，其他已付款旧订单待审核。

拒绝前必须填写用户可见原因，并确认整单全额退款。服务端在请求 PayPal 前先保存拒绝决定与通知，再使用实际 capture 的金额和固定幂等键请求退款。只有 PayPal 确认 `COMPLETED` 后才显示「已退款」，同时恢复明确记录已扣减的库存；历史扣减不明的订单不自动加库存。网络超时保留「退款处理中」，重试和并发操作不会再改审核结果或重复发站内信。

后台已有 order reconciliation job 每 5 分钟检查待确认的退款；部署时须运行 `background_service.py`。管理员也可点击「同步退款状态」。已知退款 ID 只查询其状态；未知结果先查询 PayPal 订单，发现已有退款就核对金额与 capture。部分退款、多笔退款、异常金额或超过 6 小时仍不明的结果转人工核对，不盲目再次退款。PayPal 明确失败时显示需要处理；此时应在 PayPal 核查原因，不将订单标记为完成。

网页邮箱使用既有 `forum_notifications`：用户收到拒绝原因、退款完成和物流信息，点击打开 `/skin/orders?order=...`，可直接查看历史订单。订单接口仍验证所属用户，支付接口不允许恢复已拒绝或已退款订单。

迁移：后端 `a4e19c7d8032_add_figure_order_review.py`，在 `f3c72a6b910e` 之后执行。新字段包括审核记录、退款状态、来源快照及站内通知订单关联。开发验证使用隔离数据库和模拟支付边界，不产生真实退款。

支付接口参考：[PayPal captured-payment refunds](https://developer.paypal.com/api/payments/v2/captures-refund)、[PayPal idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)。
