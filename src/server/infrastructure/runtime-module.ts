import { createRequire } from "node:module";

export type UnknownRecord = Record<PropertyKey, unknown>;

const requireFromRuntime = createRequire(import.meta.url);

export const isUnknownRecord = (value: unknown): value is UnknownRecord =>
  (typeof value === "object" || typeof value === "function") && value !== null;

export const loadRuntimeModule = (moduleName: string): UnknownRecord => {
  const loadedModule: unknown = requireFromRuntime(moduleName);

  if (!isUnknownRecord(loadedModule)) {
    throw new Error(`${moduleName} did not expose an object module.`);
  }

  return loadedModule;
};

export const readRuntimeConstructor = <TConstructor extends abstract new (
  ...args: never[]
) => unknown>(
  moduleRecord: UnknownRecord,
  exportName: string,
): TConstructor => {
  const exportedValue = moduleRecord[exportName];

  if (typeof exportedValue !== "function") {
    throw new Error(`Runtime module export ${exportName} is not a constructor.`);
  }

  return exportedValue as TConstructor;
};
