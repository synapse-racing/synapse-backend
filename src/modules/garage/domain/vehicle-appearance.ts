export interface VehicleAppearance {
  modelId: 'formula' | 'gt' | 'prototype';
  primaryColor: string;
  secondaryColor: string;
  rimColor: string;
  finish: 'matte' | 'satin' | 'metallic';
  livery: 'solid' | 'stripe' | 'split';
  number: number;
}
export const defaultAppearance: Readonly<VehicleAppearance> = Object.freeze({
  modelId: 'formula',
  primaryColor: '#ff692f',
  secondaryColor: '#f4ead3',
  rimColor: '#d7dce0',
  finish: 'satin',
  livery: 'solid',
  number: 7,
});
export function parseAppearance(value: unknown): VehicleAppearance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    !['formula', 'gt', 'prototype'].includes(v.modelId as string) ||
    !['matte', 'satin', 'metallic'].includes(v.finish as string) ||
    !['solid', 'stripe', 'split'].includes(v.livery as string)
  )
    return null;
  if (
    ![v.primaryColor, v.secondaryColor, v.rimColor].every(
      (color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color),
    )
  )
    return null;
  if (
    typeof v.number !== 'number' ||
    !Number.isInteger(v.number) ||
    v.number < 1 ||
    v.number > 99
  )
    return null;
  return {
    modelId: v.modelId as VehicleAppearance['modelId'],
    primaryColor: (v.primaryColor as string).toLowerCase(),
    secondaryColor: (v.secondaryColor as string).toLowerCase(),
    rimColor: (v.rimColor as string).toLowerCase(),
    finish: v.finish as VehicleAppearance['finish'],
    livery: v.livery as VehicleAppearance['livery'],
    number: v.number,
  };
}
export interface AppearanceProfile {
  appearance: VehicleAppearance;
  customized: boolean;
}
