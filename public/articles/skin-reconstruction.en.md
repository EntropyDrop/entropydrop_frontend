# From Rendering to Reconstruction: A New Workflow for Image-to-Minecraft-Skin

**Author: EntropyDrop Dev Team**
**Published: July 25, 2026**

**Updated: September 8, 2026 · SkingToolkit v104**


> Updated against SkingToolkit `v104` commit [`43e676d`](https://github.com/EntropyDrop/SkingToolkit/commit/43e676d8231fd3417d86721edb4ef4cef3dda40d). v104 is a reviewed candidate with known limitations and has not replaced the global default model.

## Preface

In the previous article *[From Reference Image to Minecraft Skin: A Generative Model Training Practice](/public/blog/skingen)*, we introduced a technical approach centered on an image-to-image model: first convert a reference image into a composite target image containing both a UV map and multi-view renders, then extract a 64×64 skin through post-processing. This approach demonstrated that large models can learn the mapping between character features, pixel art style, and Minecraft skins. However, it also encountered a clear bottleneck.

The model often learned only visual approximations without genuinely comprehending the graphics on clothing—rockets, bears, text, or badges. When faced with such details, it tended to naively downscale high-resolution patterns, producing results akin to ordinary downsampling: details gradually vanished, colors bled into one another, and the edges of key silhouettes became blurred. An ideal low-resolution expression should first understand the meaning and most distinctive structure of a graphic, then reorganize that information within a limited pixel budget—not simply compress the original image.

To temporarily bypass this bottleneck while continuing to validate the downstream UV recovery pipeline, we reluctantly introduced a closed-source image model as an auxiliary, splitting image-to-skin into two stages: Stage One converts an arbitrary character image into structurally fixed Minecraft front/back renders; Stage Two reconstructs the skin UV map from those renders. The closed-source model is not the final architecture we intend to depend on long-term. One of the key goals at this stage is to continuously collect screened and verified "original character image → normalized render → UV skin" triples, so that we can eventually train an image-to-skin model that does not depend on any closed-source model.

The current pipeline is: normalized front/back views → learned foreground extraction → fixed-view geometry and semantic routing → initial UV and inner completion → final head UV decoding → material refitting → 64×64 RGBA skin.

The images below are retained as illustrations of the earlier workflow and its intermediate artifacts. They are not v104 comparisons or test results; Sections 4 and 5 describe the added head decoder and material stages.


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

Earlier workflow: re-render

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

## 0. Foundations: Renderer, Geometry, and Training Labels

### 0.1 Project Relationships and Rendering

`differentiable_minecraft_renderer` and `mc_skin_utils` provide the Minecraft mesh and camera configuration. SkingToolkit loads precomputed mappings for differentiable rendering, geometric lookup, and UV reconstruction. The Steve model has 6 parts, 6 faces per part, and 2 layers: 72 rectangular faces in total.

The offline `generate_mappings.py` script creates pixel-to-UV candidate mappings for each fixed view. The main data are:

| Mapping | Meaning |
| :--- | :--- |
| `inner_uv_map` / `inner_mask` | Inner-layer candidate UV coordinates and projected coverage |
| `outer_uv_map` / `outer_mask` | Outer-layer candidate UV coordinates and projected coverage |
| `outer_uv_layers` / `outer_masks` | Depth-sorted outer-layer candidates |
| `composite_uv_layers` | Composite inner/outer candidates with layer identity |
| `geometry_uv_layers` / `geometry_masks` | Geometric candidates for every rectangular face, supporting precise surface routing |

`DifferentiableRenderer` in `SkingToolkit/renderer.py` loads these grids and masks, samples a 64×64 skin through `F.grid_sample`, and composites by depth and alpha. During training, it generates renders and supervision from known UVs. During inference, it provides geometric candidates and re-renders the final UV during head material fitting to measure color error against the input.

### 0.2 Why Geometry Alone Cannot Determine the UV

A screen pixel may correspond to directly visible inner skin, an outer layer covering it, or a secondary surface seen through an outer-layer opening. Geometry enumerates these candidates but cannot determine the layer of the observed color from position alone. Similar-colored face, beard, and headphone edges are particularly ambiguous.

The renderer therefore answers “where could this pixel come from,” while the parser estimates its source from image evidence. For synthetic data, known ground-truth skins let the renderer provide foreground, part, face, layer, secondary-surface, and UV labels directly. For real generated images, the model still has to infer these assignments.

### 0.3 Fixed Views and Semantic Features

v104 retains the ordered `front_left`, `back_left` input pair. Templates use orthographic projection, fixed scale, and a slight walking pose. A combined input is split into left and right images along its width; each view is then resized to its mapping dimensions. The original composite size and the individual view tensor size are separate concepts. View order, cameras, and mappings must match the checkpoint.

The base Dense UV Parser uses frozen SigLIP2 features (`google/siglip2-base-patch16-224`). `MultiViewSemanticFusion` integrates global front/back context into the U-Net, while `SpatialSemanticFusion` supplies local patch features. Base training can precompute FP16 mmap caches to avoid repeated backbone passes. v104 fine-tuning primarily uses cached automatic UVs and image evidence from the frozen parent pipeline, updating only the final head decoder.

### 0.4 Automatic Labels and Real Local Annotations

Standard training inputs are 64×64 RGBA skins. Slim/Alex skins can be normalized to Steve through `alice_to_steve()`. Native skins supply ground-truth color and alpha; procedurally authored hair, beards, hats, glasses, and headphones also provide explicit semantic and material-relation labels.

Rendered supervision remains the main source, but v104 also includes local annotations from three existing real identities. Confirmed regions have explicit targets; other regions use reviewed earlier outputs for consistency training. Unannotated native textures retain unknown semantics. Color alone does not establish a class, and teacher predictions are not human ground truth. Section 7 details the data splits and evaluation scope.

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
- Front/back views cover the main visible surfaces, but regions such as the head underside lack projection evidence; transparent outer layers and occlusion further limit actual observations.

![template41|240](/articles/images/template41.png)
![template42|240](/articles/images/template42.png)
![template43|240](/articles/images/template43.png)

## 2. Foreground Extraction: Separate Silhouette from Color Sources

Early versions used flood fill from a top-left background seed. This works on clean solid backgrounds but struggles with enclosed holes, clothing close to the background color, and thin hat brims. The paired v104 pipeline uses a separate BiRefNet foreground model fine-tuned on Minecraft renders, freezing its pretrained backbone and training only the decoder. Its version is pinned separately from the UV parser.

Foreground training uses 4,096 training, 128 validation, and 128 test skin identities, separated by normalized RGBA content hashes. Synthetic backgrounds include near-foreground colors, gradients, noise, and checkerboards, alongside JPEG degradation and border-touching crops. Selection uses validation before evaluation on the held-out test set.

Inference retains two masks with different purposes:

| Purpose | Condition | Reason |
| :--- | :--- | :--- |
| Character silhouette | Foreground probability ≥ 0.50 | Preserve thin brims, hair tips, and accessory geometry |
| UV color sources | Foreground probability ≥ 0.98, with a 1-pixel inset at parser resolution | Keep background-contaminated boundary RGB out of the skin |

The stricter color mask does not directly erase thin silhouette geometry. It excludes unreliable samples; it does not guarantee physically separated foreground color at every boundary. Generic code still supports flood fill, but that path does not describe the complete paired v104 candidate.

## 3. Geometry Fitting: Fixed Candidates and Coordinate Alignment

With known cameras, Steve geometry, and front/back ordering, the system looks up each pixel's possible part, cube face, layer, and UV. It does not need to estimate a skeleton in an arbitrary pose, but it must still handle position and scale differences between generated templates and canonical projections.

Input RGB, predicted logits, and foreground masks must enter canonical coordinates consistently. Mask transforms use coverage information to preserve thin silhouettes, while color extraction still requires confident foreground and enough source pixels. Rejecting background should not erase a real brim during alignment. Additional affine refinement is controlled by the paired pipeline; fixed geometry does not mean the entire inference process is free of learning or optimization.

Candidates distinguish direct inner, direct outer, and secondary/back-facing surfaces. Transparent outer layers expose deeper faces. Forcing these pixels onto the nearest inner surface can put beard edges or the back of a hat in the wrong UV location. Geometry narrows the candidates; semantic evidence chooses among them.

## 4. From Base Routing to Final Head UV Decoding

### 4.1 The Base Dense UV Parser

`DenseUVParserNet` remains a U-Net with skip connections. RGB and view one-hot channels enter a 32 → 64 → 128 → 256-channel encoder, followed by upsampling to dense features. Frozen SigLIP2 global and spatial features provide context, while a learned fixed-view prior adds a soft bias to routing logits.

Base predictions cover foreground, part, cube face, inner/outer/secondary routing, UV coordinates, precise surface slots, and routing confidence. Training combines classification, UV regression, false-outer penalties, projected-texel consistency, and differentiable soft-UV and multi-view rendering losses. Inference uses geometric candidates, confidence, coverage, and source-pixel evidence to produce the initial UV.

Earlier experiments also include optional projected outer occupancy and component-rescue modules. Their activation cannot be inferred from class names or generic launcher defaults: reproducing a version requires its paired pipeline. The new v104 head topology module belongs to the final decoder and is distinct from the base parser's optional occupancy branch.

### 4.2 Joint Head Semantics: Face, Hair, and Accessories

Starting with v102, one 14-class distribution represents abstention/unknown, face, inner/outer hair, inner/outer beard, glasses, headphones, inner/outer hat bodies and bands, brim, and crown. Joint attention combines the front and back head features of the same character.

This addresses the structural conflict in which independent classifiers can both confidently label a pixel as face and crown. The revised v103 further derives final UV semantics and outer occupancy from the same categorical distribution. For an outer query, inner-class probability counts as evidence of outer absence; recognizing inner hair must not imply that an outer texel should be added.

The latest candidate retains two reviewed adjustments: disabling whole-head geometry pruning that had deleted valid hair (`joint_head_geometry_mode=disabled`), and limiting learned face reassignment to beards (`head_surface_routing_scope=beard`) so hair retains its original geometric route. Hats, crowns, and headphones retain their semantic and material handling.

### 4.3 FinalHeadUVDecoder: Supervise the Actual Output

Better screen-pixel classification does not guarantee a final UV without holes, wrong layers, or color contamination. `FinalHeadUVDecoder` therefore reads the automatic UV and front/back image evidence directly, modeling 768 valid head texels: 6 faces × 8×8 × 2 layers.

Each query includes current RGBA, its mirrored and cross-layer counterparts, cube coordinates, face, and layer identity. Candidate projections supply local RGB, foreground, semantics, and face probabilities from both head views. Even a currently empty outer texel can read potential image evidence. Attention supplies whole-head context, and local neighborhood inputs accommodate small shifts in generated images.

The decoder learns three related decisions:

1. **Preserve or edit:** explicitly decide whether each texel needs a change, correcting omissions and additions while penalizing damage to already-correct texels.
2. **Occupancy and color:** directly supervise final outer alpha, color-edit gates, and RGB corrections. Body texels, invalid UV regions, and inner alpha are structurally preserved.
3. **Material correspondence:** learn whether mirrored or cross-layer locations should share color, tying RGB only within predicted connected groups while allowing asymmetry, partial links, and genuine openings.

Inference reads images and automatic UVs, not training annotations, identities, or filenames for lookup corrections. This learned branch can edit outer head geometry, so the earlier claim that all outer texels must remain as initially sampled by the parser no longer describes the final output.

### 4.4 v104: Learn Actual Neighbors Across Cube Faces

v104 adds `HeadTopologyContext` to the final decoder. It aggregates neighbors within the same cube face separately from neighbors across real seams, then passes both contexts and the original features through a learned residual module. It does not connect unrelated UV islands just because they happen to touch in the PNG atlas.

The new module's last layer is zero-initialized. Loading the revised v103 weights initially produces bit-identical predictions; cross-face relationships are then learned through training. Supervision adds:

- **A ground-truth boundary loss:** GT alpha identifies whether neighboring texels should connect or differ, teaching both continuous brims and real openings without forcing all neighbors to match.
- **Connected-region perturbations:** missing or spurious outer patches grow along actual cube neighbors, teaching recovery of errors across seams rather than only isolated pixel noise.

v104 also adds `mask_unknown_relations`. Unannotated material relationships without a color conflict are excluded from negative supervision. Two visible targets with different colors remain clear negatives, while positives require semantic annotation. This avoids teaching unknown relationships as disconnected or forcing beard links solely because colors match.

## 5. Color Recovery: Grid Sampling and Final Material Fitting

The initial UV still uses `grid_mode`: count actual 8-bit RGB values among safe projected source pixels and choose the most supported color, using UV-center distance only to break ties. This avoids averaging foreground and background into an intermediate color absent from the input.

Final head geometry edits change visibility. Removing a wrongly added outer hair texel, for example, exposes an inner color that was previously hidden. Keeping its pre-edit color can leave a patch on the forehead even when alpha is correct.

The paired v104 configuration therefore performs 64 steps of final head material fitting after all learned geometry edits:

1. Recompute visibility from final alpha and fit head RGB to confident source pixels in both views.
2. Apply learned color ownership and boundary exclusions with `final_head_material_protect_inner_footprints=True`. Project accessory conflicts back to the complete sampling footprint of each inner UV texel, preventing residual green headphone samples from recoloring inner hair after only some classified accessory pixels were excluded.
3. Restore predicted mirror and cross-layer material links. Accept the fitted result only if source-image reconstruction error strictly decreases after color sharing.

This step preserves alpha and the body. It retains the original colors when confident head sources are absent or error fails to decrease. Final RGB can include learned corrections and optimization, so it is no longer valid to claim every output color is a byte-for-byte input mode. The process remains constrained by image evidence; a general generative completion model for arbitrary unseen textures has not been connected.

## 6. Where Deterministic Inner Completion Fits

`simple_inpainting` still provides explainable inner-layer completion for the initial partial UV. It follows part and cube topology: front/back faces fill in rings from border to center, side faces advance inward by row, and top/bottom faces fill from their edges.

A missing texel first seeks a same-part mirrored source, then a nearby same-part color in 3D. Side faces prefer the same row, and newly filled texels can propagate further. With no same-part evidence, a texel remains transparent; color is never copied from head to torso or across other parts. Mirroring is a completion heuristic at this stage, not proof that the real texture is symmetric.

This module itself never creates, deletes, or modifies outer texels. Confirmed outer colors may supply same-part inner vacancies, but its output is intermediate. The full candidate subsequently applies hidden head material handling, learned final head UV correction, and final RGB fitting. The final skin therefore no longer equals the output of `simple_inpainting` alone.

Debugging should compare the initial observed UV, inner completion, final head alpha, and final material separately. A continuous-looking render does not establish correctness at every texel. A larger texel count also does not prove hair recovery: added texels may be on the wrong face.

## 7. v104 Training, Selection, and Measured Results

### 7.1 Training Scope and Identity Separation

v104 starts from the reviewed revised v103, freezing the parent model and training only the final head decoder. It adds 448 training source identities: 384 retain native textures, and 64 supply matched no-accessory/glasses/headphone examples. Another 80 validation and 80 test identities are added. Matched examples change only accessories, preserving face, hair, and beard.

The final synthetic cache is shown below. An “image” is one two-view sample, not necessarily a distinct identity:

| Split | Synthetic images | Normalized UV source identities |
| :--- | ---: | ---: |
| Training | 1120 | 928 |
| Validation | 248 | 200 |
| Test | 112 | 80 |

The splits are disjoint after normalized RGBA content deduplication. Separation applies to this decoder training; it does not establish that these identities never appeared in historical training of the frozen parent. Older caches replay parent-pipeline errors. New data use the current frozen parent pipeline, with geometry-preserving lighting, blur, and color perturbations on half of the added training identities.

Three existing locally annotated real identities are sampled separately. The two latest eye/hair feedback images do not enter gradient training, but inform development decisions. They and the other real development images are not an independent blind test.

### 7.2 Training Configuration and Checkpoint Selection

| Item | v104 configuration |
| :--- | :--- |
| Optimizer / initial learning rate | AdamW / 8e-5 |
| Training length / batch | 6000 steps / 8 |
| Trainable parameters | Final head decoder only; all parent weights frozen |
| Native-texture sampling fraction parameter | 0.7 |
| Paired and real local supervision | One matched accessory group every 4 steps; at most one existing real training identity every 2 steps |
| Per-texel incorrect-edit risk weight | 5, normalized over all outer texels |
| Boundary loss weight | 0.5 |
| Selected checkpoint | Step 5000 |

Validation distinguishes regions with candidate projection coverage from those without it, weighting errors by 1 and 0.2 respectively, with an additional 0.25 factor for old-cache replay. The underside of the head lacks evidence in these views and should not obscure changes around visible hair and eyes. This weighting affects evaluation and selection only; it is not an inference filling rule.

Step 200 failed an existing beard check and was excluded. Among eligible candidates, step 5000 had the lowest weighted validation error: 1881.25 → 1722.80, an 8.42% reduction. The latest checkpoint at step 6000 was therefore not automatically selected.

### 7.3 Held-Out Test: Visible Gains and Underside Regression

Only after validation selection and real-image visual review was the pre-locked 112-image synthetic test set opened: 64 native skins plus no-accessory, glasses, and headphone variants of 16 identities. Weights were not reselected after testing. The table measures final outer-head geometry against **revised v103**:

| Test region | v103 IoU | v104 IoU | Added in error, v103 → v104 | Missed texels, v103 → v104 |
| :--- | ---: | ---: | ---: | ---: |
| Native skins, view-covered | 86.63% | 87.62% | 370 → 337 | 481 → 447 |
| Native skins, unobserved head underside | 43.94% | 37.56% | 71 → 90 | 396 → 442 |
| Native skins, full head | 81.69% | 81.69% | 441 → 427 | 877 → 889 |
| Matched accessories, full head | 97.49% | 97.75% | 72 → 70 | 34 → 25 |
| Matched accessories, view-covered | 97.31% | 97.44% | 66 → 70 | 34 → 25 |

Total errors in visible native-skin regions decrease by 7.87%. However, full-head native IoU is precisely 0.816944 → 0.816866: essentially unchanged and slightly lower. Visible accessory false additions also increase by 4 texels. The head underside clearly regresses; not every metric improves.

These are identity-separated synthetic renders, not accuracy measurements on real generated images with human per-texel ground truth. Both candidates use the same frozen parent-pipeline cache to evaluate final alpha. Final color fitting cannot change alpha, so this table is not an RGB quality score either.

### 7.4 Real-Image Review and Candidate Status

The complete pipeline was rerun on 43 original images: 3 training-fit checks and 40 real development images without gradient use. Review covered front/back renders, raw head UVs, and outer-alpha differences:

- The headphone/microphone feedback case retains zero false additions in the specified eye region.
- In the hair feedback case, retained texels against a 96-texel v101 historical reference rise from 77 to 85, with zero texels outside that reference. The historical output is not human ground truth.
- Existing scoped beard, nose, crown, headphone-color, glasses-forehead, and four-face brim checks pass.
- All 43 bodies are byte-identical to revised v103. Across 19 repeated full inferences, alpha and body are identical; visible RGB is identical in 17 cases and differs by at most 1/255 per channel in 2.

Visual review still finds isolated side/back/top texels in complex hairstyles and blurred hat lettering. Some added outer underside texels have no input-view support, so front/back renders cannot establish their correctness.

The model is consequently recorded as `reviewed_candidate_with_known_limitations`. At the source revision used for this article, it has not replaced the global default model. Reproduction requires pinning `parser.pt`, the paired `pipeline.json`, and the foreground model together. Replacing parser weights alone does not reproduce final color protection and related behavior.

Configuration, selection, and detailed results are recorded in the [v104 training and review report](https://github.com/EntropyDrop/SkingToolkit/blob/43e676d8231fd3417d86721edb4ef4cef3dda40d/dense_uv_parser/V104_TRAINING.md).

## 8. Batch Export and Result Provenance

The v104 branch adds `run_all_edited_v104.py`, recursively processing `*_edited.png` into sibling `*_result_v104.png` files, each a 64×64 RGBA skin. It pins the reviewed step-5000 candidate and paired pipeline, with two workers by default.

Every job snapshots code, models, configuration, input lists, and hashes. Existing v104 outputs are backed up before atomic replacement; original inputs and other versions remain intact. After interruption, the same job can resume, rechecking completed outputs and skipping those that pass verification instead of mixing versions as workspace code changes.

`progress.json` records progress, `results.jsonl` records per-image provenance and output hashes, and `final_audit.json` records final protection and format checks. Availability of the batch tool does not mean every image has finished or passed semantic review. Correct provenance does not establish correct hair, beard, or accessories at every texel. See the [v104 batch export documentation](https://github.com/EntropyDrop/SkingToolkit/blob/43e676d8231fd3417d86721edb4ef4cef3dda40d/dense_uv_parser/regression/v104_batch/README.md).

## 9. Current Limitations and Next Steps

- **View dependence.** Fixed projections cannot rescue major pose, perspective, or proportion changes, and the pipeline remains centered on Steve geometry.
- **Closed-source Stage One.** Hallucinated backs, missing accessories, and incorrect proportions propagate into reconstruction. Collecting original-image/render/UV triples remains an important route toward removing this dependency.
- **Weak constraints on unseen regions.** v104's underside regression shows that cross-face context cannot replace actual view evidence. Additional useful views or more conservative outer predictions without evidence need separate investigation.
- **Real semantic generalization remains unresolved.** Complex hair, occlusion, and rare accessories need broader real UV annotation. Local improvements on three training identities and reused development cases cannot substitute for new tests.
- **Color and structure need separate review.** Correct alpha does not imply correct material, and a plausible render does not prove UV face or layer correctness. Final fitting improves source-image reconstruction error, not proof of the complete true texture.

The two-stage approach remains, while Stage Two has grown from hard routing, sampling, and inner completion into a combination of geometric candidates, learned foreground, joint head semantics, final UV decoding, and visible-material fitting. v104 demonstrates a limited improvement in visible head regions. Further progress requires complex-hair and accessory ground truth, alongside better observations and evaluation for uncovered surfaces.

## References and Further Reading

- [SkingToolkit v104 training, selection, and review](https://github.com/EntropyDrop/SkingToolkit/blob/43e676d8231fd3417d86721edb4ef4cef3dda40d/dense_uv_parser/V104_TRAINING.md): the source for this article’s version and metrics.
- [Minecraft foreground model](https://github.com/EntropyDrop/SkingToolkit/blob/43e676d8231fd3417d86721edb4ef4cef3dda40d/dense_uv_parser/FOREGROUND.md): separate foreground training and silhouette/color-source masks.
- [Revised v103 semantics and material protection](https://github.com/EntropyDrop/SkingToolkit/blob/43e676d8231fd3417d86721edb4ef4cef3dda40d/dense_uv_parser/V103_GENERALIZATION.md): parent-pipeline corrections retained by v104.

- [From Reference Image to Minecraft Skin: A Generative Model Training Practice](/public/blog/skingen): our previous work, covering the image-to-image LoRA and composite target image approach.
- [Minecraft Wiki: Skin](https://minecraft.wiki/w/Skin): Minecraft skin UV, inner/outer layer, and transparency documentation.
- [SigLIP 2: Multilingual Vision-Language Encoders with Improved Semantic Understanding, Localization, and Dense Features](https://arxiv.org/abs/2502.14786): the frozen vision semantic backbone used by the current parser.
- [BLOCK: An Open-Source Bi-Stage MLLM Character-to-Skin Pipeline for Minecraft](https://arxiv.org/abs/2603.03964): an open-source two-stage approach using front/back preview synthesis and a generative atlas decoder.

## Participate and Project Links

- Online generator: [https://entropydrop.com/skin/generate](https://entropydrop.com/skin/generate)
- Hugging Face model: [https://huggingface.co/EntropyDrop/Sking](https://huggingface.co/EntropyDrop/Sking)
- GitHub: [https://github.com/EntropyDrop](https://github.com/EntropyDrop)
- Discord: [https://discord.gg/ByX7TwqDcw](https://discord.gg/ByX7TwqDcw)
