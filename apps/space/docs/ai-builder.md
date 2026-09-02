# HUD AI Builder

The HUD AI Builder is separate from the Entity Script API. A model produces a declarative `SpaceBuildPlan`; the engine validates it, renders a hologram, and waits for explicit player confirmation before changing the world.

## Flow

1. Aim at a placement surface and open **AI BUILD** in the HUD.
2. Describe a world structure or physics entity.
3. The model returns a BuildPlan JSON object.
4. `SpaceBuilder.validate()` expands primitives and checks grids, bounds, occupancy, component references, scripts, constraints, world height, and player overlap.
5. `SpaceBuilder.preview()` reuses the Hammer hologram renderer without mutating the world.
6. Player confirmation calls `SpaceBuilder.commit()`.
7. Large plans commit in bounded frame slices and respect terrain-sync backpressure. Cancel rolls back admitted structure voxels; completed builds can be undone.

## BuildPlan V1

```ts
interface SpaceBuildPlan {
  version: 1;
  kind: 'structure' | 'entity';
  name: string;
  anchor: 'crosshair' | [number, number, number];
  blocks?: Array<{
    x: number;
    y: number;
    z: number;
    size?: 1 | 0.2;
    color?: number | '#RRGGBB';
    componentId?: string;
  }>;
  primitives?: Array<{
    type: 'box' | 'line';
    from: [number, number, number];
    to: [number, number, number];
    hollow?: boolean;
    size?: 1 | 0.2;
    color?: number | '#RRGGBB';
    componentId?: string;
  }>;
  components?: BuildComponent[];
  constraints?: BuildConstraint[];
}
```

`structure` plans write ordinary world voxels. `entity` plans are converted into the existing serialized Entity slot format and registered through `ContraptionManager.buildFromSlot()`.

Limits match the portable inventory/entity format: 65,536 voxels, 64 metres per axis, 64 components, hierarchy depth 16, 256 constraints, 64 KiB per script, and 512 KiB of scripts per entity.

## Runtime service

```ts
builder.validate(plan)
builder.preview(plan)
builder.getRenderPreview()
builder.commit(plan?)
builder.getJob(jobId?)
builder.cancel(jobId?)
builder.undo(commitId?)
builder.getHistory()
```

Queued jobs expose preparation, application, backpressure, rollback, completion, failure, and cancellation phases. World writes use the canonical `BasicActions` path with actor source `agent`; Entity builds reuse the existing hierarchy, physics, persistence, and script sandbox.
