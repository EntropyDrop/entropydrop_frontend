import React from 'react';
import type { SpaceApiKeyRecord } from '../../../bootstrap/SpaceApiKeyClient.ts';
import {
  DISTANT_SURFACE_SETTING_LIMITS,
  type DistantSurfaceDistanceSettingKey,
  type DistantSurfaceEnabledSettingKey,
} from '../../../engine/render/DistantSurfaceLayer.ts';
import { spaceUiStore } from '../store/SpaceUiStore.ts';
import { useSpaceUi } from '../store/useSpaceUi.ts';

const DISTANT_LOD_CONTROLS: ReadonlyArray<{
  distanceKey: DistantSurfaceDistanceSettingKey;
  enabledKey: DistantSurfaceEnabledSettingKey;
  label: string;
  description: string;
}> = [
  { distanceKey: 'lod2Distance', enabledKey: 'lod2Enabled', label: '2m Samples', description: 'Highest-detail snapshot radius' },
  { distanceKey: 'lod4Distance', enabledKey: 'lod4Enabled', label: '4m Samples', description: '4m → 8m transition distance' },
  { distanceKey: 'lod8Distance', enabledKey: 'lod8Enabled', label: '8m Samples', description: '8m → 16m transition distance' },
  { distanceKey: 'lod16Distance', enabledKey: 'lod16Enabled', label: '16m Samples', description: '16m → 32m transition distance' },
  { distanceKey: 'lod32Distance', enabledKey: 'lod32Enabled', label: '32m Samples', description: '32m → 64m transition distance' },
];

function ModalBackdrop({ id, className = '', children, onClose }: { id: string; className?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div id={id} className={`custom-modal open ${className}`} onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      {children}
    </div>
  );
}

function SpaceApiKeysSettings() {
  const client = spaceUiStore.getApiKeyClient();
  const [keys, setKeys] = React.useState<SpaceApiKeyRecord[]>([]);
  const [name, setName] = React.useState('My external agent');
  const [allowRun, setAllowRun] = React.useState(false);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const load = React.useCallback(async () => {
    if (!client) return;
    try {
      setKeys(await client.list());
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Could not load API keys.');
    }
  }, [client]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!client || !name.trim() || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const created = await client.create(name.trim(), allowRun);
      setSecret(created.api_key);
      setName('My external agent');
      setAllowRun(false);
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'Could not create API key.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (apiKey: SpaceApiKeyRecord) => {
    if (!client || busy) return;
    if (!window.confirm(`Revoke API key “${apiKey.name}”? External agents using it will stop working immediately.`)) return;
    setBusy(true);
    setMessage('');
    try {
      await client.revoke(apiKey.id);
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'Could not revoke API key.');
    } finally {
      setBusy(false);
    }
  };

  if (!client) {
    return <div className="settings-api-empty">Sign in and enter online Space to manage API keys.</div>;
  }

  return (
    <div className="settings-api-keys">
      <div className="settings-api-create">
        <input
          className="settings-api-name"
          value={name}
          maxLength={80}
          aria-label="API key name"
          onChange={event => setName(event.target.value)}
          placeholder="Key name"
        />
        <label className="settings-api-scope">
          <input type="checkbox" checked={allowRun} onChange={event => setAllowRun(event.target.checked)} />
          Allow created entities to run
        </label>
        <button className="small-btn primary" disabled={busy || !name.trim()} onClick={() => void create()}>
          {busy ? 'Working…' : 'Create key'}
        </button>
      </div>
      {secret ? (
        <div className="settings-api-secret">
          <strong>Copy this key now. It will not be shown again.</strong>
          <div className="settings-api-secret-row">
            <input readOnly value={secret} aria-label="New Space API key" onFocus={event => event.currentTarget.select()} />
            <button className="small-btn" onClick={() => {
              if (!navigator.clipboard?.writeText) {
                setMessage('Clipboard access is unavailable. Select the key and copy it manually.');
                return;
              }
              void navigator.clipboard.writeText(secret).then(
                () => setMessage('API key copied.'),
                () => setMessage('Copy failed. Select the key and copy it manually.'),
              );
            }}>Copy</button>
          </div>
        </div>
      ) : null}
      {message ? <div className="settings-api-message" role="status">{message}</div> : null}
      <div className="settings-api-list">
        {keys.length === 0 ? <div className="settings-api-empty">No API keys yet.</div> : keys.map(apiKey => (
          <div className="settings-api-key" key={apiKey.id}>
            <div>
              <div className="settings-api-key-name">{apiKey.name}</div>
              <div className="settings-api-key-meta">
                <code>{apiKey.key_prefix}…</code>
                <span>{apiKey.scopes.includes('space:entity:run') ? 'create + run' : 'create only'}</span>
                <span>Last used: {apiKey.last_used_at ? new Date(apiKey.last_used_at).toLocaleString() : 'never'}</span>
              </div>
            </div>
            <button className="small-btn settings-api-revoke" disabled={busy} onClick={() => void revoke(apiKey)}>Revoke</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GlobalSettingsModal() {
  const state = useSpaceUi(snapshot => snapshot);
  if (state.activeModal !== 'settings') return null;
  const distantLodDisabled = state.worldShapeMode === 'earth';
  return (
    <ModalBackdrop id="global-settings-modal" onClose={() => spaceUiStore.toggleGlobalSettingsModal(false)}>
      <div className="modal-content settings-modal-content">
        <div className="modal-header"><h2>Global Settings</h2><button id="close-global-settings-btn" tabIndex={-1} className="icon-btn" style={{ width: 28, height: 28, fontSize: 13 }} title="Close settings (ESC)" onClick={() => spaceUiStore.toggleGlobalSettingsModal(false)}>✕</button></div>
        <div className="modal-sub">Configure camera, perspective, and world preferences</div>
        <div className="settings-section">
          <div className="settings-section-title">CAMERA &amp; VIEW</div>
          <div className="settings-row">
            <div className="settings-label-group"><span className="settings-label">Field of View (FOV)</span><span className="settings-desc">Camera lens angle (50° ~ 110°)</span></div>
            <div className="settings-control-group"><input id="setting-fov-slider" className="settings-slider" type="range" min="50" max="110" step="1" value={state.fov} onChange={event => spaceUiStore.setFov(Number(event.target.value))} /><span id="setting-fov-val" className="settings-value-badge">{state.fov}°</span></div>
          </div>
          <div className="settings-row">
            <div className="settings-label-group"><span className="settings-label">Perspective</span><span className="settings-desc">Cycle First, Third Back, and Third Front views (F3)</span></div>
            <div className="settings-segmented-control" id="setting-perspective-group">
              {([
                ['first_person', '1st Person'],
                ['third_person', '3rd Back'],
                ['third_person_front', '3rd Front']
              ] as const).map(([value, label]) => <button key={value} tabIndex={-1} className={`segment-btn ${state.perspective === value ? 'active' : ''}`} onClick={() => spaceUiStore.setPerspective(value)}>{label}</button>)}
            </div>
          </div>
          <div className="settings-row" id="setting-cam-dist-row" style={{ display: state.perspective === 'first_person' ? 'none' : 'flex' }}>
            <div className="settings-label-group"><span className="settings-label">Third Person Distance</span><span className="settings-desc">Camera offset distance from player</span></div>
            <div className="settings-control-group"><input id="setting-cam-dist-slider" className="settings-slider" type="range" min="2" max="8" step="0.5" value={state.cameraDistance} onChange={event => spaceUiStore.setCameraDistance(Number(event.target.value))} /><span id="setting-cam-dist-val" className="settings-value-badge">{state.cameraDistance.toFixed(1)} m</span></div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-title">WORLD &amp; ENVIRONMENT</div>
          <div className="settings-row">
            <div className="settings-label-group"><span className="settings-label">World Shape</span><span className="settings-desc">Switch between a spherical horizon and the original ring world</span></div>
            <div className="settings-segmented-control" id="setting-world-shape-group">
              {([
                ['earth', 'Earth Mode'],
                ['torus', 'Donut Mode']
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  tabIndex={-1}
                  className={`segment-btn ${state.worldShapeMode === value ? 'active' : ''}`}
                  aria-pressed={state.worldShapeMode === value}
                  onClick={() => spaceUiStore.setWorldShapeMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-title">PERFORMANCE</div>
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Shadows</span>
              <span className="settings-desc">Render real-time sunlight shadows{state.shadowsEnabled && state.resolutionEffectsQuality === 'reduced' ? ' · temporarily paused by Auto resolution' : ''}</span>
            </div>
            <div className="settings-segmented-control" id="setting-shadows-group">
              {([
                [true, 'Enabled'],
                [false, 'Disabled']
              ] as const).map(([value, label]) => (
                <button
                  key={String(value)}
                  tabIndex={-1}
                  className={`segment-btn ${state.shadowsEnabled === value ? 'active' : ''}`}
                  aria-pressed={state.shadowsEnabled === value}
                  onClick={() => spaceUiStore.setShadowsEnabled(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row settings-resolution-row">
            <div className="settings-label-group">
              <span className="settings-label">Render Resolution</span>
              <span className="settings-desc">Auto targets 120 FPS · currently {Math.round(state.resolutionScale * 100)}% ({state.resolutionPixelRatio.toFixed(2)}× pixel ratio){state.resolutionEffectsQuality === 'reduced' ? ' · effects reduced' : ''}</span>
            </div>
            <div className="settings-segmented-control settings-resolution-control" id="setting-resolution-group">
              {([
                ['auto', 'Auto'],
                ['1', '100%'],
                ['0.8', '80%'],
                ['0.67', '67%'],
                ['0.5', '50%']
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  tabIndex={-1}
                  className={`segment-btn ${state.resolutionScaleMode === value ? 'active' : ''}`}
                  aria-pressed={state.resolutionScaleMode === value}
                  onClick={() => spaceUiStore.setResolutionScale(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-label-group"><span className="settings-label">Chunk Render Distance</span><span className="settings-desc">Voxel terrain mesh streaming radius (4 ~ 20 chunks)</span></div>
            <div className="settings-control-group"><input id="setting-render-dist-slider" className="settings-slider" type="range" min="4" max="20" step="1" value={state.renderDistance} onChange={event => spaceUiStore.setRenderDistance(Number(event.target.value))} /><span id="setting-render-dist-val" className="settings-value-badge">{state.renderDistance} Chunks</span></div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-title">
            DISTANT TERRAIN LOD{distantLodDisabled ? ' · OFF IN EARTH MODE' : ''}
          </div>
          {DISTANT_LOD_CONTROLS.map(({ distanceKey, enabledKey, label, description }) => {
            const limits = DISTANT_SURFACE_SETTING_LIMITS[distanceKey];
            const enabled = !distantLodDisabled && state.distantSurfaceSettings[enabledKey];
            return (
              <div className="settings-row" key={distanceKey}>
                <div className="settings-label-group">
                  <span className="settings-label">{label}</span>
                  <span className="settings-desc">{description} · thresholds remain at least 50m apart</span>
                </div>
                <div className="settings-control-group">
                  <button
                    className={`mini-toggle-btn ${enabled ? 'active' : ''}`}
                    aria-pressed={enabled}
                    disabled={distantLodDisabled}
                    onClick={() => spaceUiStore.setDistantSurfaceSetting(enabledKey, !enabled)}
                  >
                    {enabled ? 'ON' : 'OFF'}
                  </button>
                  <input
                    id={`setting-${distanceKey}-slider`}
                    className="settings-slider"
                    type="range"
                    min={limits.min}
                    max={limits.max}
                    step={limits.step}
                    value={state.distantSurfaceSettings[distanceKey]}
                    disabled={!enabled || distantLodDisabled}
                    onChange={event => spaceUiStore.setDistantSurfaceSetting(distanceKey, Number(event.target.value))}
                  />
                  <span className="settings-value-badge">{state.distantSurfaceSettings[distanceKey]} m</span>
                </div>
              </div>
            );
          })}
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">64m Samples</span>
              <span className="settings-desc">Coarsest tier, used after the 32m threshold up to the surface limit</span>
            </div>
            <div className="settings-control-group">
              <button
                className={`mini-toggle-btn ${!distantLodDisabled && state.distantSurfaceSettings.lod64Enabled ? 'active' : ''}`}
                aria-pressed={!distantLodDisabled && state.distantSurfaceSettings.lod64Enabled}
                disabled={distantLodDisabled}
                onClick={() => spaceUiStore.setDistantSurfaceSetting(
                  'lod64Enabled',
                  !state.distantSurfaceSettings.lod64Enabled,
                )}
              >
                {!distantLodDisabled && state.distantSurfaceSettings.lod64Enabled ? 'ON' : 'OFF'}
              </button>
              <span className="settings-value-badge">64 m</span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Far Surface Limit</span>
              <span className="settings-desc">Render no snapshot terrain beyond this distance</span>
            </div>
            <div className="settings-control-group">
              <input
                id="setting-far-surface-limit-slider"
                className="settings-slider"
                type="range"
                min={Math.max(
                  DISTANT_SURFACE_SETTING_LIMITS.maxDistance.min,
                  state.distantSurfaceSettings.lod32Distance + 50,
                )}
                max={DISTANT_SURFACE_SETTING_LIMITS.maxDistance.max}
                step={DISTANT_SURFACE_SETTING_LIMITS.maxDistance.step}
                value={state.distantSurfaceSettings.maxDistance}
                disabled={distantLodDisabled}
                onChange={event => spaceUiStore.setDistantSurfaceSetting('maxDistance', Number(event.target.value))}
              />
              <span className="settings-value-badge">{state.distantSurfaceSettings.maxDistance} m</span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-label">Neighbor Connections</span>
              <span className="settings-desc">Connect height differences up to this distance; 0 disables connections</span>
            </div>
            <div className="settings-control-group">
              <input
                id="setting-connection-distance-slider"
                className="settings-slider"
                type="range"
                min={DISTANT_SURFACE_SETTING_LIMITS.connectionDistance.min}
                max={DISTANT_SURFACE_SETTING_LIMITS.connectionDistance.max}
                step={DISTANT_SURFACE_SETTING_LIMITS.connectionDistance.step}
                value={state.distantSurfaceSettings.connectionDistance}
                disabled={distantLodDisabled}
                onChange={event => spaceUiStore.setDistantSurfaceSetting('connectionDistance', Number(event.target.value))}
              />
              <span className="settings-value-badge">
                {state.distantSurfaceSettings.connectionDistance === 0
                  ? 'Off'
                  : `${state.distantSurfaceSettings.connectionDistance} m`}
              </span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-label-group">
              <span className="settings-desc">Recommended: all tiers on · 400 / 600 / 800 / 1000 / 1600m · full-world limit · connections 4000m</span>
            </div>
            <button className="small-btn" disabled={distantLodDisabled} onClick={() => spaceUiStore.resetDistantSurfaceSettings()}>
              Reset Recommended
            </button>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-title">AUDIO &amp; SOUND</div>
          <div className="settings-row">
            <div className="settings-label-group"><span className="settings-label">Mute Audio</span><span className="settings-desc">Disable all procedural sound effects and mechanical audio</span></div>
            <div className="settings-segmented-control" id="setting-mute-group">
              {([
                [false, 'Sound ON'],
                [true, 'Muted']
              ] as const).map(([value, label]) => (
                <button
                  key={String(value)}
                  tabIndex={-1}
                  className={`segment-btn ${state.isMuted === value ? 'active' : ''}`}
                  onClick={() => spaceUiStore.setMuted(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-title">EXTERNAL AGENT API</div>
          <div className="settings-desc">Long-lived account keys can create validated entities in any Space world you can access. Keep them secret and revoke unused keys.</div>
          <SpaceApiKeysSettings />
        </div>
      </div>
    </ModalBackdrop>
  );
}

export function PauseScreen() {
  const hasStarted = useSpaceUi(state => state.hasStarted);
  return (
    <div id="pause-screen" className={hasStarted ? 'hidden' : ''}>
      <div className="hero-box">
        <div className="hero-block-icon">■</div>
        <h1 className="game-logo">EntropyDrop · Space <span className="game-logo-beta">BETA</span></h1>
        <div className="controls-guide">
          <span><kbd className="key-badge">W</kbd><kbd className="key-badge">A</kbd><kbd className="key-badge">S</kbd><kbd className="key-badge">D</kbd> Move / Drive</span>
          <span><kbd className="key-badge">Space</kbd> Jump / Ascend</span>
          <span><kbd className="key-badge">Shift+1-9</kbd> Palette color / Backpack slot</span>
          <span><kbd className="key-badge">E</kbd> Backpack / Set colors</span>
          <span><kbd className="key-badge">1</kbd> Shovel: remove / place 1m blocks</span>
          <span><kbd className="key-badge">2</kbd> Spoon: micro-carve 5x5x5</span>
          <span><kbd className="key-badge">3</kbd> Selector: box select (max 64×64×64) · Tab standard/micro blocks · R copy</span>
          <span><kbd className="key-badge">4</kbd> Hammer: LMB build / attach to entity · RMB rotate 90°</span>
          <span><kbd className="key-badge">5</kbd> Wrench: show pivot XYZ axes · hold LMB to grab · RMB start/stop</span>
          <span><kbd className="key-badge">6</kbd> Brush: paint / right-click sample · Tab micro/standard</span>
          <span><kbd className="key-badge">Shift+Click</kbd> Multi-select component blocks</span>
          <span><kbd className="key-badge">C</kbd> Entity editor</span>
          <span><kbd className="key-badge">G</kbd> Assemble physics entity</span>
          <span><kbd className="key-badge">V</kbd> Mount / leave entity seat</span>
          <span><kbd className="key-badge">F</kbd> Fly mode</span>
          <span><kbd className="key-badge">F3</kbd> Cycle 1st / 3rd Back / 3rd Front</span>
          <span><kbd className="key-badge">ESC</kbd> Settings / release cursor</span>
        </div>
        <button id="start-btn" tabIndex={-1} className="start-btn" onClick={() => spaceUiStore.startGame()}>Enter Space</button>
      </div>
    </div>
  );
}
