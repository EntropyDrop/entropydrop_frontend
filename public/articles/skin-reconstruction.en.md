# From Rendering to Reconstruction: A New Workflow for Image-to-Minecraft-Skin

**Author: EntropyDrop Dev Team**
**Date: 2026-07-25**


## Preface

In the previous article *[From Reference Image to Minecraft Skin: A Generative Model Training Practice](/public/blog/skingen)*, we introduced a technical approach centered on an image-to-image model: first convert a reference image into a composite target image containing both a UV map and multi-view renders, then extract a 64×64 skin through post-processing. This approach demonstrated that large models can learn the mapping between character features, pixel art style, and Minecraft skins. However, it also encountered a clear bottleneck.

The model often learned only visual approximations without genuinely comprehending the graphics on clothing—rockets, bears, text, or badges. When faced with such details, it tended to naively downscale high-resolution patterns, producing results akin to ordinary downsampling: details gradually vanished, colors bled into one another, and the edges of key silhouettes became blurred. An ideal low-resolution expression should first understand the meaning and most distinctive structure of a graphic, then reorganize that information within a limited pixel budget—not simply compress the original image.

To temporarily bypass this bottleneck while continuing to validate the downstream UV recovery pipeline, we reluctantly introduced a closed-source image model as an auxiliary, splitting image-to-skin into two stages: Stage One converts an arbitrary character image into structurally fixed Minecraft front/back renders; Stage Two reconstructs the skin UV map from those renders. The closed-source model is not the final architecture we intend to depend on long-term. One of the key goals at this stage is to continuously collect screened and verified "original character image → normalized render → UV skin" triples, so that we can eventually train an image-to-skin model that does not depend on any closed-source model.

The new end-to-end pipeline is as follows:


Input arbitrary character reference image

![input24|240](/articles/images/input24.png)

Stage One: Generate normalized Minecraft front/back views

![img24|480](/articles/images/img24_template41_51_52.png)

Stage Two: Reconstruct UV map from renders

Foreground extraction

![cutout|480](/articles/images/img24_cutout.png)

Fixed-view geometry fitting

![img24_geo|480](/articles/images/img24_geo.png)

Dense UV Parser: inner / outer / secondary surface semantic routing

![img24_routed|480](/articles/images/img24_routed.png)

![img24_uv|480](/articles/images/parser_only_uv.png)

Per-part, per-face inner-layer repair

![img24_uv|480](/articles/images/parser_pred_uv_simple_inpainting.png)

Re-render

![img24_final|480](/articles/images/img24_final.png)



This article covers the design, training sequence, debugging methodology, and current limitations of this new workflow.

## Related Work and Evolution

To the best of our knowledge from publicly available sources, this line of thinking was first proposed by DDJ. In late 2025, he demonstrated a method for using the Banana image model to assist Minecraft skin generation; in February 2026, he trained a dedicated model to improve UV map extraction from generated images and subsequently released the model publicly. Relevant materials include:

- [Demonstration published November 23, 2025](https://www.bilibili.com/video/BV1NqUNBVEu5)
- [UV extraction improvements published February 16, 2026](https://www.bilibili.com/video/BV1muZTBkE53)
- [Open-source model MCSkin](https://huggingface.co/d1ngdongji/MCSkin)

In March 2026, another group of researchers proposed a similar two-stage approach and conducted a more systematic study in the paper [BLOCK: An Open-Source Bi-Stage MLLM Character-to-Skin Pipeline for Minecraft](https://arxiv.org/abs/2603.03964).

Building on this prior work, our improvements focus on two directions:

1. Increasing the stability of the Banana model's output—reducing variance in camera angle, character pose, scale, and screen position—so that inner and outer skin layers land as consistently as possible within the predetermined projection grids.
2. Redesigning the UV recovery pipeline to directly reconstruct a 64×64 RGBA UV map from normalized renders, preserving both inner and outer layer structure.

## Zero: Foundations — Differentiable Renderer and Training Pipeline

Before diving into each stage's technical details, we must first introduce the core infrastructure that underpins the entire Stage Two pipeline—the Differentiable Minecraft Renderer. It is the key dependency that enables SkingToolkit's "geometry-first" approach, responsible for generating precomputed UV projection mappings and training labels.

### 0.1 Project Relationships

`differentiable_minecraft_renderer` is a standalone project independent of SkingToolkit. Together with `mc_skin_utils` (a Minecraft skin mesh processing library), it forms SkingToolkit's low-level dependencies.

### 0.2 Two Core Responsibilities of the Differentiable Renderer

**Responsibility One: Generating Precomputed UV Projection Mappings**

The renderer precomputes per-pixel UV mappings for each view configuration offline via `generate_mappings.py`, saving them as `.pt` files under `mappings_{W}x{H}/` directories.

The generation method uses color-coded lookup: each 64×64 UV texel is assigned a unique high-contrast RGB color (via `code = ((idx * 2053 + 1381) & 0x0FFF)`, mapping 4096 texels to mutually distinct values in 12-bit color space), producing a 64×64 "palette skin". This palette skin is rendered by `mc_skin_utils` with the specified camera parameters, and the color of each output pixel is decoded to look up its source UV texel. This approach is more robust than parsing Minecraft model triangle meshes and UV coordinates—it inherently handles occlusion, depth ordering, and inner/outer alpha compositing.

For each view configuration, the renderer generates the following mapping data:

| Mapping Tensor | Shape | Content |
| :--- | :--- | :--- |
| `inner_uv_map` | H×W×2 | UV coordinates (0–63) per screen pixel for the inner skin layer; `(-1,-1)` where no inner surface is covered |
| `inner_mask` | H×W | Binary mask indicating inner layer coverage |
| `outer_uv_map` | H×W×2 | UV coordinates per screen pixel for the outer skin layer |
| `outer_mask` | H×W | Binary mask indicating outer layer coverage |
| `outer_uv_layers` | L×H×W×2 | Depth-sorted per-layer UV coordinates for the outer render |
| `outer_masks` | L×H×W | Corresponding per-layer masks |
| `composite_uv_layers` | L×H×W×2 | Depth-sorted UV for inner+outer compositing, with `composite_is_decor_layers` marking whether each layer is outer |
| `geometry_uv_layers` | 72×H×W×2 | Depth-sorted UV for all 72 rectangular faces of the Steve model (6 parts × 6 faces × 2 layers), ordered by `geometry_sort_indices` |
| `geometry_masks` | 72×H×W | Corresponding per-face masks |

`DifferentiableRenderer` in `SkingToolkit/renderer.py` is the loader and execution engine for these mappings. It does not recompute projections; instead, it loads the precomputed grids and masks from `.pt` files, samples pixels directly from the skin atlas via `F.grid_sample`, and composites them according to alpha blending rules. Within SkingToolkit, `DifferentiableRenderer` serves two scenarios:

- **Training**: render all configured views for each GT skin, producing per-pixel routing labels (part, face, layer, UV coordinates). In the differentiable training branch covered in later sections, the model's soft outputs are splatted into a provisional UV and re-rendered to compute multi-view consistency losses.
- **Inference**: load the same mappings used during training, provide lookup data for geometry fitting (see Section 3), and generate grid overlays in diagnostic images.

**Responsibility Two: Generating Training Labels**

For each 64×64 GT skin in the training set, the renderer deterministically outputs the source information for every screen pixel. Because the renderer knows precisely which UV texel each pixel was sampled from, which body part and face that texel belongs to, and whether it came from the inner or outer layer, this information can directly serve as supervised labels for the downstream routing model, requiring zero manual annotation.

Specifically, for each configured view, the renderer produces the following labels per pixel:

| Label | Value Space | Meaning |
| :--- | :--- | :--- |
| `foreground` | {0, 1} | Whether the pixel belongs to the character (foreground) |
| `part` | {0,…,5} | Body part: head, torso, left arm, right arm, left leg, right leg |
| `face` | {0,…,5} | Cube face direction: front, back, left, right, top, bottom |
| `layer` | {0, 1} | Inner or outer layer |
| `route_role` | {0, 1, 2} | Routing role: directly visible inner, directly visible outer, secondary/backface (seen through transparent outer-layer holes) |
| `surface` | 0…N-1 | Exact surface slot (including composite mapping and geometry fallback faces) |
| `uv` | [0,1]² | Normalized UV coordinates |

The `route_role=2` (secondary surface) case is common with outer-layer skins: transparent regions in hats or jackets allow the renderer to "see through" the outer layer and sample deeper inner-layer surfaces or back-facing faces. These pixels are individually labeled and routed to precise `surface` slots rather than being discarded or forced into the nearest inner surface.

### 0.3 Why the Renderer Cannot Directly Invert Stage-One Images

A natural question arises: the differentiable renderer can already render a 2D image from a UV map with precision (`skin → render`). Could we simply use it to "reverse" the Stage-One output, recovering a UV map from normalized front/back views (`render → skin`)?

The answer is no. The issue is routing ambiguity.

The renderer's precomputed mapping files provide "possible" relationships—for each screen pixel, they list all potential sources: inner head front, outer head front, inner head back, and so on. The UV coordinates of these candidates are precise, but **which candidate to choose** cannot be determined by geometry alone. When a pixel lies in the overlapping region of inner and outer layers, it could originate from three different surfaces—a directly visible inner layer, a semi-transparent outer layer covering it, or a deeper surface seen through an outer-layer cutout. From the rendered result alone, these may be the exact same color.

As an analogy: the mapping file is a detailed transit map listing all destinations reachable from each stop. But it cannot tell you which route a specific passenger should take right now—because the same platform serves inner, outer, and secondary-surface lines simultaneously, and the passengers' clothing (pixel colors) may be entirely identical.

This is the core division of labor that runs through the second half of this article:

- **Renderer** (Section 0.2, Section 3): provides geometric mapping—"where each pixel could come from";
- **Dense UV Parser** (Section 4): performs semantic routing—"where each pixel actually comes from".

Both are indispensable. The renderer frees the system from guessing UV mappings from scratch; the parser enables the system to make informed choices among multiple geometric candidates.

### 0.4 View Configuration

The view system for the renderer and Stage-Two routing model is based on fixed configurations in `differentiable_minecraft_renderer/config.py`. The default views used in production are:

```text
front_left    ← front view, slight walking pose, orthographic projection, inner + outer layers
back_left     ← back view, same as above
```

Key parameters: orthographic projection (`ortho=True`), zoom=0.23, look_at_y=16, walking pose rotation angles (arms ±10°, legs ∓10°). These parameters remain consistent across training, validation, and inference. View names are encoded in checkpoint metadata, and the corresponding mapping files are automatically matched at inference time.

### 0.5 Semantic Backbone and Feature Caching

The semantic branch of the Stage-Two routing model depends on Google's SigLIP2 (`google/siglip2-base-patch16-224`) as a frozen vision backbone. SigLIP2 is not trained, but its outputs must be precomputed and cached before training to avoid running a full forward pass for every batch.

The caching system (`cache_semantic_features.py`) renders front and back views for each skin in the dataset, then extracts two types of features via SigLIP2:

- **Global features** (pooled embeddings): 768-dim vectors per view, consumed by the routing model's global semantic fusion module (see Section 4, MultiViewSemanticFusion);
- **Spatial features** (patch-level features): 768×14×8 tensors per view (256×512 views after ViT patchification, cropped to non-padding regions), consumed by the spatial semantic fusion module (see Section 4, SpatialSemanticFusion).

Both feature types are written in FP16 precision to memory-mapped files (`.bin`), with an index file (`.idx`) recording each sample's offset. For a dataset of 180,000 skins, the spatial feature cache is approximately 58 GiB and the global feature cache approximately 0.5 GiB. During training, only the current batch's slice is read into GPU memory; the full cache does not need to be loaded into RAM. The cache key is jointly determined by dataset path, view configuration, model ID, and sample count; changing any parameter requires rebuilding the cache.

### 0.6 Training Dataset

Training the Stage-Two routing model requires standard 64×64 RGBA skin PNG files. Slim/Alex models (3-pixel arm width) are normalized to the Steve layout (4-pixel arm width) at load time via `alice_to_steve()`. The dataset only requires the skins themselves—training needs no paired control images because all labels are automatically generated by the renderer.

This stands in clear contrast to Stage One: Stage One (image-to-skin generative model) requires paired "real photo → target image" data, where data acquisition is the primary bottleneck; Stage Two (SkingToolkit) has fully automated labeling, where the bottleneck lies in model routing accuracy rather than data annotation.

## 1. Stage One: Converting Arbitrary Reference Images into Normalized Front/Back Views

Stage One uses multi-image reference. Image 1 is the original character to convert; Images 2, 3, and 4 use different skins but maintain exactly the same canvas layout, camera direction, character pose, and model proportions. The multiple templates are not intended to provide the model with more character content, but to repeatedly emphasize the geometric constraints the output must follow while jointly establishing the Minecraft low-resolution visual style. This reduces the probability of the model copying any single template's appearance while minimizing view drift, scale variation, and limb misalignment.

The prompt is designed around two objectives: first, lock down the Minecraft dual-layer player model and its texture resolution; second, lock down the camera, pose, and screen layout; only then request the model to reproduce the character's features within these constraints. The currently used prompt is adapted from the version recommended by DDJ:

```text
Generate a Minecraft depiction of the character in [Image 1].

- The character model must be identical to the Minecraft player model, using a dual-layer structure with inner and outer textures, without additional geometric elements. Texture resolution must not exceed the resolution supported by Minecraft. Reference [Image 2], [Image 3], and [Image 4].

- The generated Minecraft character's dimensions, orientation, pose, camera angle, and screen position must be entirely consistent with [Image 2], [Image 3], and [Image 4].

- Use a solid-color background that is easy to distinguish from the foreground.

- Under the above constraints, reproduce the character in [Image 1] as accurately and completely as possible, including facial features, all clothing, and accessories (excluding held items and capes).
```

In testing, we found that image generation models struggle to reliably follow precise numerical values in prompts. Directly specifying yaw, pitch, FOV, or character pixel dimensions not only fails to guarantee geometric consistency but sometimes increases output variance. Compared to abstract descriptions, the model is better at imitating camera direction, composition ratio, and character pose from reference images. The emphasis at this stage should therefore be on the design of the reference templates.

Templates do not benefit from gratuitous complexity—for instance, adding separate inner/outer layer renders or grid overlays to the template caused the Banana model to produce incorrect output. After multiple rounds of testing, we arrived at a set of rendering templates with relatively high stability, sharing the following characteristics:

- Orthographic projection, no lighting—avoids perspective scaling and shading variations that would interfere with downstream color extraction;
- 1:1 square canvas, front view on the left half and back view on the right half, with a random solid-color background;
- A slight walking pose with small limb swings—provides adequate separation between limbs and torso while avoiding excessive pose variation;
- Except for the undersides of each body part, the vast majority of skin regions are visible in either the front or back view.

![template41|240](/articles/images/template41.png)
![template42|240](/articles/images/template42.png)
![template43|240](/articles/images/template43.png)

## 2. Foreground Extraction

Since Stage One uses templates and prompt guidance to produce characters against clean, high-contrast backgrounds, we can employ a simple strategy for foreground extraction: read the top-left pixel of the image as a background seed and use a flood-fill algorithm to remove regions connected to it whose color difference falls within a tolerance threshold.

There are edge cases where background appears in non-contiguous regions, causing some background colors to leak into the foreground, but such errors are typically corrected in subsequent pipeline stages. If strong accuracy and generality requirements arise in the future, a dedicated segmentation model can be trained.

The flood-fill mask and transparent cutout remain in the original input coordinates. Before geometric routing, the parser's predicted global affine transform aligns the image, dense logits, and foreground mask together into the fixed renderer's canonical coordinates. A binary mask cannot simply be resampled with nearest-neighbor interpolation here: even a small scale error can erase an entire one-pixel hat brim, hair tip, or raised outer-layer silhouette at the back of the head. The current implementation instead resamples the mask as bilinear coverage and preserves a canonical pixel whenever its coverage by the transformed source mask exceeds a very low threshold. Background-color edge checks, grid coverage, and the minimum of 15 valid source pixels per outer texel still reject invalid boundary pixels carried along by this more recall-oriented transform.

Inference saves both coordinate-space views for diagnosis:

- `foreground_cutout.png` and `foreground_mask.png`: the flood-fill result in the original input coordinates, before affine alignment;
- `parser_debug_observed_canonical.png`: the foreground mask actually used after affine alignment and before routing.

The log field `canonical_foreground_coverage_rescued_pixels` reports how many boundary pixels the new method preserves relative to nearest-neighbor resampling. This makes it possible to distinguish pixels that were already missed during foreground extraction from pixels that existed in the correct raw mask but were eroded during geometric alignment.

## 3. Geometry Fitting: Precomputed UV Projection Mapping

After foreground separation, the system performs no pose estimation or keypoint detection of any kind. Instead, it directly projects the known Minecraft Steve geometry onto the image plane using fixed camera parameters. The core data structure for this step is the precomputed UV projection mapping, generated offline by the differentiable Minecraft renderer and saved as `.pt` files.

### 3.1 Mapping File Generation and Structure

The renderer uses camera configurations identical to the Stage-One output—orthographic projection, fixed viewpoint, no lighting, no perspective scaling—to compute the following information for every pixel of the standard Steve model (6 body parts × 6 cube faces × 2 layers = 72 rectangular faces):

- **`inner_uv_map`** (H×W×2): the (x, y) floating-point coordinates of each screen pixel on the inner-layer 64×64 UV atlas. Pixels not falling on any inner surface are `(-1, -1)`.
- **`inner_mask`** (H×W): binary mask indicating whether the pixel is covered by inner-layer geometry.
- **`outer_uv_map`** (H×W×2) and **`outer_mask`** (H×W): the corresponding outer-layer geometry projection, computed using outer cuboids (slightly larger than inner: 9/8× for head, 8.5/8 and 4.5/4× for torso and limbs).
- **Depth-sorted composite mapping**: for pixels covered by both inner and outer layers, provides depth-ordered results from the camera's perspective, enabling the system to distinguish "directly visible inner," "directly visible outer," and "deeper surface seen through a transparent outer-layer hole."

At inference time, these mapping files are loaded together with the Stage-Two routing model's checkpoint. Each view (default `front_left` and `back_left`) has its own set of mappings, and the system automatically matches the correct mapping file based on the view name recorded in the checkpoint.

### 3.2 Projection Process

For each pixel of the input image (front and/or back views), the system performs a table lookup to obtain:

- **`body_part`** (uint8, 0–5): head, torso, right arm, left arm, right leg, left leg. Determined by which part's rectangle region the pixel's UV coordinates fall into within the atlas.
- **`face`** (uint8, 0–5): front, back, left, right, top, bottom. On the UV atlas, the six faces of each part occupy fixed rectangular regions.
- **`layer`** (0 or 1): inner or outer layer. Jointly determined by `inner_mask` and `outer_mask`. When a pixel is covered by both layers, the depth-sorted composite mapping provides the foremost surface's layer.
- **`uv`** ([0,1]² normalized floating-point coordinates): the precise sub-pixel position of this pixel on the 64×64 UV atlas. For outer-layer pixels, UV coordinates are automatically offset to the outer layer's corresponding region.
- **`secondary_surface_candidates`**: when an outer-layer pixel is marked as transparent, the list of deeper surfaces potentially exposed at that location (same inner face or back-facing face).

This projection process is a pure table-lookup operation—it involves no neural network inference, no learnable parameters, and no iterative optimization. The input image resolution is fixed at 256×512 (left half 256×256 front view + right half 256×256 back view), and the mapping files' target dimensions match this. This directly constrains Stage One's output specification: the canvas must be 1:1 square, the front and back character views must occupy the left and right halves respectively, and the camera, pose, and scale must remain consistent with the mapping file's generation configuration.

### 3.3 Boundaries of the Geometry Layer

Geometry fitting determines "which UV texels each pixel could come from," but it cannot independently resolve the following:

- Whether the pixel currently displays inner skin or outer clothing—when two layers overlap in screen space, geometry alone cannot adjudicate layer assignment;
- Regions of uniform color crossing multiple body part boundaries—for example, when the face and neck share the same color, the color gradient provides no segmentation cue, requiring the geometric prior to narrow the candidate parts and semantic routing to make the final judgment;
- Inner-layer pixels exposed through transparent outer-layer cutouts may have their precise UV texels coming from multiple candidate surfaces—resolving this requires exact surface slot classification.

These are precisely the responsibilities of the next section, Dense UV Parser.

## 4. Dense UV Parser: Model Architecture and Training for Semantic Routing

The geometry layer provides part assignment, surface direction, and UV coordinate candidates for each screen pixel, but it cannot reliably resolve one critical question: whether the current pixel shows inner-layer skin, outer-layer clothing, or a deeper surface seen through a transparent outer-layer region (secondary surface). The Dense UV Parser is a supervised neural network specifically designed for this routing decision.

### 4.1 Network Architecture

The parser's backbone is a U-Net-style fully convolutional network (`DenseUVParserNet`) that accepts fixed-size RGB input and outputs dense per-pixel predictions. The architecture is as follows:

**Encoder–Decoder Backbone**

| Stage | Operation | Input Channels | Output Channels | Spatial Size (H×W) |
| :--- | :--- | :--- | :--- | :--- |
| Input concat | view one-hot concat | 3 + V | 3 + V | 256×512 |
| stem | ConvBlock (3×3→3×3, GN+SiLU) | 3 + V | 32 | 256×512 |
| down1 | Conv2d (k4s2) + ConvBlock | 32 | 64 | 128×256 |
| down2 | Conv2d (k4s2) + ConvBlock | 64 | 128 | 64×128 |
| down3 | Conv2d (k4s2) + ConvBlock | 128 | 256 | 32×64 |
| mid | ConvBlock (3×3→3×3, GN+SiLU) | 256 | 256 | 32×64 |

Where V is the number of view classes (default 2, corresponding to front and back views). Each view is encoded as a one-hot vector, broadcast to the same height and width as the input image, and concatenated with the RGB channels. This enables the parser to distinguish between pixels that look identical in RGB but have different spatial meanings in the front vs. back view—for instance, a solid-color skin's chest and back may be RGB-identical, but the view condition maps them to different UV regions.

**Decoder (with skip connections)**

| Stage | Operation | Input Channels | Skip Connection | Output Channels | Spatial Size |
| :--- | :--- | :--- | :--- | :--- | :--- |
| up2 | bilinear upsample + ConvBlock | 256 | s2 (128ch) | 128 | 64×128 |
| up1 | bilinear upsample + ConvBlock | 128 | s1 (64ch) | 64 | 128×256 |
| up0 | bilinear upsample + ConvBlock | 64 | s0 (32ch) | 32 | 256×512 |
| features | Conv2d (3×3) + SiLU | 32 | — | 32 | 256×512 |

All upsampling layers use bilinear interpolation (`align_corners=False`). Skip connections concatenate the encoder's corresponding feature maps with the upsampled result along the channel dimension before feeding into ConvBlock.

**Semantic Fusion Modules**

The parser integrates two optional semantic branches, both using frozen SigLIP2 (`google/siglip2-base-patch16-224`) as the vision backbone:

1. **MultiViewSemanticFusion (global semantics)**: receives SigLIP2 pooled embeddings for the front/back views (768-dim each) and fuses them into the bottleneck features through the following pipeline:
   - LayerNorm + Linear projection of each view's 768-dim embedding to 128-dim (GELU activation);
   - Addition of a learnable view embedding (128-dim) per view;
   - Passage through 1 TransformerEncoderLayer (`d_model=128, nhead=4, dim_feedforward=512, batch_first=True, norm_first=True`) for cross-view attention;
   - Mean pooling over the sequence to obtain a global summary, concatenated with each view token into a 256-dim vector;
   - FiLM modulation: the 256-dim vector passes through LayerNorm + Linear(256→256) + GELU + Linear(256→512), producing scale and shift vectors of 256-dim each, applied to the mid block's bottleneck feature map (`x = x * (1 + scale) + shift`).

   A critical initialization strategy: the final Linear layer's weights and biases are initialized to zero, so that FiLM modulation contributes nothing at the start of training. The parser's initial output is driven entirely by geometric supervision. Semantic corrections must be learned from supervised routing errors during training, rather than interfering with the geometric solution at initialization.

2. **SpatialSemanticFusion (spatial semantics)**: receives SigLIP2 patch-level spatial features for the front/back views (each 256×512 view is ViT-patchified to 14×8 patches, 768-dim per patch), fused through the following pipeline:
   - LayerNorm normalization (over the channel dimension);
   - 1×1 convolution (768→64) projection + GELU;
   - 1×1 convolution (64→256) output as bottleneck residual, bilinearly upsampled to 32×64;
   - The residual is added directly to the mid block output.

   Also uses zero initialization: the second 1×1 convolution's weights and biases are zero, ensuring spatial semantic features contribute nothing to the geometric solution at the start of training.

**Prediction Heads**

From the 32-channel feature map, after `feature_dropout` (`Dropout2d, p=0.10`, enabled during training only, automatically disabled for preview and inference), the parser produces the following predictions in parallel:

| Prediction Head | Output Channels | Meaning |
| :--- | :--- | :--- |
| `foreground` | 1 | Foreground logits (foreground probability after sigmoid) |
| `layer` | 3 | Routing role logits: inner(0), outer(1), secondary/backface(2) |
| `part` | 6 | Body part classification (non-`geometry_only` mode) |
| `face` | 6 | Cube face classification |
| `layer_face` | 12 | Layer × face joint classification |
| `uv` | 2 | Normalized UV coordinate regression (sigmoid to [0,1]) |
| `uv_x` / `uv_y` | 64 / 64 | Discrete UV coordinate classification (64 classes per axis, matching the 64×64 atlas) |
| `surface` | variable | Exact surface slot classification (including composite and geometry fallback faces) |
| `route_confidence` | 1 | Probability that the current routing decision is correct (after sigmoid) |

Additionally, the global semantic summary (`semantic_summary`) outputs part-level attributes through two linear heads:
- `outer_presence_logits` (6 classes): whether each body part has an outer layer;
- `outer_coverage` (6 classes, after sigmoid): approximate outer-layer coverage ratio [0,1] per part.

**Learned Fixed-View Route-Role Spatial Prior**

This is an independent learnable parameter tensor of shape `[view_classes=2, layer_classes=3, H=32, W=16]`. It encodes the statistical likelihood, learned from a large number of training samples, that each spatial region in the front and back views belongs to inner, outer, or secondary surface. At inference time, this prior is selected by view index, bilinearly upsampled to the same spatial size as the `layer` output, and added directly to the `layer` logits. During training, it is randomly dropped for 10% of samples (per-sample), with logit values capped to `[-1.5, 1.5]` via `tanh`, and regularized with L2 and total-variation penalties to maintain smoothness. This design makes the prior a soft statistical bias—providing gentle guidance for common structures (such as bangs at the top-front of the head, or outer-layer distribution around hat brims), while the image-conditioned CNN can override it for uncommon skins.

### 4.2 Training Supervision and Loss Functions

Training labels are generated entirely automatically by the differentiable Minecraft renderer. For each GT skin, the renderer renders RGBA images for each configured view (front/back) and simultaneously records the source information for each screen pixel—part index, surface direction, layer (inner/outer/secondary), and exact UV coordinates. No manual per-pixel annotation is required.

The loss function (`DenseUVParserLoss`) is composed of the following weighted components:

**(1) Foreground Loss** (λ=1.0)
- BCE with logits, with positive sample weight dynamically computed as `pos_weight = neg_count / pos_count`, capped at 20.0.
- Dice loss: `1 - (2*|pred ∩ target| + 1) / (|pred| + |target| + 1)`.

**(2) Route-Role Loss** (λ=1.0)
- Balanced cross-entropy: class weights normalized by `1/sqrt(count)` of valid pixels per class, with inner class weight floor 0.75 and outer class weight cap 0.90 (preventing the rare outer class from dominating gradients).

**(3) Outer False-Positive Loss** (λ=1.0, focal γ=3.0)
```
L_fp = E[ p_outer^γ * (-log(1 - p_outer)) ]   for pixels where target ≠ outer
```
Design intent: penalizing "inner pixels misclassified as outer" more heavily than "outer pixels missed." In UV reconstruction, a single wrong outer texel permanently occludes the correct inner texel, while a missed outer texel merely leaves a transparent gap (which can be filled later).

**(4) Outer False-Negative Loss** (λ=0.75, focal γ=2.0)
```
L_fn = E[ (1 - p_outer)^γ * (-log(p_outer)) ]   for pixels where target = outer
```
Lower γ than false-positive loss, reflecting the asymmetric design principle of "prefer a missed detection over a false alarm."

**(5) Primary Route Swap Loss** (λ=1.0, focal γ=2.0)
```
L_swap = 0.5 * (L_inner + L_outer)
L_role = E[ (1 - p_correct)^γ * (-log(p_correct)) ]   computed separately for role ∈ {0,1}, then averaged
```
This is a macro-averaged loss: compute the mean loss for inner and outer classes separately, then average the two. Unlike ordinary pixel-count-weighted cross-entropy, macro-averaging ensures the minority class (outer) is not drowned out by the gradient of the majority class (inner).

**(6) Projected Texel Consistency Loss** (λ=0.25)
For multiple source pixels that project to the same GT UV texel, computes the variance of their routing probabilities, requiring consensus. Grouping key is `(batch_item, GT_role, flat_uv_index)`. Only computed for texels with multiple source pixels, avoiding vacuous loss on single observations.

**(7) Visible Outer-Candidate Alpha Supervision and Cross-View Consistency** (λ=0.50)

Per-pixel route labels supervise only the surface that is ultimately visible; by themselves, they do not directly constrain a geometric candidate that should be transparent but is incorrectly classified as outer. Training therefore projects every view's outer candidates back into the 64×64 atlas and supervises `p_outer` with ground-truth outer alpha:

- GT alpha=1 means that the outer texel exists and should be preserved;
- GT alpha=0 means that the candidate should be transparent, penalizing inner skin, eyes, face pixels, or background that are incorrectly routed to the outer layer.

Single-view visibility supervision and cross-view consistency have deliberately different coverage. For the current 256×512 `front_left + back_left` mappings, each view directly observes 607 outer texels. Their union contains 1,136 texels—69.6% of the full 1,632-texel outer atlas—while their intersection contains only 78, or 6.9% of the visible union (4.8% of the full outer atlas). Consequently:

- alpha supervision covers all 1,214 per-view candidate observations, corresponding to 1,136 unique visible outer texels;
- only the probability-disagreement term is restricted to the 78 texels visible in both views;
- a texel no longer needs to be shared by both views, so single-view regions such as the face, eyes, and back of the head receive positive and negative outer-layer supervision.

To suppress the remaining high-confidence inner→outer mistakes, the highest-loss 20% of transparent outer candidates are mined as hard negatives and added with an internal weight of 0.75. Training logs report union coverage, intersection ratio, visible-negative count, and hard-negative count so that actual supervision coverage is visible rather than hidden behind a total loss.

**(8) Route Confidence Loss** (λ=0.25)
BCE with logits, target = `(predicted_role == GT_role)`. For secondary pixels, surface classification must also be correct.

**(9) Route Prior Regularization** (λ=0.001, TV weight=1.0)
`L_prior = ||prior||₂² + 1.0 * TV(prior)`, where TV is total-variation over the spatial dimensions (mean squared first-order differences along horizontal and vertical axes).

**(10) Auxiliary Losses**
- `part` cross-entropy (λ=0.5)
- `face` cross-entropy (λ=0.5)
- `layer_face` balanced cross-entropy (λ=1.0)
- `uv` smooth L1 regression (λ=0.25)
- `uv_x / uv_y` discrete classification cross-entropy (λ=1.0)
- `surface` balanced cross-entropy (λ=1.0)
- `affine` translation / log-scale smooth L1 (λ=1.0, only when enabled)

**Differentiable Soft-UV Splatting and Multi-View Rendering Losses**

Beyond the supervised classification losses above, training includes a differentiable branch: the parser's routing and surface probabilities are soft-splatted onto a 64×64 UV atlas to produce a provisional skin texture, which is then re-rendered through the differentiable renderer back to the configured views. Soft-UV RGB error (λ=0.25), soft-UV alpha error (λ=0.35), inner/outer visible texel recall (λ=0.50 each, with 50% of the weight concentrated on the worst 10% of texels), multi-view rendering RGB error (λ=0.20), and multi-view rendering alpha error (λ=0.25) are all added as loss terms. Wrong routing decisions receive both color and silhouette gradients through these differentiable rendering losses, providing complementary signals to the classification supervision.

All soft-UV and rendering loss λ values can be set to 0, in which case training reduces to pure classification supervision. Inference always uses hard routing (argmax + grid-based color extraction, see Section 5), involving no soft splatting or differentiable rendering.

### 4.3 Training Configuration

| Item | Value |
| :--- | :--- |
| Optimizer | AdamW |
| Learning rate | 2e-4, cosine decay to 5% (`min_lr_ratio=0.05`) |
| LR schedule | Based on absolute epoch; safe to resume from any checkpoint |
| Batch size | 32 skins, expanded into 64 256×512 view tensors before entering the parser |
| Training epochs | 1 (sufficient convergence on large datasets) |
| Regularization | `feature_dropout=0.10` (Dropout2d, training only); frozen SigLIP2 vision tower |
| Semantic cache | SigLIP2 spatial features (768×14×8 per view) stored as FP16 mmap; ~58 GiB for 180K samples; only current batch read into GPU memory |
| Outer-candidate supervision | Visible-union alpha supervision λ=0.50; shared-view disagreement weight 0.25; hardest 20% transparent candidates weighted 0.75 |
| Default random mode | `SEED=1234, REPRODUCIBLE=false, CUDNN_BENCHMARK=true`; initialization, split, shuffle, and augmentation follow the seed, but CUDA results are not guaranteed bitwise identical |
| Strict reproducibility mode | `REPRODUCIBLE=true` disables cuDNN benchmark and Flash Attention and requests deterministic CUDA algorithms; `STRICT_DETERMINISM=true` aborts on an unsupported operation, at a substantial speed cost |
| Checkpoint selection | Best by `loss_hard_uv_color_selection` (hard-routed inner/outer IoU + RGB MAE), preventing sparse or miscolored UVs from winning due to inflated occupancy precision |

### 4.4 Inference Routing and Gating

At inference time, the parser's soft probability outputs pass through multiple gating layers before becoming final hard routing decisions:

1. **Projected-texel consensus and asymmetric outer admission**: each source pixel's routing probability is center-weighted and voted into its projected UV texel. The final per-texel probability is a soft blend of the local pixel probability (40%) and the texel-level aggregate score (60%). Every ordinary outer decision must pass both local outer evidence (confidence ≥0.80, margin ≥0.35) and fused texel evidence (confidence ≥0.80, margin ≥0.35); a high-confidence raw outer prediction can no longer bypass consensus. If fused inner evidence clearly wins, the candidate is changed to inner. If outer still leads but does not reach the admission thresholds, it retains its outer UV identity while the observation is marked unknown, preventing an uncertain color from being written incorrectly into either the inner or outer atlas. The log fields `consensus_outer_to_inner_pixels`, `consensus_outer_gate_rejected_pixels`, and `consensus_outer_gate_deferred_pixels` report these outcomes separately.

2. **Cross-view outer-visibility check**: for the 78 shared outer texels, a conflict is formed when one view strongly supports outer while another view clearly observes background or a high-confidence inner route at the same texel. The candidate is then vetoed. This rule applies only where shared evidence actually exists; it does not use the back view to overrule eyes or clothing patterns visible only from the front.

3. **Conservative outer gating** (default `conservative` profile):
   - Outer confidence ≥ 0.80, inner-outer margin ≥ 0.55;
   - Outer footprint coverage ≥ 0.25;
   - Minimum 15 valid source pixels per outer texel;
   - Background-edge pixels (color difference from detected background ≤ 8/255) are excluded.

4. **Geometry rescue**: when a texel's source pixels lie in an outer-only silhouette region (`outer_mask > 0` and `inner_mask == 0`), or are routed to a precise secondary/backface surface slot, gating relaxes to confidence ≥ 0.60, margin ≥ 0.25, coverage ≥ 0.10. Precise geometric evidence can rescue an observation deferred by the outer-admission thresholds.

5. **Semantic rescue**: when the parser predicts high part-level `outer_presence` and `outer_coverage`, the downstream confidence and coverage gates may be relaxed for outer observations that have already passed texel admission. This broad part-level semantic signal cannot bypass the fused texel gate, preventing “the head contains a hat or hair” from being interpreted as “all eyes and face pixels should be outer.”

The default configuration is precision-first: the conservative profile prioritizes correctness of output outer texels over maximizing their quantity. Outer pixels that fail gating remain transparent in the UV atlas—deterministic repair never fabricates outer-layer texels.

Debug images now explicitly distinguish pre-transform and post-transform state. `parser_debug_face_raw.png` and `parser_debug_layer_face_raw.png` use head logits in the original input coordinates together with the unwarped flood mask, so affine alignment and later routing filters can no longer create misleading holes in the “raw” views. `parser_debug_face.png`, `parser_debug_layer_face.png`, and the routed overlays instead reflect final hard routing in canonical coordinates. When diagnosing a failure, compare the raw head output with `parser_debug_observed_canonical.png` first, then inspect the final routed outputs.

## 5. UV Reconstruction

Even when part and layer routing are correct, color sampling can still go wrong. Early approaches used texel centers, weighted averaging, or continuous RGB regression: when projection has slight offsets, the center point can land on an adjacent cell; when a grid cell contains both foreground and residual background, averaging produces intermediate colors that never existed in the input; generative models may then push these colors further into high-saturation regions.

The current default `grid_mode` directly counts the real 8-bit RGB values of safe source pixels within each fitted grid cell and selects the most frequent color. It has the following properties:

- Output colors are guaranteed to come from the input image, not from regression or averaging;
- UV-center distance only breaks ties when multiple colors have equal support;
- Interior character pixels are preferred over boundary pixels;
- Boundary residuals close to the background color are excluded;
- Outer texels require a sufficient number of valid source pixels, preventing a small number of background fragments from becoming prominent second-layer skin.

This step embodies the most important change in the new workflow: **for observed colors, the system performs evidence aggregation, not image generation.**

Routing thresholds are also no longer tuned for a single "higher is better" criterion. An outer threshold that is too low misclassifies inner layers or background as outer; one that is too high removes real bangs, hat edges, and leg second-layer skin. A more robust approach jointly uses classification confidence, inner-outer margin, geometric coverage, part-level outer presence probability, source pixel count, and multi-view consistency, monitoring outer precision and recall separately.

## 6. Greedy Topology Repair: Fix the Inner Layer, Leave the Outer Layer Untouched

The Dense UV Parser's final output is a partial UV map (output file `parser_pred_uv.png`): only texels whose routing and color can be determined from the front/back views are written; all other regions remain transparent. Invisible inner texels—such as the top of the head, soles of the feet, and sides of the torso—are therefore left empty. Before introducing more complex generative completion, we added a fully deterministic repair strategy to quickly obtain a baseline result and expose the parser's true upper bound.

The core principle is straightforward:

> **Only repair the inner skin layer; leave the outer layer untouched. All colors must come from confirmed texels within the same body part. No new colors are created. No cross-part copying.**

### Fill Order: By Minecraft Topology, Not UV Coordinate Order

The repair does not simply traverse by increasing UV x, y coordinates. Adjacent UV coordinates are not necessarily adjacent in 3D space—for example, the front and back of the head are separated on the UV map by the top and bottom head faces, but they are tightly adjacent in 3D. The fill order is therefore defined per body part according to its topological structure:

1. **Front and back faces (face 0 and face 1)**: fill ring by ring from the border inward. The outermost ring is repaired first, then progressively inward. This ensures colors diffuse from known regions toward the unknown center while preserving the natural continuity of the texture.

2. **Left and right faces (face 2 and face 3)**: fill row by row from both edges toward the middle. Within the same row, same-row known colors are preferred before falling back to a 3D nearest neighbor. This avoids absurd situations like a torso or arm side "borrowing" color from the top of the head.

3. **Top and bottom faces (face 4 and face 5)**: likewise fill ring by ring from border to center.

### Repair Decision: Symmetry First, 3D Nearest Neighbor as Fallback

For each missing inner texel, the algorithm attempts to fill it in the following priority order:

1. **Mirror symmetry first**: check whether the left-right mirrored texel is already defined. Minecraft skins are highly bilaterally symmetric—if the left side of the face has a confirmed color, the right side almost certainly has the same color. Mirror matching is based on 3D world coordinates, not UV pixel coordinates.

2. **Same-part 3D nearest neighbor**: if the mirrored position is also unknown, find the nearest defined texel in canonical 3D space within the same body part. Unlike simple Manhattan distance on the UV map, 3D spatial distance correctly handles cross-face adjacency—for example, a texel on the right edge of the head front face is adjacent in 3D to a texel on the head right face, even though they may be far apart on the UV map.

3. **Row-priority strategy**: for left and right faces, prefer sources in the same row. This preserves horizontal texture continuity—a belt or cuff should wrap uniformly around an arm rather than breaking at different heights.

4. **Cascading propagation**: newly filled inner texels can immediately serve as sources for subsequent positions on the same part. This means if only a small patch of the arm front is known, it can progressively propagate outward rather than every vacancy fetching color from the same single source.

5. **Strict no-cross-part rule**: never copy the nearest color across body parts—head to torso, torso to arm, etc.—just to fill the UV map.

6. **Safe fallback**: if neither the mirrored position nor any same-part source is available, the texel remains transparent.

### Outer Layer Preservation

The repair algorithm never creates, deletes, or modifies any outer-layer texel. Confirmed outer texels can serve as color evidence for inner-layer texels (e.g., an arm's outer-layer color can propagate to the same arm's inner-layer vacancy), but the reverse never holds—inner-layer colors never affect the outer layer.

### Value of Deterministic Repair

This algorithm, corresponding to the `simple_inpainting` module in the codebase (output file `parser_pred_uv_simple_inpainting.png`), does not understand clothing design and cannot generate truly invisible complex patterns (such as text on a character's back or hidden tattoos). Its value lies precisely in being explainable and reproducible:

- If simple inpainting already produces good rendering results, it indicates that the parser's observation coverage and color fidelity are largely correct, and the remaining issues lie in invisible regions—exactly the part that topology-aware completion needs to address.
- If simple inpainting diffuses large areas into a single color, it indicates that the part has too little usable evidence, requiring improvements in view coverage, routing recall, or the downstream generative model—not hoping the completion model will "guess" a reasonable result.
- If head repair is correct but arm repair shows cross-part contamination, the topology definition itself can be traced and corrected.

In the full workflow, the deterministic repair result (`parser_pred_uv_simple_inpainting.png`) and the final output 64×64 skin file (`pred_uv.png`) are both preserved, allowing comparison between deterministic repair and future generative completion. In the current version, the final skin is taken directly from deterministic repair—no generative completion model has been connected yet—so inference with a fixed checkpoint and runtime contains no stochastic generation step. This is distinct from the default fast training mode, whose CUDA numerics are not bitwise deterministic.

## 7. Current Limitations

The new workflow improves the quality of generated skins, but it has clear boundaries:

- **Dependence on normalized viewpoints.** The current geometric mapping targets fixed front/back views; significant deviations in pose, perspective, or scale will reduce accuracy.
- **Currently Steve-arm-centric.** Slim arms require a simple client-side conversion tool; this typically does not affect the low-resolution expression.
- **Stage One currently depends on a closed-source model.** This limits the full pipeline's reproducibility, cost control, and independent iteration capability; the current strategy treats it as a data cold-start and approach validation tool, not the final architecture.
- **Stage One errors propagate forward.** Back-side hallucinations, missing accessories, and incorrect character proportions cannot be automatically recovered through UV inverse projection.
- **Same-color adjacent structures still carry semantic ambiguity.** In unlit renders, the face, chin, and neck may have no visible seams, requiring joint judgment from geometric position, fixed-view priors, and global semantics.
- **Outer-layer routing remains the hardest classification.** Outer-layer geometry is only marginally larger than inner-layer; small boundary offsets can cause inner/outer swaps; transparent outer layers also expose deeper surfaces. The current approach still exhibits inner/outer routing errors and asymmetries.
- **Truly invisible textures have no unique answer.** Deterministic repair can only propagate existing colors within the same part; it cannot recover patterns that were never shown in the reference image.

## 8. Summary

This article has presented a two-stage Minecraft skin generation workflow: Stage One converts an arbitrary character reference image into normalized front/back rendered views; Stage Two reconstructs a 64×64 RGBA UV map from those renders through geometry fitting, semantic routing, grid-based color extraction, and deterministic topology repair.

Stage Two follows an explicit priority: steps solvable by geometry do not invoke learned models; steps where color can be taken directly from the input do not invoke generation. Specifically:

- Foreground extraction uses deterministic flood fill, with no probabilistic thresholding on model outputs;
- Pixel-to-UV mapping is provided by precomputed geometric projections, using no pose estimation or deformable alignment;
- Inner/outer/secondary surface routing is handled by the Dense UV Parser via supervised learning, with training labels automatically generated by the renderer;
- Visible texel colors are taken as the mode of real pixels within each input projection grid cell, using no regression or generative infilling;
- Invisible inner texels are propagated within the same body part by topology-aware deterministic rules—no new colors are created and no cross-part copying occurs.

The benefits of this approach manifest at three levels: visible-region colors are traceable to specific pixels in the input, with a complete evidence chain; the error mode of each processing step can be independently evaluated and localized; the geometry, semantic, and repair modules can each be upgraded or replaced independently without affecting the rest of the pipeline.

The main current limitations are the Stage One dependency on a closed-source image model and the absence of a generative completion module in Stage Two for handling truly invisible texture regions. Future work will proceed along two directions: continuously accumulating "original image → normalized render → UV skin" triples to train a Stage One model that does not depend on any closed-source model; and, once parser evidence quality reaches the required level, introducing topology-constrained, parser-confidence-conditioned generative completion to fill in the invisible regions.

## References and Further Reading

- [From Reference Image to Minecraft Skin: A Generative Model Training Practice](/public/blog/skingen): our previous work, covering the image-to-image LoRA and composite target image approach.
- [Minecraft Wiki: Skin](https://minecraft.wiki/w/Skin): Minecraft skin UV, inner/outer layer, and transparency documentation.
- [SigLIP 2: Multilingual Vision-Language Encoders with Improved Semantic Understanding, Localization, and Dense Features](https://arxiv.org/abs/2502.14786): the frozen vision semantic backbone used by the current parser.
- [BLOCK: An Open-Source Bi-Stage MLLM Character-to-Skin Pipeline for Minecraft](https://arxiv.org/abs/2603.03964): an open-source two-stage approach using front/back preview synthesis and a generative atlas decoder.

## Participate and Project Links

- Online generator: [https://entropydrop.com/skin/generate](https://entropydrop.com/skin/generate)
- Hugging Face model: [https://huggingface.co/EntropyDrop/Sking](https://huggingface.co/EntropyDrop/Sking)
- GitHub: [https://github.com/EntropyDrop](https://github.com/EntropyDrop)
- Discord: [https://discord.gg/ByX7TwqDcw](https://discord.gg/ByX7TwqDcw)
