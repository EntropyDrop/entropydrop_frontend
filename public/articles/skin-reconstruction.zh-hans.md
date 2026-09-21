# 图生皮肤的新路径：从规范化渲染到 Minecraft UV 重建

**作者：EntropyDrop Dev Team**

**首发：2026-07-25**

**更新：2026-09-21 · 线上版本 SKING_DDJ_v101c**

> 本文已按当前线上技术栈重写。SkingToolkit [`v101`](https://github.com/EntropyDrop/SkingToolkit/tree/v101) 与 [`v101c`](https://github.com/EntropyDrop/SkingToolkit/tree/v101c) 指向同一份源码快照 [`27aa7f8`](https://github.com/EntropyDrop/SkingToolkit/commit/27aa7f8a7d8cb3242e70f605d206caeeea2659d0)。`v101c` 是 v101 最终发布物的可部署封装，不是重新训练出的另一套模型。此前文章介绍的 v104 是后续研究候选，现已不代表线上流程。

## 前言

在上一篇文章《[从参考图到 Minecraft 皮肤：生成模型训练实践](/public/blog/skingen)》中，我们尝试让图生图模型直接输出包含 UV 贴图和多视角渲染的复合图像。这条路线可以学习角色外观与 Minecraft 风格，却容易把徽章、文字、头发和饰品当成普通纹理缩小：轮廓消失、颜色混合，内外层关系也不稳定。

当前系统因此采用两阶段流程：第一阶段把任意角色参考图转换成相机、姿态和画布固定的 Minecraft 前后视图；第二阶段使用 SkingToolkit v101，从这两幅视图重建 64×64 RGBA 皮肤。线上部署名为 `SKING_DDJ_v101c`。

整条链路是：

```text
角色参考图
  → 规范化前后视图
  → 学习式前景分割
  → 固定几何候选与 Dense UV Parser
  → 头部语义、配饰与头饰一致性判断
  → 初始 UV 与确定性内层补全
  → 可见材质拟合与皇冠顶面修正
  → 64×64 RGBA Minecraft 皮肤
```

以下图片用于说明中间产物。它们来自早期示例，不是 v101 与其他版本的定量对比。

输入任意角色参考图：

![输入角色参考图|240](/articles/images/input24.png)

阶段一生成规范化的 Minecraft 前后视图：

![规范化前后视图|480](/articles/images/img24_template41_51_52.png)

阶段二依次执行前景分割、几何候选、语义路由与 UV 重建：

![前景分割|480](/articles/images/img24_cutout.png)

![固定几何候选|480](/articles/images/img24_geo.png)

![语义路由|480](/articles/images/img24_routed.png)

![初始 UV|480](/articles/images/parser_only_uv.png)

![内层补全后的 UV|480](/articles/images/parser_pred_uv_simple_inpainting.png)

## 一、相关工作与方案演进

据我们目前能够追溯到的公开资料，这条双阶段思路较早由网友 DDJ 提出。2025 年底，他演示了使用 Banana 图像模型辅助生成 Minecraft 皮肤的方法；2026 年 2 月，又训练专用模型改进从生成图提取 UV 的效果，并公开了模型：

- [2025 年 11 月 23 日的方案演示](https://www.bilibili.com/video/BV1NqUNBVEu5)
- [2026 年 2 月 16 日的 UV 提取改进](https://www.bilibili.com/video/BV1muZTBkE53)
- [开源模型 MCSkin](https://huggingface.co/d1ngdongji/MCSkin)

2026 年 3 月，论文 [BLOCK: An Open-Source Bi-Stage MLLM Character-to-Skin Pipeline for Minecraft](https://arxiv.org/abs/2603.03964) 对相近路线进行了系统研究。

我们的工作集中在两个问题：让第一阶段输出尽量贴合固定投影；以及把第二阶段从颜色和覆盖率规则，改造成由几何约束、图像语义、多视图一致性和渲染误差共同决定的 UV 重建系统。

## 二、先说明版本：v101 与 v101c 是什么关系

版本名容易造成误解。当前发布关系如下：

| 名称 | 含义 |
| :--- | :--- |
| SkingToolkit `v101` | 最终研究与发布分支，包含训练、推理、验收记录和皇冠几何修复 |
| `crown_geometry_20260906` | v101 的最终发布修订，核心实现提交为 [`28f548a`](https://github.com/EntropyDrop/SkingToolkit/commit/28f548a5be37868022cfbafaddbe095895e18210) |
| `SKING_DDJ_v101c` | 面向线上 worker 和 Hugging Face 的自包含部署包，模型和 pipeline 与上述 v101 发布相同 |

`v101c` 中的 “c” 表示封装后的发布变体。它固定了 parser、前景模型、推理代码、SigLIP2 依赖和 renderer mapping 的校验值。生产环境不会从一个不断变化的开发目录临时拼装模型。

发布中的关键文件为：

| 文件 | SHA-256 |
| :--- | :--- |
| `parser.pt` | `a8aa3d8cd51cc6fec28d7c525aa1b012976d7cb1206e8b00c707de76bfb205dc` |
| `pipeline.json` | `3e14b98437eba9c5189a3344f560e7183f8daad44b9c40c55e15f7e0fda27685` |
| `foreground.pt` | `8585a698d38969e6e7562e9c7d8c5f0b5e934e8f0811cf5b8678fcf05734e732` |

模板和第一阶段 Prompt 没有因为部署名改为 v101c 而改变。v101c 只替换第二阶段的 UV 重建运行时。

## 三、阶段一：把参考图变成可测量的双视图

第一阶段使用一张角色图和多张模板图。模板拥有不同皮肤，但使用相同画布、正交相机、人物比例、朝向和轻微行走姿态。多模板的目的不是增加角色内容，而是反复约束输出几何，减少模型照搬某一张模板外观。

当前 Prompt 的核心要求是：使用 Minecraft 双图层玩家模型；保持与模板完全相同的尺寸、相机、姿态和位置；使用容易分离的背景；在这些约束内还原人物、服装和饰品。

实际测试表明，直接在文字里给出 yaw、pitch 或 FOV 数值并不稳定。图像模型更擅长模仿参考图的构图。因此模板本身比更长的 Prompt 更重要：

- 1:1 画布，左侧为前视图，右侧为后视图；
- 正交投影且关闭光照，避免透视和阴影污染取色；
- 四肢轻微分开，减少躯干与手臂的遮挡；
- 使用纯色背景，同时接受生成结果存在轻微边缘混色；
- 保持固定的 `front_left`、`back_left` 顺序。

![模板 41|240](/articles/images/template41.png)
![模板 42|240](/articles/images/template42.png)
![模板 43|240](/articles/images/template43.png)

固定视图使第二阶段可以使用预计算几何映射。它也构成明显限制：如果第一阶段改变相机、姿态或比例，后续语义模型无法凭空恢复正确的 UV 对应关系。

## 四、固定几何回答“可能来自哪里”

Minecraft Steve 模型由头、躯干、双臂和双腿组成。每个部件有 6 个矩形面，并拥有内外两层，总计 72 个矩形表面。`differentiable_minecraft_renderer` 和 `mc_skin_utils` 生成固定视角映射，SkingToolkit 使用这些映射执行渲染与 UV 重建。

对每个屏幕像素，几何层列出它可能对应的：

- 身体部件和立方体面；
- 内层、外层或更深的次级表面；
- 64×64 图集中的 UV 坐标；
- 同一条视线上的多个候选及深度顺序。

几何不能单独给出最终答案。一个像素可能来自脸部内层、覆盖脸部的眼镜外层，也可能透过外层孔洞看到更深的面。只采用射线第一个命中面，会把皇冠侧壁误写成头顶横板；只看方格覆盖率，又会把皮肤色误判成配饰。

因此 v101 的基本分工是：renderer 限定合法候选，模型根据图像证据决定候选的角色，最终再用渲染误差检查部分结构修改。

## 五、学习式前景：轮廓与取色使用不同阈值

早期流程从左上角背景种子执行 flood fill。纯色背景干净时它很有效，但遇到封闭孔洞、与背景接近的衣物、JPEG 边缘和细帽沿时容易失败。

v101 使用独立的 Minecraft 前景模型。它在 BiRefNet 基础上冻结预训练 backbone，只训练 decoder；训练数据由 renderer 从真实皮肤生成：

- 4,096 个训练身份；
- 128 个验证身份；
- 128 个测试身份，共 256 张保留测试渲染；
- 近似前景色、渐变、噪声、棋盘格、JPEG 和触边裁剪等背景扰动；
- 按规范化 RGBA 内容哈希隔离身份，真实开发图不参与梯度训练。

通过验收的模型在保留测试上达到 0.996745 IoU。部署时保留两套掩码：

| 用途 | 条件 | 目的 |
| :--- | :--- | :--- |
| 角色轮廓 | 前景概率 ≥ 0.50 | 尽量保留发尖、帽沿和饰品边缘 |
| UV 取色来源 | 前景概率 ≥ 0.98，并内缩 1 像素 | 避免把背景混色写入皮肤 |

严格取色掩码只限制 RGB 来源，不会直接删除细结构。这个区分对头发和帽沿十分关键：边界可以作为几何证据保留，但不一定适合作为材质颜色。

## 六、Dense UV Parser：几何锚定、语义条件化

### 6.1 基础路由网络

基础 Dense UV Parser 使用 U-Net 处理 RGB 和视图身份，并加载冻结的 SigLIP2（`google/siglip2-base-patch16-224`）特征。全局多视图特征提供“这两幅图属于同一角色”的上下文，局部 patch 特征帮助区分眼镜、头发、帽子等区域。

模型预测前景、直接内层、直接外层、次级表面、精确 surface slot、路由置信度和固定几何对齐参数。部件、面和 UV 坐标仍由 renderer 候选限定，并不是自由生成。多视图训练包含路由分类、UV 一致性和重渲染误差，使错误分层同时受到标签与图像重建约束。

SigLIP2 特征增强了图像语义，但“语义”并不等于模型已经获得开放世界理解。它仍在有限类别、固定视图和程序化监督内判断归属；少见头饰、遮挡和凌乱发型可能超出训练分布。

### 6.2 v101 的头部专用分支

v101 保留原 v61 主网络参数，并逐步加入受限的头部判断：

1. **配饰分支**识别眼镜、帽子和外层头发，避免完全依赖覆盖率规则。
2. **帽子部件分支**区分内层帽冠、内层帽带、外层帽冠、外层帽带与帽沿。程序数据包含环绕帽沿、前帽舌和非对称反例。
3. **面部／头发／耳机分支**处理额头被误当眼镜、耳机颜色渗入内层头发等冲突。耳机分支只允许在已有可靠外层几何中校正取色，不得任意新增外层。
4. **头饰分支**分别表示帽身、帽带、帽沿和皇冠，并用冻结的 SigLIP2 特征与像素分布判断整件头饰是否存在。

这些分支没有把颜色直接映射为类别。标签来自程序构造的对象和明确语义关系；未知原生纹理不被当成负例。这样可以避免学到“红色一定是帽带”或“绿色一定是耳机”的规则。

### 6.3 以对象为单位保持一致

逐像素分类很容易把同一圈帽带切成内外两层，或只识别皇冠的一部分。v101 将前后视图证据汇总后，为同一个人物的帽身、帽带和皇冠统一决定层级。只有两视图证据达到门槛，才允许改变最终分层。

![v101 帽带与皇冠分层对比|720](/articles/images/v101_headwear_comparison.png)

这是一种受限的对象一致性，并不是任意实例分割。当前实现按一个人物的一件帽身、一圈帽带和一顶皇冠汇总；多个重叠头饰仍可能产生歧义。

## 七、从路由像素到 64×64 UV

### 7.1 稳健取色

路由后的源像素投到合法 UV 格。`grid_mode` 在安全来源中统计实际 8-bit RGB，选择支持数量最多的颜色；只有票数相同才用到 UV 中心距离。它不会把前景与背景简单平均成输入中不存在的颜色。

普通外层格需要足够的源像素、局部路由证据与 UV 格共识。对于只有外层轮廓才能解释的区域，系统允许更宽松但仍受几何约束的 rescue。v101 的目标不是让外层越多越好，而是在漏检与持久错误方块之间保持偏保守的取舍。

### 7.2 确定性内层补全

双视图无法观察每个内层纹素。`simple_inpainting` 只填补未知内层：

- 每个身体部件独立处理，不跨部件复制颜色；
- 正背面和顶底面按矩形环从边缘向中心推进；
- 侧面优先沿同一行从两侧向中间补；
- 先寻找同部件镜像格，再寻找同部件三维邻近颜色；
- 已知内层和完整外层逐字节保留。

它不是生成模型，也不会创建、删除或重涂外层。镜像只是缺少观测时的启发式，并不宣称人物纹理必然对称。

### 7.3 可见材质拟合

如果系统新建或删除一个外层格，遮挡关系会随之改变。原先归给脸部的源像素可能属于眼镜，耳机下面也可能需要恢复头发。v101 在几何决定后，以两个视图重新渲染头部，执行 48 步隔离材质拟合：

- 保持最终 alpha 和身体纹理不变；
- 按实际可见层更新头部颜色；
- 排除前景边缘、语义边界和错误层来源；
- 只有图像重建误差下降才接受结果；
- 缺乏可靠观测时保留补全结果。

下图展示了额头外层误分和耳机颜色串入内层头发的修复。图中百分比和颜色计数是指定开发案例的诊断，不是通用准确率。

![v101 额头与耳机串色修复|720](/articles/images/v101_layer_comparison.png)

## 八、皇冠顶面：用重渲染证据修正几何

皇冠暴露了纯像素语义仍解决不了的问题：一条相机射线可能先穿过应当透明的外层头顶，再看到皇冠侧壁。如果把“皇冠”直接写入射线的第一个 UV 命中，就会在头顶生成多余横板。

最终 v101 使用 `rendered_semantics`：在整顶皇冠检测通过后，固定其他几何，逐格比较保留或删除外层头顶格的双视图渲染。损失同时考虑皇冠语义概率与前景轮廓；每次删除后重新计算可见性。只有删除能改善证据时才执行。

![v101 皇冠顶面修复|720](/articles/images/v101_crown_geometry_comparison.png)

这一步没有颜色阈值、指定人物规则或“皇冠顶部必须全空”的假设。它只会删除缺乏支持的外层头顶格，不会补造缺失的皇冠侧面。该修复没有重新训练权重：386 个模型张量与上一版相同，变化来自配套推理算法。

## 九、训练、验收与版本选择

v101 不是一次训练完成的单体模型，而是一组冻结主干、逐项增加专用分支并单独验收的发布：

| 环节 | 训练与主要验收 |
| :--- | :--- |
| 前景模型 | 4,096/128/128 个训练、验证、测试身份；保留测试 IoU 0.996745 |
| 帽沿与配饰续训 | 8,000 步，验证选择第 7,000 步；程序化保留测试 precision 0.992704、recall 0.997558、完整对象率 0.978571 |
| 面部、头发、耳机语义 | 新分支训练 1,200 + 3,000 步，耳机存在性分支 1,200 步；原 v101 参数保持不变 |
| 头饰一致性 | 分割分支 5,400 步、整件识别器 1,200 步；保留测试皇冠外层召回率从 91.6251% 提升至 99.9235% |
| 皇冠顶面 | 训练 0 步；32 个程序皇冠中多余顶面格 491 → 14，真实顶面保留 178/182 |

这些数值的范围必须同时说明：程序化测试衡量已定义的几何与类别，不是任意生成图的真实语义准确率；14 张真实图片用于开发回归和视觉复核，不是独立盲测；部分程序皇冠复用了之前的来源身份，因此皇冠结果属于回归证据。

我们后来继续训练了 v102 到 v109，也曾把 v104 作为候选写入本文。实际批量审查发现，v104 虽在部分可见头部指标上改善，但对复杂头发更容易漏块，并在没有视图证据的头底面出现退步。人工标注本身对凌乱头发也可能不存在唯一答案。综合真实输出、稳定性和回归结果后，线上选择回到 v101，部署名为 v101c。后续版本继续作为研究记录，不自动继承“版本号更大就更好”的结论。

## 十、v101c 的生产封装与开源复现

线上 worker 加载 `SKING_DDJ_v101c` 自包含目录，而不是依赖 SkingToolkit 开发工作区。发布包包括：

- v101 parser 与 `pipeline.json`；
- Minecraft 专用前景模型及冻结的 BiRefNet 基础文件；
- SigLIP2 模型快照；
- SkingToolkit 推理代码和 renderer；
- 固定 mapping 文件的 SHA-256 清单；
- `release.json` 中的模型版本、源码提交与全部文件哈希。

GPU worker 对 v101c 使用自己的 bundle，并在文件缺失、版本不匹配或哈希不正确时失败，不回退到 v61 或 v104。这样，同一份输入在开发验收、Hugging Face 包与线上 worker 之间使用的是同一 parser、pipeline、前景权重和几何映射。

源码与模型分别发布在：

- [SkingToolkit v101](https://github.com/EntropyDrop/SkingToolkit/tree/v101)
- [SkingToolkit v101c](https://github.com/EntropyDrop/SkingToolkit/tree/v101c)
- [Hugging Face：EntropyDrop/Sking · SKING_DDJ_v101c](https://huggingface.co/EntropyDrop/Sking/tree/main/SKING_DDJ_v101c)

## 十一、仍未解决的问题

- **第一阶段仍依赖闭源图像模型。** 错误背面、遗漏配饰或相机漂移会直接传递到 UV 重建。
- **视角与模型固定。** 当前主要面向 Steve 布局以及 `front_left`、`back_left` 两个固定视图；明显的透视、姿态或比例偏差不在设计范围内。
- **“语义”仍是受限分类。** 模型能利用图像上下文区分一些脸部、头发与配饰，但没有获得对所有对象和材质的通用理解。
- **不可见纹理没有唯一答案。** 内层补全依赖镜像和同部件邻近色；头底面、遮挡区域和凌乱头发可能存在多个同样合理的 UV。
- **对象一致性范围有限。** 一件帽身、一圈帽带和一顶皇冠的汇总规则不等同于通用的多实例、重叠饰品分割。
- **结构与颜色必须分别检查。** alpha 正确不保证 RGB 正确，正面看起来自然也不保证背面、侧面和 UV 层级正确。

v101/v101c 的核心价值不是用更多硬规则替代旧规则，而是让不同证据各自负责：几何约束合法位置，语义分支处理图像归属，多视图聚合保持对象一致，renderer 验证可见结果，材质拟合只在误差下降时更新颜色。它仍不完美，但目前比后续候选提供了更稳定的综合质量，也给每类错误留下了可追踪的诊断路径。

## 参考资料与延伸阅读

- [v101 发布说明](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/V101.md)
- [v101 去背景模型](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/FOREGROUND.md)
- [v101 帽沿训练与验收](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/V101_RETRAIN.md)
- [v101 额头与耳机串色修复](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/V101_SEMANTIC_FIX.md)
- [v101 帽带与皇冠统一分层](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/V101_HEADWEAR_FIX.md)
- [v101 皇冠顶面修复](https://github.com/EntropyDrop/SkingToolkit/blob/v101/dense_uv_parser/V101_CROWN_GEOMETRY_FIX.md)
- [Minecraft Wiki：Skin](https://minecraft.wiki/w/Skin)
- [SigLIP 2](https://arxiv.org/abs/2502.14786)
- [BLOCK](https://arxiv.org/abs/2603.03964)

## 参与研究与项目链接

- 在线生成器：[https://entropydrop.com/skin/generate](https://entropydrop.com/skin/generate)
- Hugging Face 模型：[https://huggingface.co/EntropyDrop/Sking](https://huggingface.co/EntropyDrop/Sking)
- GitHub：[https://github.com/EntropyDrop](https://github.com/EntropyDrop)
- Discord：[https://discord.gg/zxd8RjUyYt](https://discord.gg/zxd8RjUyYt)
