import * as THREE from 'three';
import { assemblySockets, normalizeAssemblySettings } from '../../../shared/assemblySettings.js';
import type { BuildOptions, Vec3 } from '../types/index.js';
import type { CutterWithToken } from './csg.js';
import { CUT_TOKEN, CUTTER_COLORS } from './tokens.js';

/** Construct the same millimetre sockets that are punched into the print masks. */
export function assemblyCutters(partIndex: number, center: Vec3, opts: BuildOptions): Array<CutterWithToken & { label: string; color: string }> {
  const settings = normalizeAssemblySettings(opts.assemblySettings, !!opts.cuteMode, opts.modelScale);
  return assemblySockets(partIndex, settings, !!opts.isAlex, !!opts.cuteMode, opts.modelScale).map(socket => {
    const geometry = new THREE.CylinderGeometry(socket.radius, socket.radius, socket.length, 96);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...socket.normal));
    geometry.applyQuaternion(rotation);
    geometry.translate(...socket.center.map((value, i) => value + center[i]) as Vec3);
    geometry.clearGroups();
    geometry.addGroup(0, geometry.index!.count, 0);
    return { geometry, token: CUT_TOKEN, label: socket.label, color: partIndex === 0 || socket.id === 'torsoTop' ? CUTTER_COLORS.neck : CUTTER_COLORS.connector };
  });
}
